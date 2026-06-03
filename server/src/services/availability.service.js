// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from '../lib/tz.js';
import { SLOT_GRANULARITY_MIN, ACTIVE_APPOINTMENT_STATES } from '../config/constants.js';

const SLOT_MS = SLOT_GRANULARITY_MIN * 60 * 1000;

export async function getWeeklyBlocks(doctorId) {
  const blocks = await prisma.availabilityBlock.findMany({
    where: { doctorId },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  return blocks;
}

/** True if some block on the slot's Karachi weekday contains [time, time+30min). */
function blocksCoverSlot(blocks, slotStartUtc, dateYMD) {
  const weekday = karachiWeekday(dateYMD);
  const hhmm = formatInTimeZone(slotStartUtc, KARACHI, 'HH:mm');
  return blocks.some((b) => b.weekday === weekday && hhmm >= b.startTime && hhmm < b.endTime);
}

export async function generateSlots(doctorId, dateYMD) {
  const weekday = karachiWeekday(dateYMD);
  const blocks = await prisma.availabilityBlock.findMany({ where: { doctorId, weekday } });
  if (blocks.length === 0) return [];

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const leadMin = settings?.minBookingLeadMinutes ?? 60;
  const earliest = Date.now() + leadMin * 60 * 1000;

  /** @type {{slotStart: Date, slotEnd: Date}[]} */
  const candidates = [];
  for (const b of blocks) {
    let cur = karachiWallTimeToUtc(dateYMD, b.startTime).getTime();
    const end = karachiWallTimeToUtc(dateYMD, b.endTime).getTime();
    while (cur + SLOT_MS <= end) {
      candidates.push({ slotStart: new Date(cur), slotEnd: new Date(cur + SLOT_MS) });
      cur += SLOT_MS;
    }
  }

  const future = candidates.filter((s) => s.slotStart.getTime() >= earliest);
  if (future.length === 0) return [];

  const active = await prisma.appointment.findMany({
    where: { doctorId, state: { in: ACTIVE_APPOINTMENT_STATES }, slotStart: { in: future.map((s) => s.slotStart) } },
    select: { slotStart: true },
  });
  const taken = new Set(active.map((a) => a.slotStart.getTime()));

  return future
    .filter((s) => !taken.has(s.slotStart.getTime()))
    .map((s) => ({ slotStart: s.slotStart.toISOString(), slotEnd: s.slotEnd.toISOString() }));
}

export async function nextAvailableSlot(doctorId, days = 14) {
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dateYMD = formatInTimeZone(d, KARACHI, 'yyyy-MM-dd');
    const slots = await generateSlots(doctorId, dateYMD); // eslint-disable-line no-await-in-loop
    if (slots.length > 0) return slots[0].slotStart;
  }
  return null;
}

export async function replaceWeeklyBlocks(userId, blocks) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor profile not found.', 404);

  const futureActive = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, state: { in: ACTIVE_APPOINTMENT_STATES }, slotStart: { gt: new Date() } },
    select: { id: true, slotStart: true },
  });
  const orphans = futureActive.filter((a) => {
    const dateYMD = formatInTimeZone(a.slotStart, KARACHI, 'yyyy-MM-dd');
    return !blocksCoverSlot(blocks, a.slotStart, dateYMD);
  });
  if (orphans.length > 0) {
    throw new AppError('BLOCK_HAS_BOOKINGS', 'Cancel the affected bookings before changing this availability.', 409, {
      appointmentIds: orphans.map((o) => o.id),
    });
  }

  await prisma.$transaction([
    prisma.availabilityBlock.deleteMany({ where: { doctorId: doctor.id } }),
    prisma.availabilityBlock.createMany({ data: blocks.map((b) => ({ doctorId: doctor.id, ...b })) }),
  ]);
  return getWeeklyBlocks(doctor.id);
}
