// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { KARACHI } from '../../lib/tz/tz.js';
import { env } from '../../config/env/env.js';

const HOUR_MS = 60 * 60 * 1000;

/** All times in emails are Asia/Karachi (F07.02 Timezone Rule). */
export const slotStartLocal = (slotStart) =>
  formatInTimeZone(slotStart, KARACHI, 'EEE, dd MMM yyyy HH:mm');

/**
 * Persist one outbox row. Idempotent on (appointmentId, type): a replay is a no-op.
 * Pass `client` to join the caller's $transaction (the outbox guarantee).
 * @param {{ type: string, appointmentId: string, recipientEmail: string,
 *   scheduledFor: Date, vars?: object, client?: any }} args
 */
export async function enqueue({
  type,
  appointmentId,
  recipientEmail,
  scheduledFor,
  vars,
  client = prisma,
}) {
  return client.notificationJob.upsert({
    where: { appointmentId_type: { appointmentId, type } },
    update: {},
    create: { type, appointmentId, recipientEmail, scheduledFor, vars },
  });
}

/**
 * Enqueue the confirmation + reminder cadence at confirmation time (F07.02).
 * Short-Lead Skip Rule: no 24h reminder if <24h to slot; no 1h reminder if <1h.
 * @param {{ appointment: { id: string, slotStart: Date },
 *   patient: { email: string, fullName: string }, doctorName: string, fee: number|null,
 *   now?: Date, client?: any }} args
 */
export async function enqueueBookingEmails({
  appointment,
  patient,
  doctorName,
  fee,
  now = new Date(),
  client = prisma,
}) {
  const base = { appointmentId: appointment.id, recipientEmail: patient.email, client };
  const common = {
    patientName: patient.fullName,
    doctorName,
    slotStartLocal: slotStartLocal(appointment.slotStart),
  };
  const dashboardUrl = `${env.APP_BASE_URL}/appointments`;

  await enqueue({
    ...base,
    type: 'booking_confirmation',
    scheduledFor: now,
    vars: { ...common, fee, dashboardUrl },
  });

  const at24h = new Date(appointment.slotStart.getTime() - 24 * HOUR_MS);
  if (at24h.getTime() > now.getTime()) {
    await enqueue({
      ...base,
      type: 'reminder_24h',
      scheduledFor: at24h,
      vars: { ...common, joinUrl: dashboardUrl },
    });
  }

  const at1h = new Date(appointment.slotStart.getTime() - HOUR_MS);
  if (at1h.getTime() > now.getTime()) {
    await enqueue({
      ...base,
      type: 'reminder_1h',
      scheduledFor: at1h,
      vars: { ...common, joinUrl: dashboardUrl },
    });
  }
}
