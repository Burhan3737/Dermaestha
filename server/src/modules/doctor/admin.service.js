// @ts-check
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { hashPassword } from '../../lib/password/password.js';
import { env } from '../../config/env/env.js';
import * as audit from '../../services/audit/audit.service.js';

/** Admin row shape for A-01 (incl. immutable fields, shown read-only in the UI). */
const toAdminRow = (d) => ({
  id: d.id,
  fullName: d.user.fullName,
  email: d.user.email,
  phone: d.user.phone,
  pmcNumber: d.pmcNumber,
  specialization: d.specialization,
  fee: d.fee,
  bio: d.bio,
  photoUrl: d.photoUrl,
  isActive: d.isActive,
  status: d.status,
  upcomingConfirmedCount: d._count.appointments,
});

/** A-01 list: every doctor (pending/active/deactivated) + Deactivation-Warning count (#9). */
export async function listAllDoctors() {
  const rows = await prisma.doctor.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { fullName: true, email: true, phone: true } },
      _count: {
        select: {
          appointments: { where: { state: 'confirmed', slotStart: { gt: new Date() } } },
        },
      },
    },
  });
  return rows.map(toAdminRow);
}

/**
 * F10.01 / DA1: one tx creates User(role=doctor, admin-set password, mustChangePassword=true)
 * + Doctor(pending, isActive=false — the Pending-State Rule) + the optional weekly template.
 */
export async function createDoctor({ data, actorId }) {
  const { initialPassword, blocks, fullName, email, phone, ...profile } = data;
  const passwordHash = await hashPassword(initialPassword);
  let doctor;
  try {
    doctor = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { role: 'doctor', email, phone, fullName, passwordHash, mustChangePassword: true },
      });
      const created = await tx.doctor.create({
        data: {
          userId: user.id,
          pmcNumber: profile.pmcNumber,
          specialization: profile.specialization,
          fee: profile.fee,
          bio: profile.bio,
          isActive: false,
          status: 'pending',
        },
      });
      if (blocks?.length) {
        await tx.availabilityBlock.createMany({
          data: blocks.map((b) => ({ doctorId: created.id, ...b })),
        });
      }
      return created;
    });
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'P2002') {
      const target = String(/** @type {any} */ (e)?.meta?.target ?? '');
      if (target.includes('pmc')) {
        throw new AppError('PMC_TAKEN', 'A doctor with this PMC number already exists.', 409);
      }
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
    }
    throw e;
  }
  await audit.record({
    eventType: 'doctor.created',
    actorType: 'admin',
    actorId,
    targetRef: doctor.id,
  });
  return doctor;
}
