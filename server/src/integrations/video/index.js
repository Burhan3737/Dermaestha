// @ts-check
import { dailyStub } from './daily.stub.js';
import { dailyMock } from './daily.mock.js';
import { dailyReal } from './daily.js';
import { env } from '../../config/env/env.js';
/**
 * @typedef {Object} NormalizedVideoEvent
 * @property {'participant.joined'|'participant.left'} type
 * @property {string} appointmentId   // payload.room with the 'appt_' prefix stripped
 * @property {'doctor'|'patient'} role  // anchored to the token user_id Daily echoes back
 * @property {string} timestamp       // ISO-8601 (joined_at; .left falls back to envelope event_ts)
 * @property {string} eventId         // Daily event id (for traceability)
 */
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string, opts?: { notAfterIso?: string }) => Promise<{ roomName: string, roomUrl: string }>} createRoom
 *   Idempotent: reuses an existing appt_<id> room; otherwise creates a private, slot-bounded room.
 * @property {(args: { roomName: string, role: 'patient'|'doctor', notBeforeIso: string,
 *   notAfterIso: string, displayName: string }) => Promise<{ token: string, expiresAt: string }>} issueToken
 * @property {(req: import('express').Request) => NormalizedVideoEvent | null} verifyWebhook
 *   Verify the signed Daily delivery + normalize it. THROWS AppError(INVALID_SIGNATURE, 401) on a
 *   bad signature; returns null for the test ping, unrelated events, and tokenless participants.
 */
// daily → real adapter; mock → dev sim (real webhook path + /dev/video/*); else → throwing stub.
export const videoProvider =
  env.VIDEO_PROVIDER === 'daily' ? dailyReal : env.VIDEO_PROVIDER === 'mock' ? dailyMock : dailyStub;
