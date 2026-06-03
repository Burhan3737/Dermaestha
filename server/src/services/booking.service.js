// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { KARACHI } from '../lib/tz.js';
import { SLOT_GRANULARITY_MIN, SLOT_LOCK_TTL_MIN, ACTIVE_APPOINTMENT_STATES } from '../config/constants.js';
import { generateSlots } from './availability.service.js';
import * as audit from './audit.service.js';

/**
 * Create a slot_locked hold for a patient. Validates the slot is genuinely bookable,
 * enforces Single-Lock + No-Overlap, then inserts — reclaiming an expired lock on collision.
 * @param {{ patientUserId: string, doctorId: string, slotStart: string,
 *   forSelf: boolean, subject?: { name: string, age: number, relation: string } }} args
 */
export async function lockSlot({ patientUserId, doctorId, slotStart, forSelf, subject }) {
  const slotStartDate = new Date(slotStart);
  const slotEnd = new Date(slotStartDate.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000);
  const now = new Date();

  // 1. The slot must currently be a real, future, lead-time-valid, un-taken slot.
  const dateYMD = formatInTimeZone(slotStartDate, KARACHI, 'yyyy-MM-dd');
  const slots = await generateSlots(doctorId, dateYMD);
  if (!slots.some((s) => s.slotStart === slotStartDate.toISOString())) {
    throw new AppError('SLOT_NOT_BOOKABLE', 'That slot is not available.', 422);
  }

  // 2. Single-Lock: no other live hold for this patient.
  const liveLock = await prisma.appointment.findFirst({
    where: { patientUserId, state: 'slot_locked', lockExpiresAt: { gt: now } },
    select: { id: true },
  });
  if (liveLock) throw new AppError('ACTIVE_LOCK_EXISTS', 'Finish your current booking first.', 409);

  // 3. No-Overlap: no active appointment overlapping [slotStart, slotEnd).
  const overlap = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { lt: slotEnd },
      slotEnd: { gt: slotStartDate },
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: now } },
    },
    select: { id: true },
  });
  if (overlap) throw new AppError('OVERLAP', 'You already have an appointment at this time.', 409);

  const data = {
    doctorId,
    patientUserId,
    slotStart: slotStartDate,
    slotEnd,
    state: 'slot_locked',
    lockExpiresAt: new Date(now.getTime() + SLOT_LOCK_TTL_MIN * 60 * 1000),
    forSelf,
    subjectName: subject?.name ?? null,
    subjectAge: subject?.age ?? null,
    subjectRelation: subject?.relation ?? null,
  };

  const created = await createWithReclaim(data, doctorId, slotStartDate, now);
  await audit.record({ eventType: 'appointment.slot_locked', actorType: 'patient', actorId: patientUserId, targetRef: created.id });
  return created;
}

async function createWithReclaim(data, doctorId, slotStartDate, now) {
  try {
    return await prisma.appointment.create({ data });
  } catch (e) {
    if (e?.code !== 'P2002') throw e;
    const blocker = await prisma.appointment.findFirst({
      where: { doctorId, slotStart: slotStartDate, state: 'slot_locked', lockExpiresAt: { lt: now } },
      select: { id: true },
    });
    if (!blocker) throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
    await prisma.appointment.delete({ where: { id: blocker.id } });
    try {
      return await prisma.appointment.create({ data });
    } catch (e2) {
      if (e2?.code === 'P2002') throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
      throw e2;
    }
  }
}
