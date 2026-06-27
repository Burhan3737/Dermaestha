// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { KARACHI } from '../../lib/tz/tz.js';
import { env } from '../../config/env/env.js';
import { logger } from '../../lib/logger/logger.js';
import { EMAIL_MAX_ATTEMPTS, EMAIL_BACKOFF_BASE_SEC } from '../../config/constants.js';
import { emailProvider } from '../../integrations/email/index.js';
import * as audit from '../../services/audit/audit.service.js';

const HOUR_MS = 60 * 60 * 1000;

/** All times in emails are Asia/Karachi (F07.02 Timezone Rule). */
export const slotStartLocal = (slotStart) =>
  formatInTimeZone(slotStart, KARACHI, 'EEE, dd MMM yyyy HH:mm');

/**
 * Persist one outbox row. Idempotent on (appointmentId, type, dedupeKey): a replay is a no-op.
 * dedupeKey defaults to '' (singleton per type); pass a unique key (e.g. prescription id) for
 * repeatable types. Pass `client` to join the caller's $transaction (the outbox guarantee).
 * @param {{ type: string, appointmentId: string, recipientEmail: string,
 *   scheduledFor: Date, vars?: object, dedupeKey?: string, client?: any }} args
 */
export async function enqueue({
  type,
  appointmentId,
  recipientEmail,
  scheduledFor,
  vars,
  dedupeKey = '',
  client = prisma,
}) {
  return client.notificationJob.upsert({
    where: { appointmentId_type_dedupeKey: { appointmentId, type, dedupeKey } },
    update: {},
    create: { type, appointmentId, recipientEmail, scheduledFor, vars, dedupeKey },
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

/**
 * Manual-payment: alert the admin that a patient submitted a bank transaction reference (design §9).
 * @param {{ appointment: { id: string }, reference: string, now?: Date, client?: any }} args
 */
export async function enqueuePaymentSubmittedAdmin({
  appointment,
  reference,
  now = new Date(),
  client = prisma,
}) {
  const admin = await client.user.findFirst({
    where: { role: 'admin' },
    select: { email: true },
  });
  if (!admin) return;
  await enqueue({
    type: 'payment_submitted_admin',
    appointmentId: appointment.id,
    recipientEmail: admin.email,
    scheduledFor: now,
    vars: {
      appointmentRef: appointment.id,
      reference,
      reviewUrl: `${env.APP_BASE_URL}/admin/records`,
    },
    client,
  });
}

/** Admin accepted the manual payment → booking confirmation + reminder cadence (design §9). */
export async function enqueueBookingConfirmation(args) {
  return enqueueBookingEmails(args);
}

/**
 * Admin rejected the manual payment (reference not matched) → "payment not received" (design §9).
 * @param {{ appointment: { id: string, slotStart: Date, patientUserId: string },
 *   now?: Date, client?: any }} args
 */
export async function enqueuePaymentNotReceived({ appointment, now = new Date(), client = prisma }) {
  const patient = await client.user.findUnique({
    where: { id: appointment.patientUserId },
    select: { email: true, fullName: true },
  });
  if (!patient) return;
  await enqueue({
    type: 'payment_not_received',
    appointmentId: appointment.id,
    recipientEmail: patient.email,
    scheduledFor: now,
    vars: {
      patientName: patient.fullName,
      appointmentRef: appointment.id,
      slotStartLocal: slotStartLocal(appointment.slotStart),
    },
    client,
  });
}

const REMINDER_TYPES = new Set(['reminder_24h', 'reminder_1h']);
const SENDABLE_STATES = new Set(['confirmed']);
const LEASE_MS = 60_000;

/** Minute-cron worker body: deliver due outbox rows. Pure w.r.t. the injected clock. */
export async function dispatchDueNotifications(now = new Date()) {
  const due = await prisma.notificationJob.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledFor: 'asc' },
  });
  for (const job of due) {
    // One poisoned row must not starve the batch — it is retried next tick.
    try {
      await dispatchOne(job, now);
    } catch (e) {
      logger.error('notification dispatch failed; will retry next tick', {
        jobId: job.id,
        err: String(e),
      });
    }
  }
}

async function dispatchOne(job, now) {
  // Lease claim (defense-in-depth over the ADR-08 single-instance assumption): pushing
  // nextAttemptAt forward atomically prevents a concurrent pass double-sending this row.
  const claimed = await prisma.notificationJob.updateMany({
    where: { id: job.id, status: 'pending' },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count === 0) return;

  // Reminder-Invalidation Rule (F07.03): re-check state immediately before dispatch.
  if (REMINDER_TYPES.has(job.type)) {
    const appt = await prisma.appointment.findUnique({
      where: { id: job.appointmentId },
      select: { state: true },
    });
    if (!appt || !SENDABLE_STATES.has(appt.state)) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'suppressed' },
      });
      return;
    }
  }

  try {
    await emailProvider.send({ template: job.type, to: job.recipientEmail, vars: job.vars ?? {} });
  } catch (e) {
    const attempts = job.attempts + 1;
    const lastError = String(e?.message ?? e);
    if (attempts >= EMAIL_MAX_ATTEMPTS) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'failed', attempts, lastError },
      });
      // Alert source for the Slice G admin feed (F12.01 "email failures after retry exhaustion").
      await audit
        .record({
          eventType: 'email.send_failed_final',
          actorType: 'system',
          targetRef: job.appointmentId,
          reason: `${job.type}: ${lastError}`,
        })
        .catch(() => {});
      return;
    }
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        attempts,
        lastError,
        nextAttemptAt: new Date(now.getTime() + EMAIL_BACKOFF_BASE_SEC * 1000 * 2 ** attempts),
      },
    });
    return;
  }

  await prisma.notificationJob.update({
    where: { id: job.id },
    data: { status: 'sent', sentAt: new Date(), lastError: null },
  });
}
