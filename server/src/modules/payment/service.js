// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { env } from '../../config/env/env.js';
import { logger } from '../../lib/logger/logger.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import { emailProvider } from '../../integrations/email/index.js';
import * as appointmentState from '../appointment/service.js';

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
    await prisma.appointment.deleteMany({
      where: { id: payment.appointmentId, state: 'slot_locked' },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    return { ok: true };
  }

  const appt = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
  if (!appt || appt.state === 'confirmed') return { ok: true }; // idempotent

  await prisma.$transaction(async (tx) => {
    await appointmentState.transition({
      appointmentId: appt.id,
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: amount, lockExpiresAt: null },
      client: tx,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'success', gatewayFee: gatewayFee ?? null },
    });
  });

  // Post-commit, best-effort confirmation email — fire-and-forget so a slow/hung provider
  // cannot delay acknowledging the IPN (the transition is already committed).
  prisma.user
    .findUnique({
      where: { id: appt.patientUserId },
      select: { email: true, fullName: true },
    })
    .then((patient) =>
      emailProvider.send({
        template: 'booking_confirmation',
        to: patient.email,
        vars: { patientName: patient.fullName, appointmentRef: appt.id },
      }),
    )
    .catch(() => logger.warn('confirmation email not sent', { appointmentId: appt.id }));
  return { ok: true };
}
