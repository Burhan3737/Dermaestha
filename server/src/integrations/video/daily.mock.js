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
};
