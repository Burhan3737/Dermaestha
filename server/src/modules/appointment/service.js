// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { logger } from '../../lib/logger/logger.js';
import { KARACHI, karachiWallTimeToUtc } from '../../lib/tz/tz.js';
import {
  SLOT_GRANULARITY_MIN,
  SLOT_LOCK_TTL_MIN,
  ACTIVE_APPOINTMENT_STATES,
  NO_SHOW_GRACE_MIN,
  VIDEO_TOKEN_POST_MIN,
  REFUND_MAX_ATTEMPTS,
  REFUND_BACKOFF_BASE_SEC,
} from '../../config/constants.js';
import { generateSlots } from '../doctor/service.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import * as notification from '../notification/service.js';
import * as audit from '../../services/audit/audit.service.js';
// Self-import: intra-module calls that tests stub (quoteRefund/transition/initiateRefund/safeRefund)
// route through the namespace so vi.spyOn can intercept them under ESM (a bare local call cannot be spied).
import * as self from './service.js';

// Patient "Upcoming": awaiting payment (pending) or paid/confirmed. History: completed + cancelled.
const PATIENT_ACTIVE = ['pending', 'confirmed'];
const TERMINAL = ['completed', 'cancelled'];

function toPatientRow(a) {
  return {
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    feeAtBooking: a.feeAtBooking,
    paymentReference: a.paymentReference,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    doctorName: a.doctor.user.fullName,
    specialization: a.doctor.specialization,
    doctorPhotoUrl: a.doctor.photoUrl,
    hasPrescription: a._count.prescriptions > 0,
  };
}

export async function listForRole({ role, userId, scope = 'active' }) {
  if (role === 'patient') {
    const rows = await prisma.appointment.findMany({
      where:
        scope === 'history'
          ? { patientUserId: userId, state: { in: TERMINAL } }
          : { patientUserId: userId, state: { in: PATIENT_ACTIVE } },
      orderBy: { slotStart: scope === 'history' ? 'desc' : 'asc' },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            photoUrl: true,
            user: { select: { fullName: true } },
          },
        },
        _count: { select: { prescriptions: true } },
      },
    });
    return rows.map(toPatientRow);
  }
  const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) return [];
  // F05.02: the default doctor view is TODAY's appointments (Karachi day); history is separate.
  const todayYMD = formatInTimeZone(new Date(), KARACHI, 'yyyy-MM-dd');
  const dayStart = karachiWallTimeToUtc(todayYMD, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const where =
    scope === 'history'
      ? { doctorId: doctor.id, state: { in: TERMINAL } }
      : {
          doctorId: doctor.id,
          state: 'confirmed',
          slotStart: { gte: dayStart, lt: dayEnd },
        };
  const rows = await prisma.appointment.findMany({
    where,
    orderBy: { slotStart: scope === 'history' ? 'desc' : 'asc' },
    include: { patient: { select: { fullName: true } }, _count: { select: { prescriptions: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    patientName: a.patient?.fullName ?? null,
    hasPrescription: a._count.prescriptions > 0,
  }));
}

export async function getForRole({ id, role, userId }) {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: {
        select: {
          id: true,
          specialization: true,
          photoUrl: true,
          user: { select: { fullName: true } },
        },
      },
      patient: { select: { fullName: true } },
    },
  });
  const visible =
    a &&
    ((role === 'patient' && a.patientUserId === userId) ||
      (role === 'doctor' &&
        a.doctor &&
        (await prisma.doctor.findUnique({ where: { userId }, select: { id: true } }))?.id ===
          a.doctorId) ||
      role === 'admin');
  if (!visible) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);

  const detail = {
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    feeAtBooking: a.feeAtBooking,
    paymentReference: a.paymentReference,
    paymentSubmittedAt: a.paymentSubmittedAt ? a.paymentSubmittedAt.toISOString() : null,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    subjectAge: a.subjectAge,
    subjectRelation: a.subjectRelation,
    patientName: a.patient?.fullName ?? null,
    doctorName: a.doctor.user.fullName,
    specialization: a.doctor.specialization,
    doctorPhotoUrl: a.doctor.photoUrl,
  };
  detail.serverNow = new Date().toISOString();
  // Manual-payment: a pending appointment shows the patient the bank instructions + amount due
  // (design §7.1). Bank details come from the single admin-editable Settings row.
  if (a.state === 'pending') {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    detail.paymentInstructions = {
      amountDue: a.feeAtBooking,
      bankName: s?.bankName ?? null,
      bankAccountName: s?.bankAccountName ?? null,
      bankAccountNumber: s?.bankAccountNumber ?? null,
      bankInstructions: s?.bankInstructions ?? null,
    };
  }
  return detail;
}

