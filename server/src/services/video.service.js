// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { videoProvider } from '../integrations/video/index.js';
import { env } from '../config/env.js';
import { VIDEO_TOKEN_PRE_MIN, VIDEO_TOKEN_POST_MIN } from '../config/constants.js';

const ACTIVE = ['confirmed', 'in_progress'];

async function loadVisible({ id, role, userId }) {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: { patient: { select: { fullName: true } }, doctor: { select: { user: { select: { fullName: true } } } } },
  });
  if (!a) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (role === 'patient' && a.patientUserId !== userId)
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (role === 'doctor') {
    const doc = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doc || doc.id !== a.doctorId) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  return a;
}

/** @param {{ id: string, role: 'patient'|'doctor', userId: string, now?: Date }} args */
export async function issueAppointmentToken({ id, role, userId, now = new Date() }) {
  const a = await loadVisible({ id, role, userId });
  if (!ACTIVE.includes(a.state)) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const open = a.slotStart.getTime() - VIDEO_TOKEN_PRE_MIN * 60000;
  const close = a.slotEnd.getTime() + VIDEO_TOKEN_POST_MIN * 60000;
  if (now.getTime() < open || now.getTime() > close)
    throw new AppError('VIDEO_WINDOW_CLOSED', 'The video room is not open for this time.', 422);

  const room = await videoProvider.createRoom(id);
  const displayName = role === 'doctor' ? a.doctor.user.fullName : a.patient?.fullName ?? 'Patient';
  const { token, expiresAt } = await videoProvider.issueToken({
    roomName: room.roomName, role,
    notBeforeIso: new Date(open).toISOString(),
    notAfterIso: new Date(close).toISOString(),
    displayName,
  });
  const joinSimUrl = env.VIDEO_PROVIDER === 'mock' ? '/dev/video/join' : null;
  return { token, expiresAt, roomName: room.roomName, roomUrl: room.roomUrl, serverNow: now.toISOString(), joinSimUrl };
}

/** Maps a documented Daily participant.joined event to the join column (first-join wins). */
export async function recordJoinFromDailyEvent({ type, room, user_name }) {
  if (type !== 'participant.joined') return;
  const id = String(room || '').replace(/^appt_/, '');
  if (!id) return;
  const a = await prisma.appointment.findUnique({ where: { id } });
  if (!a) return;
  const role = String(user_name).toLowerCase().includes('doctor') ? 'doctor' : 'patient';
  const field = role === 'doctor' ? 'doctorJoinedAt' : 'patientJoinedAt';
  if (a[field]) return; // first-join wins
  await prisma.appointment.update({ where: { id }, data: { [field]: new Date() } });
}
