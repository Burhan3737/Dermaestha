// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { nextAvailableSlot } from './availability.service.js';

const ACTIVE_WHERE = { isActive: true, status: 'active' };

export async function listActiveDoctors({ page, pageSize }) {
  const skip = (page - 1) * pageSize;
  const [rows, total] = await prisma.$transaction([
    prisma.doctor.findMany({
      where: ACTIVE_WHERE,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
      select: { id: true, specialization: true, fee: true, photoUrl: true, user: { select: { fullName: true } } },
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
      nextAvailableSlot: await nextAvailableSlot(d.id),
    })),
  );
  return { data, page: { number: page, size: pageSize, total } };
}

export async function getPublicDoctor(id) {
  const d = await prisma.doctor.findFirst({
    where: { id, ...ACTIVE_WHERE },
    select: { id: true, specialization: true, fee: true, bio: true, photoUrl: true, user: { select: { fullName: true } } },
  });
  if (!d) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  return { id: d.id, fullName: d.user.fullName, specialization: d.specialization, fee: d.fee, bio: d.bio, photoUrl: d.photoUrl };
}

/** Used by the availability route to enforce doctor-owns-:id. Returns the Doctor or null. */
export async function getDoctorByUserId(userId) {
  return prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
}
