// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from '../lib/tz.js';
import { SLOT_GRANULARITY_MIN, ACTIVE_APPOINTMENT_STATES } from '../config/constants.js';

const SLOT_MS = SLOT_GRANULARITY_MIN * 60 * 1000;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export async function getWeeklyBlocks(doctorId) {
  const blocks = await prisma.availabilityBlock.findMany({
    where: { doctorId },
    select: { weekday: true, startTime: true, endTime: true },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
  });
  return blocks;
}

/** True if some block on the slot's Karachi weekday fully contains the 30-min slot [start, start+30min). */
function blocksCoverSlot(blocks, slotStartUtc, dateYMD) {
  const weekday = karachiWeekday(dateYMD);
  const startMin = toMinutes(formatInTimeZone(slotStartUtc, KARACHI, 'HH:mm'));
  const endMin = startMin + SLOT_GRANULARITY_MIN;
  return blocks.some(
    (b) =>
      b.weekday === weekday && startMin >= toMinutes(b.startTime) && endMin <= toMinutes(b.endTime),
  );
}

export async function generateSlots(doctorId, dateYMD, settings) {
  const weekday = karachiWeekday(dateYMD);
  const blocks = await prisma.availabilityBlock.findMany({ where: { doctorId, weekday } });
  if (blocks.length === 0) return [];

  const s = settings ?? (await prisma.settings.findUnique({ where: { id: 1 } }));
  const leadMin = s?.minBookingLeadMinutes ?? 60;
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
    where: {
      doctorId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { in: future.map((s) => s.slotStart) },
      // Lazy expiry: an expired slot_locked no longer occupies the slot (Slice C, ADR-23).
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: new Date() } },
    },
    select: { slotStart: true },
  });
  const taken = new Set(active.map((a) => a.slotStart.getTime()));

  return future
    .filter((s) => !taken.has(s.slotStart.getTime()))
    .map((s) => ({ slotStart: s.slotStart.toISOString(), slotEnd: s.slotEnd.toISOString() }));
}

export async function nextAvailableSlot(doctorId, days = 14) {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const today = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const dateYMD = formatInTimeZone(d, KARACHI, 'yyyy-MM-dd');
    const slots = await generateSlots(doctorId, dateYMD, settings); // eslint-disable-line no-await-in-loop
    if (slots.length > 0) return slots[0].slotStart;
  }
  return null;
}

export async function replaceWeeklyBlocks(userId, blocks) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor profile not found.', 404);

  const futureActive = await prisma.appointment.findMany({
    where: {
      doctorId: doctor.id,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { gt: new Date() },
      // Lazy expiry (ADR-23): an expired slot_locked no longer occupies the slot, so it must
      // not spuriously trigger BLOCK_HAS_BOOKINGS. Mirrors the exclusion in generateSlots.
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: new Date() } },
    },
    select: { id: true, slotStart: true },
  });
  const orphans = futureActive.filter((a) => {
    const dateYMD = formatInTimeZone(a.slotStart, KARACHI, 'yyyy-MM-dd');
    return !blocksCoverSlot(blocks, a.slotStart, dateYMD);
  });
  if (orphans.length > 0) {
    throw new AppError(
      'BLOCK_HAS_BOOKINGS',
      'Cancel the affected bookings before changing this availability.',
      409,
      {
        appointmentIds: orphans.map((o) => o.id),
      },
    );
  }

  await prisma.$transaction([
    prisma.availabilityBlock.deleteMany({ where: { doctorId: doctor.id } }),
    prisma.availabilityBlock.createMany({
      data: blocks.map((b) => ({ doctorId: doctor.id, ...b })),
    }),
  ]);
  return getWeeklyBlocks(doctor.id);
}
