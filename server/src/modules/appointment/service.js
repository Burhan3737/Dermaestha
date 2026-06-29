// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { logger } from '../../lib/logger/logger.js';
import { KARACHI, karachiWallTimeToUtc } from '../../lib/tz/tz.js';
import { SLOT_GRANULARITY_MIN, ACTIVE_APPOINTMENT_STATES } from '../../config/constants.js';
import { generateSlots } from '../doctor/service.js';
import * as notification from '../notification/service.js';
import * as analytics from '../analytics/service.js';
import * as audit from '../../services/audit/audit.service.js';
// Self-import: intra-module calls that tests stub (transition) route through the namespace so
// vi.spyOn can intercept them under ESM (a bare local call cannot be spied).
import * as self from './service.js';

// Time-based Upcoming/Past split (3-state model — no `completed`). Upcoming = pending OR a
// confirmed appointment whose slot has not yet ended; Past = a confirmed appointment whose slot
// has ended, OR cancelled. A pending row whose slot has passed stays under Upcoming (the admin
// still resolves it). These are Prisma `where` fragments so the split happens in the DB, not in JS.
const upcomingWhere = (now) => ({
  OR: [{ state: 'pending' }, { state: 'confirmed', slotEnd: { gte: now } }],
});
const pastWhere = (now) => ({
  OR: [{ state: 'confirmed', slotEnd: { lt: now } }, { state: 'cancelled' }],
});

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
  const now = new Date();
  if (role === 'patient') {
    const stateWhere = scope === 'history' ? pastWhere(now) : upcomingWhere(now);
    const rows = await prisma.appointment.findMany({
      where: { patientUserId: userId, ...stateWhere },
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
  // F05.02: the default doctor view is TODAY's appointments (Karachi day); history is the
  // time-based Past split (confirmed-and-ended OR cancelled), consistent with the patient view.
  const todayYMD = formatInTimeZone(now, KARACHI, 'yyyy-MM-dd');
  const dayStart = karachiWallTimeToUtc(todayYMD, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const where =
    scope === 'history'
      ? { doctorId: doctor.id, ...pastWhere(now) }
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
 * is genuinely bookable, enforces the single-active-appointment limit, snapshots the fee, then inserts. With no auto-expiry,
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

  // 2. Single-active-appointment: a patient may hold at most ONE upcoming appointment
  // (pending or confirmed). Strictly subsumes the old No-Overlap check.
  const active = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotEnd: { gt: new Date() },
    },
    select: { id: true },
  });
  if (active) {
    throw new AppError(
      'ACTIVE_LOCK_EXISTS',
      'Finish or cancel your current appointment before booking another.',
      409,
    );
  }

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

/**
 * Admin verifies the manual payment (design §7.2). accept → pending→confirmed + booking
 * confirmation email; reject → pending→cancelled (frees slot) + "payment not received" email.
 * @param {{ appointmentId: string, accept: boolean, actorId: string }} args
 */
export async function adminDecision({ appointmentId, accept, actorId }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (appt.state !== 'pending') {
    throw new AppError('INVALID_TRANSITION', 'Only pending appointments can be reviewed.', 409);
  }
  if (accept) {
    await self.transition({ appointmentId, to: 'confirmed', actorType: 'admin', actorId });
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
    await notification
      .enqueueBookingConfirmation({
        appointment: appt,
        patient,
        doctorName: doctor.user.fullName,
        fee: appt.feeAtBooking,
      })
      .catch(() => {});
    // KPI #1 conversion event — moved here from the deleted confirmPaidAppointment. Best-effort.
    await analytics
      .record({ type: 'booking_confirmed', meta: { doctorId: appt.doctorId, fee: appt.feeAtBooking } })
      .catch(() => {});
    return { state: 'confirmed' };
  }
  await self.transition({
    appointmentId,
    to: 'cancelled',
    actorType: 'admin',
    actorId,
    reason: 'payment not received',
  });
  await notification.enqueuePaymentNotReceived({ appointment: appt }).catch(() => {});
  return { state: 'cancelled' };
}

/** Legal transitions (manual-payment, doc 05 §5). pending→{confirmed,cancelled};
 *  confirmed→{cancelled}. cancelled is terminal. */
export const LEGAL = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['cancelled']),
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

