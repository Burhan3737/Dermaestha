// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { quoteRefund } from './refund.service.js';

const UPCOMING = ['confirmed', 'in_progress'];

function toPatientRow(a) {
  return {
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    feeAtBooking: a.feeAtBooking,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    doctorName: a.doctor.user.fullName,
    specialization: a.doctor.specialization,
    doctorPhotoUrl: a.doctor.photoUrl,
  };
}

export async function listForRole({ role, userId, scope = 'active' }) {
  if (role === 'patient') {
    const rows = await prisma.appointment.findMany({
      where: { patientUserId: userId, state: { in: UPCOMING } },
      orderBy: { slotStart: 'asc' },
      include: {
        doctor: {
          select: {
            id: true,
            specialization: true,
            photoUrl: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });
    return rows.map(toPatientRow);
  }
  const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) return [];
  const TERMINAL = ['completed', 'prescription_issued', 'patient_no_show', 'doctor_no_show',
    'cancelled_refunded', 'cancelled_no_refund', 'doctor_cancelled'];
  const where = scope === 'history'
    ? { doctorId: doctor.id, state: { in: TERMINAL } }
    : { doctorId: doctor.id, state: { in: UPCOMING } };
  const rows = await prisma.appointment.findMany({
    where, orderBy: { slotStart: scope === 'history' ? 'desc' : 'asc' },
    include: { patient: { select: { fullName: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    patientName: a.patient?.fullName ?? null,
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
    forSelf: a.forSelf,
    subjectName: a.subjectName,
    doctorName: a.doctor.user.fullName,
    specialization: a.doctor.specialization,
    doctorPhotoUrl: a.doctor.photoUrl,
  };
  detail.serverNow = new Date().toISOString();
  detail.peerJoined =
    role === 'patient' ? !!a.doctorJoinedAt : role === 'doctor' ? !!a.patientJoinedAt : false;
  if (a.state === 'confirmed') {
    detail.refundQuote = await quoteRefund(id).catch(() => null);
  }
  return detail;
}
