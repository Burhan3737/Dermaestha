// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { logger } from '../lib/logger.js';
import { emailProvider } from '../integrations/email/index.js';
import * as appointmentState from './appointmentState.service.js';
import * as refund from './refund.service.js';

const FREE_CANCEL_MS = 2 * 60 * 60 * 1000;

/**
 * @param {{ appointmentId: string, actorType: 'patient'|'doctor', actorId: string, reason?: string }} args
 */
export async function cancel({ appointmentId, actorType, actorId, reason }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);

  if (actorType === 'patient' && appt.patientUserId !== actorId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404); // 404, not 403 (no existence leak)
  }
  if (actorType === 'doctor') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actorId }, select: { id: true } });
    if (!doctor || doctor.id !== appt.doctorId) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'confirmed') {
    throw new AppError('INVALID_TRANSITION', 'Only confirmed appointments can be cancelled.', 409);
  }

  if (actorType === 'doctor') {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'A cancellation reason is required.', 400);
    await appointmentState.transition({ appointmentId, to: 'doctor_cancelled', actorType: 'doctor', actorId, reason });
    await refund.initiateRefund({ appointmentId });
    await sendApology(appt, 'cancellation_apology');
    return { state: 'doctor_cancelled' };
  }

  const refundable = appt.slotStart.getTime() - Date.now() >= FREE_CANCEL_MS;
  if (refundable) {
    await appointmentState.transition({ appointmentId, to: 'cancelled_refunded', actorType: 'patient', actorId });
    await refund.initiateRefund({ appointmentId });
    await sendApology(appt, 'refund_confirmation');
    return { state: 'cancelled_refunded' };
  }
  await appointmentState.transition({ appointmentId, to: 'cancelled_no_refund', actorType: 'patient', actorId });
  return { state: 'cancelled_no_refund' };
}

async function sendApology(appt, template) {
  try {
    const patient = await prisma.user.findUnique({ where: { id: appt.patientUserId }, select: { email: true, fullName: true } });
    await emailProvider.send({ template, to: patient.email, vars: { patientName: patient.fullName, appointmentRef: appt.id } });
  } catch {
    logger.warn('cancellation email not sent', { appointmentId: appt.id, template });
  }
}
