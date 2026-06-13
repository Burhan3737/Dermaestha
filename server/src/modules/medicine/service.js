// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import * as audit from '../../services/audit/audit.service.js';

/** Builder dropdown source (F11.01): active catalogue only; deactivated medicines vanish
 *  from here but never from existing prescriptions (snapshot rule #5).
 *  includeInactive (admin catalogue view only) lifts the isActive filter so A-02 can reactivate. */
export async function list({ search, includeInactive = false } = {}) {
  return prisma.medicine.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { genericName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
  });
}

export async function create({ data, actorId }) {
  const med = await prisma.medicine.create({ data });
  await audit.record({
    eventType: 'medicine.created',
    actorType: 'admin',
    actorId,
    targetRef: med.id,
  });
  return med;
}

export async function update({ id, data, actorId }) {
  const med = await prisma.medicine.update({ where: { id }, data }).catch((e) => {
    if (e?.code === 'P2025') return null; // record not found
    throw e;
  });
  if (!med) throw new AppError('NOT_FOUND', 'Medicine not found.', 404);
  await audit.record({
    eventType: 'medicine.updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
    meta: { fields: Object.keys(data) },
  });
  return med;
}
