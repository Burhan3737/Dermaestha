// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { env } from '../../config/env/env.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import * as appointmentState from '../appointment/service.js';
import * as notification from '../notification/service.js';
import * as analytics from '../analytics/service.js';
import * as self from './service.js';
import { logger } from '../../lib/logger/logger.js';
import * as audit from '../../services/audit/audit.service.js';
import {
  RECONCILIATION_LOOKBACK_H,
  RECONCILIATION_MIN_AGE_MIN,
} from '../../config/constants.js';

/** Create (or reuse) the idempotent payment intent and return the hosted-checkout redirect. */
export async function createIntent({ patientUserId, appointmentId }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientUserId !== patientUserId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'slot_locked' || !appt.lockExpiresAt || appt.lockExpiresAt < new Date()) {
    throw new AppError(
      'LOCK_EXPIRED',
      'Your slot hold has expired. Please pick the slot again.',
      409,
    );
  }
  const doctor = await prisma.doctor.findUnique({
    where: { id: appt.doctorId },
    select: { fee: true },
  });
  const amount = doctor.fee;

  const payment = await prisma.payment.upsert({
    where: { intent_key: { patientUserId, slotStart: appt.slotStart } },
    update: {},
    create: { appointmentId, patientUserId, slotStart: appt.slotStart, amount, status: 'pending' },
  });

  const checkout = await paymentProvider.createCheckout({
    appointmentId,
    intentKey: `${patientUserId}:${appt.slotStart.toISOString()}`,
    amount,
    returnUrl: `${env.APP_BASE_URL}/pay/return?appt=${appointmentId}`,
    cancelUrl: `${env.APP_BASE_URL}/book/${appt.doctorId}`,
    notifyUrl: `${env.APP_BASE_URL}/api/webhooks/payfast`,
  });
  if (checkout.providerRef && checkout.providerRef !== payment.providerRef) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: checkout.providerRef },
    });
  }
  return { redirectUrl: checkout.redirectUrl };
}

/** Process a verified IPN. Source of truth for confirmation (#2). */
export async function processWebhook({ event, providerRef, amount, gatewayFee }) {
  const payment = await prisma.payment.findFirst({ where: { providerRef } });
  if (!payment) throw new AppError('NOT_FOUND', 'Unknown payment reference.', 404);

  if (event === 'payment.failed') {
    if (payment.status !== 'pending') return { ok: true }; // ignore late/replayed failure after success
    await markFailedAndReleaseLock(payment.id, payment.appointmentId);
    return { ok: true };
  }

  const appt = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
  if (!appt || appt.state === 'confirmed') return { ok: true }; // idempotent

  await self.confirmPaidAppointment({ payment, appointment: appt, amount, gatewayFee });
  return { ok: true };
}

/**
 * Failed-payment handling (Option B — no schema migration). Mark the intent `failed` and free the
 * held slot WITHOUT deleting the appointment: `Payment.appointment` is `ON DELETE RESTRICT` (no
 * cascade — prisma/schema.prisma), so deleting a slot_locked appointment while its pending Payment
 * still FK-references it raises P2003. Instead we force-expire the lock (a plain update, no FK
 * touched); the slot is then immediately reclaimable via lazy-expiry / reclaim-on-conflict (ADR-23).
 * The Payment is left as `failed` (terminal, not `pending`), so reconcileUnconfirmed skips it.
 */
async function markFailedAndReleaseLock(paymentId, appointmentId) {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'failed' } });
  await prisma.appointment.updateMany({
    where: { id: appointmentId, state: 'slot_locked' },
    data: { lockExpiresAt: new Date() },
  });
}

/** The single atomic confirm commit (#2): transition + payment success + outbox enqueue.
 *  Shared by the webhook path and the reconciliation path (F04.03). */
export async function confirmPaidAppointment({ payment, appointment, amount, gatewayFee }) {
  await prisma.$transaction(async (tx) => {
    await appointmentState.transition({
      appointmentId: appointment.id,
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: amount, lockExpiresAt: null },
      client: tx,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'success', gatewayFee: gatewayFee ?? null },
    });
    const [patient, doctor] = await Promise.all([
      tx.user.findUnique({
        where: { id: appointment.patientUserId },
        select: { email: true, fullName: true },
      }),
      tx.doctor.findUnique({
        where: { id: appointment.doctorId },
        select: { user: { select: { fullName: true } } },
      }),
    ]);
    await notification.enqueueBookingEmails({
      appointment,
      patient,
      doctorName: doctor.user.fullName,
      fee: amount,
      client: tx,
    });
  });
  // KPI #1 conversion event (doc 14 §6). Best-effort, fires for both the webhook and
  // reconciliation confirm paths; analytics.record never throws.
  await analytics.record({
    type: 'booking_confirmed',
    meta: { doctorId: appointment.doctorId, fee: amount },
  });
}

