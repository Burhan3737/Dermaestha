// @ts-check
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../../lib/prisma/prisma.js';
import { AppError } from '../../http/AppError.js';
import { hashPassword } from '../../lib/password/password.js';
import { env } from '../../config/env/env.js';
import * as audit from '../../services/audit/audit.service.js';
import { replaceBlocksForDoctor } from './service.js';

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

/** F10.02: PATCH editable fields. fullName/phone live on User; the rest on Doctor.
 *  pmcNumber/email never reach this function (rejected at the route, #8). */
export async function updateDoctor({ id, data, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const { fullName, phone, ...docFields } = data;
  const userFields = {
    ...(fullName !== undefined ? { fullName } : {}),
    ...(phone !== undefined ? { phone } : {}),
  };
  await prisma.$transaction(async (tx) => {
    if (Object.keys(userFields).length) {
      await tx.user.update({ where: { id: doctor.userId }, data: userFields });
    }
    if (Object.keys(docFields).length) {
      await tx.doctor.update({ where: { id }, data: docFields });
    }
  });
  await audit.record({
    eventType: 'doctor.updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
    meta: { fields: Object.keys(data) },
  });
}

/** F10.03 / #9: flips listing visibility ONLY — appointments, login, panel access untouched.
 *  First activation of a `pending` doctor also promotes status to `active` (Pending-State Rule). */
export async function setDoctorActive({ id, isActive, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const updated = await prisma.doctor.update({
    where: { id },
    data: isActive ? { isActive: true, status: 'active' } : { isActive: false },
  });
  await audit.record({
    eventType: isActive ? 'doctor.reactivated' : 'doctor.deactivated',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
  return updated;
}

/** DA5: admin-mediated recovery; the doctor must change it on next login (DA3). */
export async function resetDoctorPassword({ id, newPassword, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: doctor.userId },
    data: { passwordHash, mustChangePassword: true },
  });
  await audit.record({
    eventType: 'doctor.password_reset',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
}

/** Admin write of the weekly template (F10.01/.02). Same core + guard as the doctor-own path. */
export async function adminReplaceBlocks({ doctorId, blocks, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const result = await replaceBlocksForDoctor(doctorId, blocks);
  await audit.record({
    eventType: 'doctor.availability_updated',
    actorType: 'admin',
    actorId,
    targetRef: doctorId,
  });
  return result;
}

/** JPEG/PNG/WebP by magic bytes (F10.01). SVG and everything else → null (XSS vector). */
export function sniffImageExt(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** Writes the validated photo to UPLOADS_DIR (server-generated filename — no traversal). */
export async function saveDoctorPhoto({ id, buffer, actorId }) {
  const doctor = await prisma.doctor.findUnique({ where: { id }, select: { id: true, photoUrl: true } });
  if (!doctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
  const ext = sniffImageExt(buffer);
  if (!ext) throw new AppError('INVALID_FILE', 'Photo must be a JPEG, PNG, or WebP image.', 400);
  const dir = path.resolve(env.UPLOADS_DIR, 'doctors');
  await mkdir(dir, { recursive: true });
  const newFilename = `${id}.${ext}`;
  if (doctor.photoUrl) {
    const oldBasename = path.basename(doctor.photoUrl);
    if (oldBasename !== newFilename) {
      await unlink(path.join(dir, oldBasename)).catch(() => {});
    }
  }
  await writeFile(path.join(dir, newFilename), buffer);
  const photoUrl = `/uploads/doctors/${id}.${ext}`;
  await prisma.doctor.update({ where: { id }, data: { photoUrl } });
  await audit.record({
    eventType: 'doctor.photo_updated',
    actorType: 'admin',
    actorId,
    targetRef: id,
  });
  return { photoUrl };
}
