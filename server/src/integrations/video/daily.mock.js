// @ts-check
import crypto from 'node:crypto';
import { env } from '../../config/env/env.js';

const SECRET = env.VIDEO_MOCK_SECRET || 'dev-mock-video-secret';

/** @type {import('./index.js').VideoProvider} */
export const dailyMock = {
  async createRoom(appointmentId) {
    return {
      roomName: `appt_${appointmentId}`,
      roomUrl: `${env.APP_BASE_URL}/video/${appointmentId}`,
    };
  },
  async issueToken({ roomName, role, notBeforeIso, notAfterIso, displayName }) {
    const payload = `${roomName}|${role}|${notBeforeIso}|${notAfterIso}|${displayName}`;
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    const token = Buffer.from(`${payload}|${sig}`).toString('base64url');
    return { token, expiresAt: notAfterIso };
  },
  // DEV-ONLY: accepts the unsigned /dev/video/* simulator shape { type, room, user_name, timestamp }
  // and normalizes it. The role-from-user_name inference legitimately lives HERE (dev only) — the
  // real adapter (daily.js) anchors role to the token user_id instead. No signature is checked.
  verifyWebhook(req) {
    const b = req?.body ?? {};
    if (b.type !== 'participant.joined' && b.type !== 'participant.left') return null;
    const appointmentId = String(b.room ?? '').replace(/^appt_/, '');
    if (!appointmentId) return null;
    const role = String(b.user_name ?? '').toLowerCase().includes('doctor') ? 'doctor' : 'patient';
    return { type: b.type, appointmentId, role, timestamp: b.timestamp, eventId: b.id ?? null };
  },
};
