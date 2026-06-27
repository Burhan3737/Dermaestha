// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from '../../lib/tz/tz.js';
import { SLOT_GRANULARITY_MIN, ACTIVE_APPOINTMENT_STATES } from '../../config/constants.js';
// Self-import so intra-module calls that tests stub (e.g. nextAvailableSlot) route through the
// module namespace and remain spy-able under ESM (vi.spyOn can't intercept a bare local call).
import * as self from './service.js';

const ACTIVE_WHERE = { isActive: true, status: 'active' };

export async function listActiveDoctors({ page, pageSize }) {
  const skip = (page - 1) * pageSize;
  const [rows, total] = await prisma.$transaction([
    prisma.doctor.findMany({
      where: ACTIVE_WHERE,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        specialization: true,
        fee: true,
        photoUrl: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.doctor.count({ where: ACTIVE_WHERE }),
  ]);
  const data = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      fullName: d.user.fullName,
      specialization: d.specialization,
      fee: d.fee,
      photoUrl: d.photoUrl,
      nextAvailableSlot: await self.nextAvailableSlot(d.id),
    })),
  );
  return { data, page: { number: page, size: pageSize, total } };
}

export async function getPublicDoctor(id) {
  const d = await prisma.doctor.findFirst({
    where: { id, ...ACTIVE_WHERE },
    select: {
      id: true,
      specialization: true,
      fee: true,
      bio: true,
      photoUrl: true,
      user: { select: { fullName: true } },
    },
  });
  if (!d) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  return {
    id: d.id,
    fullName: d.user.fullName,
    specialization: d.specialization,
    fee: d.fee,
    bio: d.bio,
    photoUrl: d.photoUrl,
  };
}

/** Used by the availability route to enforce doctor-owns-:id. Returns the Doctor or null. */
export async function getDoctorByUserId(userId) {
  return prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
}

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

/** Core block replacement, keyed by doctorId (shared by the doctor-own and admin paths).
 *  Enforces the BLOCK_HAS_BOOKINGS guard (edge #14) before replacing. */
export async function replaceBlocksForDoctor(doctorId, blocks) {
  const futureActive = await prisma.appointment.findMany({
    where: {
      doctorId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { gt: new Date() },
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
    prisma.availabilityBlock.deleteMany({ where: { doctorId } }),
    prisma.availabilityBlock.createMany({
      data: blocks.map((b) => ({ doctorId, ...b })),
    }),
  ]);
  return getWeeklyBlocks(doctorId);
}

export async function replaceWeeklyBlocks(userId, blocks) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor profile not found.', 404);
  return replaceBlocksForDoctor(doctor.id, blocks);
}
