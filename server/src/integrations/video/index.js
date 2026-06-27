// @ts-check
import { dailyStub } from './daily.stub.js';
import { dailyMock } from './daily.mock.js';
import { dailyReal } from './daily.js';
import { env } from '../../config/env/env.js';
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string, opts?: { notAfterIso?: string }) => Promise<{ roomName: string, roomUrl: string }>} createRoom
 *   Idempotent: reuses an existing appt_<id> room; otherwise creates a private, slot-bounded room.
 * @property {(args: { roomName: string, role: 'patient'|'doctor', notBeforeIso: string,
 *   notAfterIso: string, displayName: string }) => Promise<{ token: string, expiresAt: string }>} issueToken
 */
// Daily free tier: room + token only (no participant webhook). daily → real adapter; mock → dev
// sim; else → throwing stub.
export const videoProvider =
  env.VIDEO_PROVIDER === 'daily' ? dailyReal : env.VIDEO_PROVIDER === 'mock' ? dailyMock : dailyStub;