/**
 * Hourly safety net (F04.03): if a payment.success IPN was lost, query the gateway and
 * complete the same atomic commit; if the slot is no longer claimable, edge #6a — refund
 * the paying patient IN FULL (gross: platform fault, not a patient cancellation).
 */
export async function reconcileUnconfirmed(now = new Date()) {
  const newest = new Date(now.getTime() - RECONCILIATION_MIN_AGE_MIN * 60 * 1000);
  const oldest = new Date(now.getTime() - RECONCILIATION_LOOKBACK_H * 60 * 60 * 1000);
  const pending = await prisma.payment.findMany({
    where: {
      status: 'pending',
      providerRef: { not: null },
      createdAt: { lte: newest, gte: oldest },
    },
  });
  for (const p of pending) {
    // Per-row isolation: one bad payment must not stop the sweep.
    try {
      await reconcileOne(p);
    } catch (e) {
      logger.error('reconciliation failed for payment', { paymentId: p.id, err: String(e) });
      await audit
        .record({
          eventType: 'payment.reconciliation_mismatch',
          actorType: 'system',
          targetRef: p.appointmentId,
          reason: String(e?.message ?? e),
          meta: { providerRef: p.providerRef },
        })
        .catch(() => {});
    }
  }
}

async function reconcileOne(p) {
  const q = await paymentProvider.queryPaymentStatus({ providerRef: p.providerRef });
  if (q.status === 'unknown') {
    // Real PayFast PK has no status-query API (always 'unknown'): surface this stuck payment
    // ONCE for manual review (F12 alert feed), then leave it for the next pass. Idempotent via
    // an existing-audit-row check (Payment has no meta column).
    const already = await prisma.auditLog.findFirst({
      where: { eventType: 'payment.manual_review_required', targetRef: p.appointmentId },
    });
    if (!already) {
      await audit.record({
        eventType: 'payment.manual_review_required',
        actorType: 'system',
        targetRef: p.appointmentId,
        reason: 'no gateway status-query API; payment unconfirmed past the reconciliation window — manual review',
        meta: { providerRef: p.providerRef },
      });
    }
    return;
  }

  const appt = await prisma.appointment.findUnique({ where: { id: p.appointmentId } });

  if (q.status === 'failed') {
    // Mirror the failed-IPN path (Option B): mark the intent failed and free the lock.
    await markFailedAndReleaseLock(p.id, p.appointmentId);
    return;
  }

  // q.status === 'paid'
  if (appt?.state === 'confirmed') return; // a late IPN beat us — idempotent no-op
  if (appt?.state === 'slot_locked') {
    try {
      await self.confirmPaidAppointment({
        payment: p,
        appointment: appt,
        amount: q.amount ?? p.amount,
        gatewayFee: q.gatewayFee ?? null,
      });
      await audit.record({
        eventType: 'payment.reconciled_confirmed',
        actorType: 'system',
        targetRef: p.appointmentId,
        meta: { providerRef: p.providerRef },
      });
      return;
    } catch {
      // fall through to #6a — the slot was claimed while we held a stale lock
    }
  }
  await refundInFull(p);
}

/** Edge #6a: paid at the gateway but the slot is gone — full refund, no second appointment. */
async function refundInFull(p) {
  const key = p.refundIdempotencyKey ?? `rf_${p.appointmentId}`;
  const result = await paymentProvider.refund({
    providerRef: p.providerRef,
    amount: p.amount,
    idempotencyKey: key,
  });
  await prisma.payment.update({
    where: { id: p.id },
    data: {
      status: 'success', // money WAS captured at the gateway
      refundIdempotencyKey: key,
      refundRef: result.refundRef,
      refundStatus: result.status,
    },
  });
  // Do NOT delete the payment-referenced appointment: `Payment.appointment` is ON DELETE RESTRICT
  // (no cascade — prisma/schema.prisma), and we just set this Payment to `success`, so a delete
  // would P2003 → crash AFTER the money was refunded. The refund happened — preserve the audit
  // trail for both records. Force-expire the lock instead (a plain update, no FK touched): the row
  // no longer holds a slot, the real slot is already held by the other confirmed appointment, and
  // reconcileUnconfirmed skips this row (it only queries `pending` payments).
  await prisma.appointment.updateMany({
    where: { id: p.appointmentId, state: 'slot_locked' },
    data: { lockExpiresAt: new Date() },
  });
  await audit.record({
    eventType: 'payment.reconciliation_refund',
    actorType: 'system',
    targetRef: p.appointmentId,
    reason:
      result.status === 'manual_required'
        ? 'paid at gateway; slot gone (edge #6a) — manual refund required (no gateway API)'
        : 'paid at gateway; slot no longer available (edge #6a) — refunded in full',
    meta: { providerRef: p.providerRef, amount: p.amount },
  });
}
