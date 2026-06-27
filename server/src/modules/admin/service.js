// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';
import { karachiWallTimeToUtc } from '../../lib/tz/tz.js';

/** Doc-02 F13.01 record row (manual-payment model). Money is offline: the fee snapshot is
 *  `feeAtBooking`; the patient-entered bank transaction reference is `paymentReference`. */
const toRecordRow = (a) => ({
  id: a.id,
  slotStart: a.slotStart,
  slotEnd: a.slotEnd,
  state: a.state,
  patientName: a.patient.fullName,
  patientEmail: a.patient.email,
  subjectName: a.forSelf ? null : a.subjectName,
  doctorName: a.doctor.user.fullName,
  amountDue: a.feeAtBooking ?? null,
  paymentReference: a.paymentReference ?? null,
  paymentSubmittedAt: a.paymentSubmittedAt ?? null,
});

/** F13.01: unified, filtered, paginated, newest-first. Read-only projection.
 *  `from`/`to` are "YYYY-MM-DD" Karachi calendar dates (inclusive both ends):
 *  from maps to start-of-day Karachi (gte), to maps to start-of-next-day Karachi (lt). */
export async function listRecords({
  page = 1,
  pageSize = 20,
  patient,
  doctorName,
  appointmentId,
  paymentRef,
  state,
  from,
  to,
} = {}) {
  const where = {
    ...(appointmentId ? { id: appointmentId } : {}),
    ...(state ? { state } : {}),
    ...(patient
      ? {
          patient: {
            OR: [
              { email: { contains: patient, mode: 'insensitive' } },
              { phone: { contains: patient } },
            ],
          },
        }
      : {}),
    ...(doctorName
      ? { doctor: { user: { fullName: { contains: doctorName, mode: 'insensitive' } } } }
      : {}),
    ...(paymentRef ? { paymentReference: { contains: paymentRef, mode: 'insensitive' } } : {}),
    ...(from || to
      ? {
          slotStart: {
            ...(from ? { gte: karachiWallTimeToUtc(from, '00:00') } : {}),
            ...(to ? { lt: new Date(karachiWallTimeToUtc(to, '00:00').getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.appointment.findMany({
      where,
      orderBy: { slotStart: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { fullName: true, email: true } },
        doctor: { select: { user: { select: { fullName: true } } } },
      },
    }),
    prisma.appointment.count({ where }),
  ]);
  return { data: rows.map(toRecordRow), page: { number: page, size: pageSize, total } };
}

/** F13.01 audit tab: filtered append-only log, newest-first. Karachi day boundaries. */
export async function listAuditEntries({
  page = 1,
  pageSize = 50,
  appointmentId,
  userId,
  email,
  eventType,
  actorType,
  from,
  to,
} = {}) {
  let actorId = userId;
  if (!actorId && email) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    actorId = u?.id ?? '__no_match__'; // unknown email must match nothing, not everything
  }
  const where = {
    ...(appointmentId ? { targetRef: appointmentId } : {}),
    ...(actorId ? { actorId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(actorType ? { actorType } : {}),
    ...(from || to
      ? {
          at: {
            ...(from ? { gte: karachiWallTimeToUtc(from, '00:00') } : {}),
            ...(to ? { lt: new Date(karachiWallTimeToUtc(to, '00:00').getTime() + 24 * 60 * 60 * 1000) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { data: rows, page: { number: page, size: pageSize, total } };
}

/** F12.02: failed → pending (attempts reset); the existing dispatch worker re-sends.
 *  No parallel send path; emails only — refunds are NEVER re-triggered in-app (#10). */
export async function resendEmail({ jobId, actorId }) {
  const job = await prisma.notificationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new AppError('NOT_FOUND', 'Notification job not found.', 404);
  if (job.status !== 'failed') {
    throw new AppError('INVALID_STATE', 'Only failed emails can be re-triggered.', 409);
  }
  const result = await prisma.notificationJob.updateMany({
    where: { id: jobId, status: 'failed' }, // atomic guard — loses cleanly if anything raced us
    data: { status: 'pending', attempts: 0, nextAttemptAt: null, lastError: null },
  });
  if (result.count === 0) {
    throw new AppError('INVALID_STATE', 'Email job is no longer in failed state.', 409);
  }
  await audit.record({
    eventType: 'admin.email_resend',
    actorType: 'admin',
    actorId,
    targetRef: job.appointmentId,
    meta: { jobId, type: job.type },
  });
  return { id: jobId, status: 'pending' };
}

const ALERT_EVENT_TYPES = [
  // Manual-payment: a patient submitted a bank transaction reference awaiting admin review.
  'payment.submitted',
  'email.send_failed_final',
  'system.unhandled_exception',
];
const AWAITING_PRESCRIPTION_HOURS = 12;

/** F12.01: live projection — Slice E's alert audit rows + derived awaiting-prescription rows
 *  (same predicate as the D-02 badge) + the Task-17 exception bridge. No dedicated table.
 *  Both the audit query and the awaiting-prescription query are capped at 100 rows. */
export async function listAlerts(now = new Date()) {
  const [auditRows, awaiting] = await Promise.all([
    prisma.auditLog.findMany({
      where: { eventType: { in: ALERT_EVENT_TYPES } },
      orderBy: { at: 'desc' },
      take: 100,
    }),
    prisma.appointment.findMany({
      where: {
        state: 'completed',
        prescriptions: { none: {} },
        slotEnd: { lte: new Date(now.getTime() - AWAITING_PRESCRIPTION_HOURS * 3600 * 1000) },
      },
      orderBy: { slotEnd: 'desc' },
      take: 100,
      include: { doctor: { select: { user: { select: { fullName: true } } } } },
    }),
  ]);

  // Enrich email alerts with their resendable failed jobs (the audit row has no jobId).
  const emailTargets = auditRows
    .filter((r) => r.eventType === 'email.send_failed_final' && r.targetRef)
    .map((r) => r.targetRef);
  const failedJobs = emailTargets.length
    ? await prisma.notificationJob.findMany({
        where: { appointmentId: { in: emailTargets }, status: 'failed' },
        select: { id: true, appointmentId: true, type: true, status: true },
      })
    : [];

  const alerts = [
    ...auditRows.map((r) => ({
      id: r.id,
      kind: r.eventType,
      at: r.at,
      targetRef: r.targetRef,
      reason: r.reason,
      meta: r.meta,
      ...(r.eventType === 'email.send_failed_final'
        ? { failedJobs: failedJobs.filter((j) => j.appointmentId === r.targetRef) }
        : {}),
    })),
    ...awaiting.map((a) => ({
      id: `awaiting_${a.id}`,
      kind: 'awaiting_prescription',
      at: a.slotEnd,
      targetRef: a.id,
      reason: `No prescription ${AWAITING_PRESCRIPTION_HOURS}h after the consultation with ${a.doctor.user.fullName}.`,
      meta: null,
    })),
  ];
  return alerts.sort((x, y) => y.at.getTime() - x.at.getTime());
}

const settingsShape = (s) => ({
  minBookingLeadMinutes: s.minBookingLeadMinutes,
  bankName: s.bankName,
  bankAccountName: s.bankAccountName,
  bankAccountNumber: s.bankAccountNumber,
  bankInstructions: s.bankInstructions,
});

/** F14: single seeded row (id=1). Booking + refund code reads it live — no cache to bust.
 *  Returns null if the singleton row is missing (unseeded DB). */
export async function getSettings() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return s ? settingsShape(s) : null;
}

/** F14.03: every change is an admin-actor audit entry with the before→after diff. */
export async function updateSettings({ data, actorId }) {
  const before = await prisma.settings.findUnique({ where: { id: 1 } });
  const updated = await prisma.settings.update({ where: { id: 1 }, data });
  await audit.record({
    eventType: 'settings.updated',
    actorType: 'admin',
    actorId,
    meta: { before: settingsShape(before), after: settingsShape(updated) },
  });
  return settingsShape(updated);
}

/** F13.02: one appointment with its full transition history (audit), prescriptions, email jobs. */
export async function getRecordDetail(appointmentId) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: { select: { fullName: true, email: true } },
      doctor: { select: { user: { select: { fullName: true } } } },
      prescriptions: { include: { items: true }, orderBy: { issuedAt: 'asc' } },
      notificationJobs: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!a) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const history = await prisma.auditLog.findMany({
    where: { targetRef: appointmentId },
    orderBy: { at: 'asc' },
  });
  const { prescriptions, notificationJobs, ...appointment } = a;
  return { appointment: { ...appointment, ...toRecordRow(a) }, history, prescriptions, notificationJobs };
}