/**
 * Create a `pending` hold for a patient (slot locked, awaiting manual payment). Validates the slot
 * is genuinely bookable, enforces No-Overlap, snapshots the fee, then inserts. With no auto-expiry,
 * a unique-index collision is simply SLOT_TAKEN.
 * @param {{ patientUserId: string, doctorId: string, slotStart: string,
 *   forSelf: boolean, subject?: { name: string, age: number, relation: string } }} args
 */
export async function lockSlot({ patientUserId, doctorId, slotStart, forSelf, subject }) {
  const slotStartDate = new Date(slotStart);
  const slotEnd = new Date(slotStartDate.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000);

  // Invariant #9 (F10.03): a deactivated/unknown doctor takes NO new bookings.
  // 404-no-leak — same answer as the public profile route.
  const activeDoctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isActive: true, status: 'active' },
    select: { id: true, fee: true },
  });
  if (!activeDoctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);

  // 1. The slot must currently be a real, future, lead-time-valid, un-taken slot.
  const dateYMD = formatInTimeZone(slotStartDate, KARACHI, 'yyyy-MM-dd');
  const slots = await generateSlots(doctorId, dateYMD);
  if (!slots.some((s) => s.slotStart === slotStartDate.toISOString())) {
    throw new AppError('SLOT_NOT_BOOKABLE', 'That slot is not available.', 422);
  }

  // 2. No-Overlap: no active appointment overlapping [slotStart, slotEnd).
  const overlap = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { lt: slotEnd },
      slotEnd: { gt: slotStartDate },
    },
    select: { id: true },
  });
  if (overlap) throw new AppError('OVERLAP', 'You already have an appointment at this time.', 409);

  const data = {
    doctorId,
    patientUserId,
    slotStart: slotStartDate,
    slotEnd,
    state: 'pending',
    feeAtBooking: activeDoctor.fee,
    forSelf,
    subjectName: subject?.name ?? null,
    subjectAge: subject?.age ?? null,
    subjectRelation: subject?.relation ?? null,
  };

  const created = await createWithReclaim(data);
  await audit.record({
    eventType: 'appointment.pending',
    actorType: 'patient',
    actorId: patientUserId,
    targetRef: created.id,
  });
  return created;
}

async function createWithReclaim(data) {
  try {
    return await prisma.appointment.create({ data });
  } catch (e) {
    if (e?.code === 'P2002') throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
    throw e;
  }
}

/**
 * Manual offline payment (design §7.1): the patient submits their bank transaction reference.
 * Stays `pending`; records the reference + timestamp, audits it, and alerts the admin (in-app
 * audit row + email — the admin matches it against the bank).
 * @param {{ patientUserId: string, appointmentId: string, reference: string }} args
 */
export async function submitPaymentReference({ patientUserId, appointmentId, reference }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientUserId !== patientUserId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'pending') {
    throw new AppError('INVALID_STATE', 'This booking is no longer awaiting payment.', 409);
  }
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { paymentReference: reference, paymentSubmittedAt: new Date() },
  });
  await audit.record({
    eventType: 'payment.submitted',
    actorType: 'patient',
    actorId: patientUserId,
    targetRef: appointmentId,
    meta: { reference },
  });
  await notification.enqueuePaymentSubmittedAdmin({ appointment: appt, reference }).catch(() => {});
  return { ok: true };
}

/** Legal transitions (manual-payment, doc 05 §5). pending→{confirmed,cancelled};
 *  confirmed→{completed,cancelled}. completed + cancelled are terminal. */
export const LEGAL = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
};

/**
 * The ONLY writer of Appointment.state. Validates from→to, applies extra column data,
 * and appends the audit entry (using the same client, so it is atomic inside a $transaction).
 * @param {{ appointmentId: string, to: string,
 *   actorType: 'patient'|'doctor'|'system', actorId?: string|null, reason?: string|null,
 *   data?: object, client?: any }} args
 */
