// @ts-check
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';

/*
 * Daily.co video adapter (api.daily.co/v1, Bearer DAILY_API_KEY).
 *
 * The REST surface below was researched against the current official docs and is almost entirely
 * CONFIRMED. The ONE byte-sensitive risk is the webhook signed-string serialization (raw received
 * bytes vs JSON.stringify) — verifyWebhook runs HMAC over req.rawBody (the exact received bytes)
 * and MUST be validated against a live Daily delivery before go-live (doc 07 launch gate).
 * External host + paths live behind named constants so a single correction lands in one place.
 */

const API_BASE = 'https://api.daily.co/v1';
const ROOMS_PATH = '/rooms';
const TOKENS_PATH = '/meeting-tokens';
const DEFAULT_ROOM_TTL_SEC = 24 * 60 * 60; // room exp when no slot window is supplied

const roomNameFor = (appointmentId) => `appt_${appointmentId}`;
const toUnix = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const authHeaders = () => ({
  Authorization: `Bearer ${env.DAILY_API_KEY}`,
  'Content-Type': 'application/json',
});

/** GET /v1/rooms/:name → { roomName, roomUrl } if 200, else null. */
async function getRoom(name) {
  const res = await fetch(`${API_BASE}${ROOMS_PATH}/${name}`, { method: 'GET', headers: authHeaders() });
  if (!res.ok) return null;
  const body = await res.json();
  return { roomName: name, roomUrl: body.url };
}

/** @type {import('./index.js').VideoProvider} */
export const dailyReal = {
  async createRoom(appointmentId, { notAfterIso } = {}) {
    const name = roomNameFor(appointmentId);
    // 1. Idempotent reuse.
    const existing = await getRoom(name);
    if (existing) return existing;
    // 2. Create a private, slot-bounded room.
    const exp = notAfterIso ? toUnix(notAfterIso) : Math.floor(Date.now() / 1000) + DEFAULT_ROOM_TTL_SEC;
    const res = await fetch(`${API_BASE}${ROOMS_PATH}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name,
        privacy: 'private',
        properties: { exp, eject_at_room_exp: true, enable_prejoin_ui: true },
      }),
    });
    if (res.ok) {
      const body = await res.json();
      return { roomName: name, roomUrl: body.url };
    }
    // 3. Create race: a concurrent create already made the room (400). Confirm via GET — do NOT
    //    string-match the undocumented duplicate-name body.
    if (res.status === 400) {
      const raced = await getRoom(name);
      if (raced) return raced;
    }
    throw new AppError('VIDEO_ROOM_FAILED', `Daily createRoom responded ${res.status}`, 502);
  },

  async issueToken({ roomName, role, notBeforeIso, notAfterIso, displayName }) {
    const res = await fetch(`${API_BASE}${TOKENS_PATH}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: role === 'doctor',
          user_name: displayName,
          // Stable role anchor Daily echoes back as payload.user_id in participant events.
          user_id: role,
          nbf: toUnix(notBeforeIso),
          exp: toUnix(notAfterIso),
        },
      }),
    });
    if (!res.ok) {
      throw new AppError('VIDEO_TOKEN_FAILED', `Daily meeting-tokens responded ${res.status}`, 502);
    }
    const body = await res.json();
    return { token: body.token, expiresAt: notAfterIso };
  },
};