export async function transition({
  appointmentId,
  to,
  actorType,
  actorId = null,
  reason = null,
  data = {},
  client = prisma,
}) {
  const appt = await client.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const allowed = LEGAL[appt.state];
  if (!allowed || !allowed.has(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot move ${appt.state} → ${to}.`, 409);
  }
  // State-guarded write: under READ COMMITTED a concurrent transition re-evaluates this
  // WHERE after the row lock clears, so a lost-update race fails here (409) instead of
  // silently double-applying (e.g. two first-issue prescription submits).
  const guarded = await client.appointment.updateMany({
    where: { id: appointmentId, state: appt.state },
    data: { state: to, ...data },
  });
  if (guarded.count === 0) {
    throw new AppError('INVALID_TRANSITION', `Cannot move ${appt.state} → ${to}.`, 409);
  }
  const updated = await client.appointment.findUnique({ where: { id: appointmentId } });
  await audit.record(
    { eventType: `appointment.${to}`, actorType, actorId, targetRef: appointmentId, reason },
    client,
  );
  return updated;
}

function fallbackFee(amount, s) {
  const pct = Math.round((amount * (s?.fallbackFeePctBps ?? 0)) / 10000);
  return pct + (s?.fallbackFeeFixed ?? 0);
}

/** Pure-ish quote so the cancel modal and dashboard show the identical number (policy #5). */
export async function quoteRefund(appointmentId) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) throw new AppError('NOT_FOUND', 'No payment to refund.', 404);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const gatewayFee = payment.gatewayFee ?? fallbackFee(payment.amount, settings);
  return {
    amountPaid: payment.amount,
    gatewayFee,
    refund: Math.max(0, payment.amount - gatewayFee),
  };
}

/** Idempotency-keyed refund (#10). Best-effort caller fires the email post-commit. */
export async function initiateRefund({ appointmentId }) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) return null;
  const { refund } = await quoteRefund(appointmentId);
  const key = payment.refundIdempotencyKey ?? `rf_${appointmentId}`;
  let result;
  try {
    result = await paymentProvider.refund({
      providerRef: payment.providerRef,
      amount: refund,
      idempotencyKey: key,
    });
  } catch (e) {
    // Edge #30: schedule an exponential-backoff retry; on exhaustion alert the admin and
    // notify the patient of the delay. Idempotency key (#10) makes every retry safe.
    const attempts = (payment.refundAttempts ?? 0) + 1;
    const exhausted = attempts >= REFUND_MAX_ATTEMPTS;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundIdempotencyKey: key,
        refundStatus: exhausted ? 'failed' : 'retrying',
        refundAttempts: attempts,
        nextRefundRetryAt: exhausted
          ? null
          : new Date(Date.now() + REFUND_BACKOFF_BASE_SEC * 1000 * 2 ** attempts),
      },
    });
    if (exhausted) {
      await audit
        .record({
          eventType: 'payment.refund_exhausted',
          actorType: 'system',
          targetRef: appointmentId,
          reason: String(e?.message ?? e),
          meta: { providerRef: payment.providerRef ?? null, attempts },
        })
        .catch(() => {});
      await enqueueRefundDelayed(appointmentId).catch(() => {});
    }
    throw e;
  }
  if (result.status === 'manual_required') {
    // Gateway exposes no refund API (PayFast PK). Record once, no retry-spin, notify the patient.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundIdempotencyKey: key, refundStatus: 'manual_required', nextRefundRetryAt: null },
    });
    await audit
      .record({
        eventType: 'payment.refund_manual_required',
        actorType: 'system',
        targetRef: appointmentId,
        reason: 'gateway exposes no refund API; awaiting manual admin settlement',
        meta: { providerRef: payment.providerRef ?? null },
      })
      .catch(() => {});
    await enqueueRefundDelayed(appointmentId).catch(() => {});
    return result;
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundIdempotencyKey: key,
      refundRef: result.refundRef,
      refundStatus: result.status,
      nextRefundRetryAt: null,
    },
  });
  return result;
}

/** Best-effort refund: never throws; logs + audits failures for reconciliation. */
export async function safeRefund(appointmentId) {
  try {
    await self.initiateRefund({ appointmentId });
  } catch (e) {
    logger.warn('refund initiation failed (will be reconciled)', { appointmentId, err: String(e) });
    await audit
      .record({
        eventType: 'payment.refund_failed',
        actorType: 'system',
        targetRef: appointmentId,
        reason: String(e?.message ?? e),
      })
      .catch(() => {});
  }
}

async function enqueueRefundDelayed(appointmentId) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return;
  const patient = await prisma.user.findUnique({
    where: { id: appt.patientUserId },
    select: { email: true, fullName: true },
  });
  if (!patient) return;
  await notification.enqueue({
    type: 'refund_delayed',
    appointmentId,
    recipientEmail: patient.email,
    scheduledFor: new Date(),
    vars: { patientName: patient.fullName, appointmentRef: appointmentId },
  });
}

/** Minute-cron worker body (F06.03): re-run due refund retries. Clock-injected. */
export async function retryDueRefunds(now = new Date()) {
  const due = await prisma.payment.findMany({
    where: { refundStatus: 'retrying', nextRefundRetryAt: { lte: now } },
  });
  for (const p of due) {
    // Best-effort per row; initiateRefund itself reschedules/exhausts on failure.
    await self.initiateRefund({ appointmentId: p.appointmentId }).catch(() => {});
  }
}

/**
 * Cancel from `pending` or `confirmed` → single `cancelled` state. Money is fully offline (no
 * refund). Who/why is captured in the audit log via transition(actorType, reason).
 * @param {{ appointmentId: string, actorType: 'patient'|'doctor', actorId: string, reason?: string }} args
 */
export async function cancel({ appointmentId, actorType, actorId, reason }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);

  if (actorType === 'patient' && appt.patientUserId !== actorId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404); // 404, not 403 (no existence leak)
  }
  if (actorType === 'doctor') {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: actorId },
      select: { id: true },
    });
    if (!doctor || doctor.id !== appt.doctorId)
      throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'pending' && appt.state !== 'confirmed') {
    throw new AppError('INVALID_TRANSITION', 'This appointment cannot be cancelled.', 409);
  }
  await self.transition({ appointmentId, to: 'cancelled', actorType, actorId, reason: reason ?? null });
  await enqueueCancellationEmail(appt).catch(() => {});
  return { state: 'cancelled' };
}

/** Enqueue a cancellation email (outbox). Vars are snapshotted now (doc 14 §5). No refund math. */
async function enqueueCancellationEmail(appt) {
  try {
    const [patient, doctor] = await Promise.all([
      prisma.user.findUnique({
        where: { id: appt.patientUserId },
        select: { email: true, fullName: true },
      }),
      prisma.doctor.findUnique({
        where: { id: appt.doctorId },
        select: { user: { select: { fullName: true } } },
      }),
    ]);
    if (!patient) return;
    await notification.enqueue({
      type: 'cancellation',
      appointmentId: appt.id,
      recipientEmail: patient.email,
      scheduledFor: new Date(),
      vars: {
        patientName: patient.fullName,
        doctorName: doctor?.user?.fullName ?? null,
        slotStartLocal: notification.slotStartLocal(appt.slotStart),
        appointmentRef: appt.id,
      },
    });
  } catch (e) {
    logger.warn('cancellation email not enqueued', { appointmentId: appt.id, err: String(e) });
  }
}

/** F13.02: support-workflow flag, orthogonal to the state machine — never a transition. */
export async function setDisputed({ appointmentId, disputed, actorId }) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true },
  });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { disputed },
  });
  await audit.record({
    eventType: disputed ? 'appointment.disputed' : 'appointment.dispute_cleared',
    actorType: 'admin',
    actorId,
    targetRef: appointmentId,
  });
  return updated;
}

/** Pure-ish, clock-injected, catch-up-safe. The ONLY transitions are via state.transition. */
export async function evaluateDueAppointments(now = new Date()) {
  await activateDue(now);
  await resolveInProgress(now);
}

async function activateDue(now) {
  const due = await prisma.appointment.findMany({
    where: { state: 'confirmed', slotStart: { lte: now } },
  });
  for (const a of due) {
    // One bad row must not poison the batch — a skipped appointment is retried next tick.
    try {
      await self.transition({ appointmentId: a.id, to: 'in_progress', actorType: 'system' });
    } catch (e) {
      logger.error('activation failed; will retry next tick', {
        appointmentId: a.id,
        err: String(e),
      });
    }
  }
}

async function resolveInProgress(now) {
  const open = await prisma.appointment.findMany({ where: { state: 'in_progress' } });
  for (const a of open) {
    // One bad row must not poison the batch — a skipped appointment is retried next tick.
    try {
      const graceEnd = a.slotStart.getTime() + NO_SHOW_GRACE_MIN * 60000;
      const hardCutoff = a.slotEnd.getTime() + VIDEO_TOKEN_POST_MIN * 60000;
      const both = a.doctorJoinedAt && a.patientJoinedAt;
      const t = now.getTime();
      if (t >= hardCutoff) {
        if (both) {
          await self.transition({ appointmentId: a.id, to: 'completed', actorType: 'system' });
        } else {
          await resolveNoShow(a, true);
        }
      } else if (t >= graceEnd && !both) {
        await resolveNoShow(a, false);
      }
    } catch (e) {
      logger.error('in_progress resolution failed; will retry next tick', {
        appointmentId: a.id,
        err: String(e),
      });
    }
  }
}

async function resolveNoShow(a, atCutoff) {
  // ADR-12 precedence: doctor never joined → doctor_no_show (whether or not patient joined).
  const to = !a.doctorJoinedAt ? 'doctor_no_show' : 'patient_no_show';
  await self.transition({ appointmentId: a.id, to, actorType: 'system' });
  if (to === 'doctor_no_show') {
    await self.safeRefund(a.id);
    await enqueueCancellationEmail(a, 'cancellation_apology');
    // Scoped to the zero-join-data case (neither party recorded a join at the hard cutoff) —
    // the strict "resolved blind" subset of ADR-12's "missing/ambiguous". Spec-owner to confirm
    // at the canon-docs step whether the alert should widen to late doctor-absent resolutions too.
    if (atCutoff && !a.doctorJoinedAt && !a.patientJoinedAt) {
      await audit
        .record({
          eventType: 'appointment.evaluation_data_gap',
          actorType: 'system',
          targetRef: a.id,
          reason: 'no join data at slot-end+5m; resolved non-penalizing',
        })
        .catch(() => {});
    }
  }
}

