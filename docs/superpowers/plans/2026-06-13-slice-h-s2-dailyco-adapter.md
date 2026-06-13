# Slice H · S2 — Daily.co Video Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-ready `daily.js` `VideoProvider` against `api.daily.co/v1` (idempotent `createRoom`, time-bound `issueToken`, and a new signed-webhook `verifyWebhook`), move webhook verification + role normalization into the adapter, and delete the ADR-24 dev role-inference hack from production code — keeping the dev `mock`/simulator path green.

**Architecture:** The adapter mirrors the just-merged PayFast S1 pattern: `fetch`-based HTTP, Bearer auth, non-2xx → `AppError`, external host/paths behind named constants. `verifyWebhook(req)` runs constant-time HMAC over the **raw** received bytes, returns a `NormalizedVideoEvent | null`, and throws `AppError('INVALID_SIGNATURE', …, 401)` on a bad signature. The controller mirrors the payment controller (verify → on bad sig audit `video.webhook_rejected` + 401; on success record the normalized event). Role is anchored to the token's `user_id` (`doctor`/`patient`) that Daily echoes back, not the display name. The mock adapter keeps a dev-only `verifyWebhook` that accepts the unsigned `/dev/video/*` simulator shape and is where the legitimate dev role-from-`user_name` inference now lives.

**Tech Stack:** Node ESM, Express, `node:crypto` (HMAC-SHA256, `timingSafeEqual`), `fetch`, Zod env, Vitest (HTTP-mocked unit tests + supertest integration). Workspace: `server/` (+ shared) and `client/`.

---

## Decision log / deviations (read before coding)

These were uncovered while reading the codebase against the design spec. They are surgical interpretations, not scope changes:

1. **Raw-body capture cannot be a *second* route-scoped parser.** `server/src/index.js` already calls `app.use(express.json())` globally, and `express.json` is idempotent — it short-circuits when `req._body` is set, so a second `express.json({ verify })` mounted on the route would **never run its `verify` callback** and `req.rawBody` would stay undefined. Fix (Task 6): make the *global* parser **skip** `/api/webhooks/daily`, and mount the `express.json({ verify })` (which captures `req.rawBody`) **on the daily route inside the video module** — so it is the only parser for that path and the `verify` callback actually fires. Observable result == the spec's intent (rawBody captured, scoped to that path), with the parser living in the video module as the design describes.

2. **`recordJoinFromDailyEvent` has three call sites, not one.** The controller (`modules/video/controller.js`) plus **two** dev-simulator calls in `dev/devVideo.js`. All three must move to the normalized contract. Per design §4 the dev simulator now records *through* `mock.verifyWebhook` (Task 7).

3. **`.left` timestamp field is unconfirmed.** The design normalizes `timestamp = payload.joined_at` for joins and says ".left → its own ts", but only `joined_at` and the envelope-level `event_ts` are [CONFIRMED] fields. To avoid inventing a `left_at` field, normalize `timestamp = payload.joined_at ?? body.event_ts`. The exact `.left` timestamp field is a doc-07 live-delivery gate item.

4. **Test-ping ordering.** Per design §2 the create-time `{"test":"test"}` ping is handled **after** signature verification → `null`. We implement verify-first as specified; if Daily's test ping turns out to be unsigned it would 401 — flagged as a live-delivery gate item (doc 07).

5. **New error codes.** `createRoom`/`issueToken` non-2xx map to `VIDEO_ROOM_FAILED` / `VIDEO_TOKEN_FAILED` (HTTP 502), mirroring PayFast's `PAYMENT_INIT_FAILED`. These are internal envelope codes (doc 05 §3.2 is illustrative, not an exhaustive enum).

---

## File structure

| Path | C/M | Responsibility |
| ---- | --- | -------------- |
| `server/src/integrations/video/daily.js` | Create | Real `VideoProvider`: `createRoom`, `issueToken`, `verifyWebhook` |
| `server/src/integrations/video/daily.test.js` | Create | HTTP-mocked unit tests for the real adapter |
| `server/src/integrations/video/index.js` | Modify | Provider selection (`daily→dailyReal`) + `VideoProvider`/`NormalizedVideoEvent` typedefs |
| `server/src/integrations/video/daily.stub.js` | Modify | `verifyWebhook` throws `NOT_IMPLEMENTED` |
| `server/src/integrations/video/daily.mock.js` | Modify | Dev-only `verifyWebhook` (accepts simulator shape, normalizes; dev role-from-`user_name` lives here) |
| `server/src/integrations/video/daily.mock.test.js` | Modify | Add `verifyWebhook` mock tests |
| `server/src/modules/video/service.js` | Modify | `recordJoinFromDailyEvent` takes the normalized event; drop `appt_` strip + `user_name` inference |
| `server/src/modules/video/controller.js` | Modify | `verifyWebhook` → 401 + `video.webhook_rejected` audit on bad sig; record normalized event |
| `server/src/modules/video/index.js` | Modify | Mount `express.json({ verify })` raw-body parser on the `/daily` route |
| `server/src/modules/video/test.js` | Modify | Update service + controller tests to the normalized contract |
| `server/src/index.js` | Modify | Global JSON parser skips `/api/webhooks/daily` (so the route parser owns it) |
| `server/src/config/env/env.js` | Modify | Add `DAILY_WEBHOOK_SECRET` (optional string) |
| `server/src/dev/devVideo.js` | Modify | Record joins through `videoProvider.verifyWebhook` |
| `server/scripts/register-daily-webhook.mjs` | Create | One-time ops helper: register the Daily webhook, print the `hmac` secret |

**Out of scope (do not touch):** anything under `agentChangeLogs/`, `docs/superpowers/specs/`, or `docs/specification/` (00–15). Video consultation UI (S3). PayFast (S1).

---

### Task 1: Real `daily.js` adapter (createRoom + issueToken + verifyWebhook)

**Files:**
- Create: `server/src/integrations/video/daily.js`
- Test: `server/src/integrations/video/daily.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/src/integrations/video/daily.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

// Base64 of the raw secret bytes — Daily returns the hmac as base64; we base64-DECODE it as the key.
const RAW_SECRET = 'super-secret-bytes';
const SECRET_B64 = Buffer.from(RAW_SECRET).toString('base64');

vi.mock('../../config/env/env.js', () => ({
  env: {
    DAILY_API_KEY: 'dk_test',
    DAILY_DOMAIN: 'dermestha.daily.co',
    DAILY_WEBHOOK_SECRET: SECRET_B64,
    VIDEO_PROVIDER: 'daily',
    NODE_ENV: 'test',
  },
}));

import { dailyReal } from './daily.js';

const sign = (ts, raw) =>
  crypto.createHmac('sha256', Buffer.from(SECRET_B64, 'base64')).update(`${ts}.${raw}`).digest('base64');

const signedReq = (bodyObj, { ts = '1700000000', tamper = false } = {}) => {
  const raw = JSON.stringify(bodyObj);
  let sig = sign(ts, raw);
  if (tamper) sig = sign(ts, raw + 'x'); // valid format, wrong content
  return {
    headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': sig },
    rawBody: raw,
    body: bodyObj,
  };
};

describe('dailyReal.createRoom', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('reuses an existing room when GET /rooms/:name returns 200 (idempotent)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
    });
    const out = await dailyReal.createRoom('a1', { notAfterIso: '2026-06-04T10:35:00.000Z' });
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.daily.co/v1/rooms/appt_a1');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer dk_test');
  });

  it('creates a private room (exp from notAfterIso, eject_at_room_exp, prejoin) when GET 404s', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
      });
    const out = await dailyReal.createRoom('a1', { notAfterIso: '2026-06-04T10:35:00.000Z' });
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('https://api.daily.co/v1/rooms');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('appt_a1');
    expect(body.privacy).toBe('private');
    expect(body.properties.exp).toBe(Math.floor(new Date('2026-06-04T10:35:00.000Z').getTime() / 1000));
    expect(body.properties.eject_at_room_exp).toBe(true);
    expect(body.properties.enable_prejoin_ui).toBe(true);
  });

  it('falls back to GET when POST races to a 400 duplicate (no body string-matching)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }) // initial GET
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'whatever' }) }) // POST race
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
      }); // GET fallback
    const out = await dailyReal.createRoom('a1');
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('maps a non-2xx create (non-400) to VIDEO_ROOM_FAILED (502)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(dailyReal.createRoom('a1')).rejects.toMatchObject({
      code: 'VIDEO_ROOM_FAILED',
      status: 502,
    });
  });
});

describe('dailyReal.issueToken', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it('POSTs meeting-tokens with role-anchored user_id + is_owner and returns notAfter as expiresAt', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'tok_1' }) });
    const out = await dailyReal.issueToken({
      roomName: 'appt_a1',
      role: 'doctor',
      notBeforeIso: '2026-06-04T09:50:00.000Z',
      notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Dr Sara Khan',
    });
    expect(out).toEqual({ token: 'tok_1', expiresAt: '2026-06-04T10:35:00.000Z' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.daily.co/v1/meeting-tokens');
    const props = JSON.parse(init.body).properties;
    expect(props.room_name).toBe('appt_a1');
    expect(props.is_owner).toBe(true);
    expect(props.user_name).toBe('Dr Sara Khan');
    expect(props.user_id).toBe('doctor');
    expect(props.nbf).toBe(Math.floor(new Date('2026-06-04T09:50:00.000Z').getTime() / 1000));
    expect(props.exp).toBe(Math.floor(new Date('2026-06-04T10:35:00.000Z').getTime() / 1000));
  });

  it('sets is_owner false for a patient and maps a non-2xx to VIDEO_TOKEN_FAILED (502)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 't' }) });
    const out = await dailyReal.issueToken({
      roomName: 'appt_a1', role: 'patient',
      notBeforeIso: '2026-06-04T09:50:00.000Z', notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Pat',
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).properties.is_owner).toBe(false);
    expect(out.token).toBe('t');

    fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      dailyReal.issueToken({
        roomName: 'appt_a1', role: 'patient',
        notBeforeIso: '2026-06-04T09:50:00.000Z', notAfterIso: '2026-06-04T10:35:00.000Z', displayName: 'Pat',
      }),
    ).rejects.toMatchObject({ code: 'VIDEO_TOKEN_FAILED', status: 502 });
  });
});

describe('dailyReal.verifyWebhook', () => {
  it('verifies a valid signature and normalizes a participant.joined event', () => {
    const evt = dailyReal.verifyWebhook(
      signedReq({
        version: '1.0.0',
        type: 'participant.joined',
        id: 'evt_1',
        event_ts: '2026-06-04T10:01:00.000Z',
        payload: { room: 'appt_a1', user_id: 'patient', user_name: 'Pat', owner: false, joined_at: '2026-06-04T10:01:00.000Z' },
      }),
    );
    expect(evt).toEqual({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'patient',
      timestamp: '2026-06-04T10:01:00.000Z',
      eventId: 'evt_1',
    });
  });

  it('derives role from token user_id even when user_name is a real display name', () => {
    const evt = dailyReal.verifyWebhook(
      signedReq({
        type: 'participant.joined', id: 'evt_2',
        payload: { room: 'appt_a1', user_id: 'doctor', user_name: 'Sara Khan', owner: true, joined_at: '2026-06-04T10:00:00.000Z' },
      }),
    );
    expect(evt.role).toBe('doctor');
  });

  it('throws INVALID_SIGNATURE (401) on a tampered signature', () => {
    expect(() =>
      dailyReal.verifyWebhook(
        signedReq({ type: 'participant.joined', id: 'e', payload: { room: 'appt_a1', user_id: 'patient', joined_at: 't' } }, { tamper: true }),
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_SIGNATURE', status: 401 }));
  });

  it('returns null for the create-time test ping {"test":"test"}', () => {
    expect(dailyReal.verifyWebhook(signedReq({ test: 'test' }))).toBeNull();
  });

  it('returns null for a tokenless, non-owner participant (never guesses role)', () => {
    const evt = dailyReal.verifyWebhook(
      signedReq({ type: 'participant.joined', id: 'e', payload: { room: 'appt_a1', owner: false, joined_at: 't' } }),
    );
    expect(evt).toBeNull();
  });

  it('normalizes participant.left (timestamp falls back to event_ts)', () => {
    const evt = dailyReal.verifyWebhook(
      signedReq({
        type: 'participant.left', id: 'evt_3', event_ts: '2026-06-04T10:20:00.000Z',
        payload: { room: 'appt_a1', user_id: 'doctor', owner: true },
      }),
    );
    expect(evt).toEqual({
      type: 'participant.left', appointmentId: 'a1', role: 'doctor',
      timestamp: '2026-06-04T10:20:00.000Z', eventId: 'evt_3',
    });
  });

  it('returns null for an unrelated event type', () => {
    expect(
      dailyReal.verifyWebhook(signedReq({ type: 'recording.started', id: 'e', payload: {} })),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- daily.test`
Expected: FAIL — `Cannot find module './daily.js'` / `dailyReal is not defined`.

- [ ] **Step 3: Write `server/src/integrations/video/daily.js`**

```js
// @ts-check
import crypto from 'node:crypto';
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
const JOIN_EVENTS = new Set(['participant.joined', 'participant.left']);

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

  verifyWebhook(req) {
    const timestamp = req.headers?.['x-webhook-timestamp'];
    const signature = req.headers?.['x-webhook-signature'];
    const rawBody = req.rawBody ?? '';
    // signedContent = `${timestamp}.${rawBody}`; HMAC-SHA256 keyed on the base64-DECODED secret;
    // output base64; constant-time compare. RAW bytes, not JSON.stringify (doc 07 live-delivery gate).
    const key = Buffer.from(env.DAILY_WEBHOOK_SECRET ?? '', 'base64');
    const expected = crypto.createHmac('sha256', key).update(`${timestamp}.${rawBody}`).digest('base64');
    const provided = typeof signature === 'string' ? signature : '';
    const ok =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!ok) throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed.', 401);

    const body = req.body ?? {};
    // Create-time verification ping — ack with nothing to record.
    if (body.test === 'test') return null;
    if (!JOIN_EVENTS.has(body.type)) return null;

    const payload = body.payload ?? {};
    const appointmentId = String(payload.room ?? '').replace(/^appt_/, '');
    const role =
      payload.user_id === 'doctor'
        ? 'doctor'
        : payload.user_id === 'patient'
          ? 'patient'
          : payload.owner
            ? 'doctor'
            : null;
    // Tokenless / knocking participant — never guess a role.
    if (!appointmentId || !role) return null;
    return {
      type: body.type,
      appointmentId,
      role,
      // joined_at for joins; .left has no confirmed participant ts → fall back to envelope event_ts.
      timestamp: payload.joined_at ?? body.event_ts,
      eventId: body.id,
    };
  },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- daily.test`
Expected: PASS (all `dailyReal` describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/video/daily.js server/src/integrations/video/daily.test.js
git commit -m "feat(video): real Daily.co adapter — createRoom/issueToken/verifyWebhook (S2)"
```

---

### Task 2: Provider selection + contract typedefs + stub `verifyWebhook`

**Files:**
- Modify: `server/src/integrations/video/index.js`
- Modify: `server/src/integrations/video/daily.stub.js`

- [ ] **Step 1: Wire selection + typedefs in `index.js`**

Replace the entire contents of `server/src/integrations/video/index.js` with:

```js
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
```

- [ ] **Step 2: Add `verifyWebhook` to the stub**

Replace the entire contents of `server/src/integrations/video/daily.stub.js` with:

```js
// @ts-check
import { AppError } from '../../http/AppError.js';
const ni = (m) => async () => {
  throw new AppError('NOT_IMPLEMENTED', `daily.${m} is M2`, 501);
};
/** @type {import('./index.js').VideoProvider} */
export const dailyStub = {
  createRoom: ni('createRoom'),
  issueToken: ni('issueToken'),
  verifyWebhook() {
    throw new AppError('NOT_IMPLEMENTED', 'daily.verifyWebhook is M2', 501);
  },
};
```

- [ ] **Step 3: Run the existing adapter + integration tests to verify nothing broke**

Run: `npm test -- video`
Expected: PASS — `daily.test`, `daily.mock.test`, and the existing video integration/service tests still green (no behavior change yet; `daily.js` now imports cleanly into `index.js`).

- [ ] **Step 4: Commit**

```bash
git add server/src/integrations/video/index.js server/src/integrations/video/daily.stub.js
git commit -m "feat(video): select dailyReal for VIDEO_PROVIDER=daily + verifyWebhook contract (S2)"
```

---

### Task 3: Dev-only `mock.verifyWebhook`

**Files:**
- Modify: `server/src/integrations/video/daily.mock.js`
- Test: `server/src/integrations/video/daily.mock.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `server/src/integrations/video/daily.mock.test.js` (inside the existing `describe('daily.mock VideoProvider', …)` block, after the existing `it(...)` cases):

```js
  it('verifyWebhook normalizes the unsigned dev-simulator shape (role from user_name)', () => {
    const evt = dailyMock.verifyWebhook({
      body: { type: 'participant.joined', room: 'appt_a1', user_name: 'doctor', timestamp: '2026-06-04T10:00:00.000Z' },
    });
    expect(evt).toMatchObject({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'doctor',
      timestamp: '2026-06-04T10:00:00.000Z',
    });
  });

  it('verifyWebhook maps a non-doctor user_name to patient', () => {
    const evt = dailyMock.verifyWebhook({
      body: { type: 'participant.joined', room: 'appt_a1', user_name: 'patient', timestamp: 't' },
    });
    expect(evt.role).toBe('patient');
  });

  it('verifyWebhook returns null for an empty/unknown body', () => {
    expect(dailyMock.verifyWebhook({ body: {} })).toBeNull();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- daily.mock.test`
Expected: FAIL — `dailyMock.verifyWebhook is not a function`.

- [ ] **Step 3: Add `verifyWebhook` to the mock**

In `server/src/integrations/video/daily.mock.js`, add a `verifyWebhook` method to the `dailyMock` object (after `issueToken`). The object becomes:

```js
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
```

(Leave the `import` lines and the `SECRET` const at the top of the file unchanged.)

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- daily.mock.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/video/daily.mock.js server/src/integrations/video/daily.mock.test.js
git commit -m "feat(video): dev-only mock.verifyWebhook normalizes the simulator shape (S2)"
```

---

### Task 4: `recordJoinFromDailyEvent` takes the normalized event

**Files:**
- Modify: `server/src/modules/video/service.js:59-78`
- Test: `server/src/modules/video/test.js:92-119`

- [ ] **Step 1: Update the service tests to the normalized contract**

In `server/src/modules/video/test.js`, replace the entire `describe('recordJoinFromDailyEvent', …)` block (lines ~92-119) with:

```js
describe('recordJoinFromDailyEvent', () => {
  it('sets patientJoinedAt on first patient join only', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: null });
    await recordJoinFromDailyEvent({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'patient',
      timestamp: '2026-06-04T10:01:00.000Z',
      eventId: 'evt_1',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: { patientJoinedAt: new Date('2026-06-04T10:01:00.000Z') },
      }),
    );
  });

  it('sets doctorJoinedAt from a doctor-role normalized event', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, doctorJoinedAt: null });
    await recordJoinFromDailyEvent({
      type: 'participant.joined', appointmentId: 'a1', role: 'doctor',
      timestamp: '2026-06-04T10:00:00.000Z', eventId: 'e',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { doctorJoinedAt: new Date('2026-06-04T10:00:00.000Z') } }),
    );
  });

  it('does not overwrite an existing join timestamp (first-join wins)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: SLOT_START });
    await recordJoinFromDailyEvent({
      type: 'participant.joined', appointmentId: 'a1', role: 'patient',
      timestamp: '2026-06-04T10:05:00.000Z', eventId: 'e',
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('ignores participant.left (no join column write)', async () => {
    await recordJoinFromDailyEvent({
      type: 'participant.left', appointmentId: 'a1', role: 'doctor', timestamp: 't', eventId: 'e',
    });
    expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- modules/video/test`
Expected: FAIL — the service still destructures `{ room, user_name }`, so `appointmentId`/`role` are undefined and the first test's `update` assertion fails.

- [ ] **Step 3: Rewrite the service function**

In `server/src/modules/video/service.js`, replace the whole `recordJoinFromDailyEvent` function (lines 59-78) with:

```js
/**
 * Records a NORMALIZED Daily participant.joined event to the join column (first-join wins).
 * Verification + role normalization happen in the adapter's verifyWebhook (doc 14 §1); this
 * function no longer strips 'appt_' or infers role from user_name (ADR-24 hack removed).
 * @param {import('../../integrations/video/index.js').NormalizedVideoEvent} evt
 */
export async function recordJoinFromDailyEvent({ type, appointmentId, role, timestamp }) {
  if (type !== 'participant.joined') return;
  if (!appointmentId || !role) return;
  const a = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!a) return;
  const field = role === 'doctor' ? 'doctorJoinedAt' : 'patientJoinedAt';
  if (a[field]) return; // first-join wins
  // Prefer the event's own timestamp (a delayed webhook must not record server-receipt time).
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { [field]: timestamp ? new Date(timestamp) : new Date() },
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- modules/video/test`
Expected: the `recordJoinFromDailyEvent` block PASSES. (The `daily webhook` controller block in the same file is updated in Task 5 — it may fail at this point; that is expected and fixed next.)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/video/service.js server/src/modules/video/test.js
git commit -m "refactor(video): recordJoinFromDailyEvent takes normalized event; drop ADR-24 hack (S2)"
```

---

### Task 5: Controller verifies + audits + 401s (mirrors payment controller)

**Files:**
- Modify: `server/src/modules/video/controller.js`
- Test: `server/src/modules/video/test.js` (the `daily webhook` describe block + the `videoProvider` mock at the top)

- [ ] **Step 1: Update the controller test + mock**

In `server/src/modules/video/test.js`:

(a) Add `verifyWebhook` to the mocked `videoProvider` (the `vi.mock('../../integrations/video/index.js', …)` block near the top) so it becomes:

```js
vi.mock('../../integrations/video/index.js', () => ({
  videoProvider: {
    createRoom: vi.fn(async (id) => ({ roomName: `appt_${id}`, roomUrl: `u/${id}` })),
    issueToken: vi.fn(async () => ({ token: 'tok', expiresAt: '2026-06-04T10:35:00.000Z' })),
    verifyWebhook: vi.fn(),
  },
}));
```

(b) Add the audit + logger mocks just below the existing `vi.mock('../../integrations/video/index.js', …)` block:

```js
vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn(async () => {}) }));
vi.mock('../../lib/logger/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));
```

(c) Add `videoProvider` and `audit` to the imports (after the existing imports):

```js
import { videoProvider } from '../../integrations/video/index.js';
import * as audit from '../../services/audit/audit.service.js';
import { AppError } from '../../http/AppError.js';
```

(d) Replace the entire `describe('daily webhook', …)` block with:

```js
describe('daily webhook', () => {
  it('records a verified, normalized event and 200s', async () => {
    const evt = { type: 'participant.joined', appointmentId: 'a1', role: 'doctor', timestamp: 't', eventId: 'e' };
    videoProvider.verifyWebhook.mockReturnValue(evt);
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const res = { json: vi.fn() };
    const next = vi.fn();
    await daily({ headers: {}, body: {}, rawBody: '{}' }, res, next);
    expect(spy).toHaveBeenCalledWith(evt);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not record when verifyWebhook returns null (test ping / tokenless) but still 200s', async () => {
    videoProvider.verifyWebhook.mockReturnValue(null);
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const res = { json: vi.fn() };
    await daily({ headers: {}, body: { test: 'test' }, rawBody: '{}' }, res, vi.fn());
    expect(spy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    spy.mockRestore();
  });

  it('on a bad signature: audits video.webhook_rejected and forwards a 401, never recording', async () => {
    videoProvider.verifyWebhook.mockImplementation(() => {
      throw new AppError('INVALID_SIGNATURE', 'bad', 401);
    });
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const next = vi.fn();
    await daily({ headers: {}, body: {}, rawBody: 'x' }, { json: vi.fn() }, next);
    expect(spy).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'video.webhook_rejected', actorType: 'system' }),
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_SIGNATURE', status: 401 }));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- modules/video/test`
Expected: FAIL — the controller still calls `recordJoinFromDailyEvent(req.body)` directly and never calls `verifyWebhook`/`audit`.

- [ ] **Step 3: Rewrite the controller**

Replace the entire contents of `server/src/modules/video/controller.js` with:

```js
// @ts-check
import { videoProvider } from '../../integrations/video/index.js';
import * as videoService from './service.js';
import * as audit from '../../services/audit/audit.service.js';
import { AppError } from '../../http/AppError.js';
import { logger } from '../../lib/logger/logger.js';

// Daily participant events (doc 14 §3). Public route — authenticity comes from the signature.
export async function daily(req, res, next) {
  let evt;
  try {
    evt = videoProvider.verifyWebhook(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('daily webhook signature rejected');
    await audit
      .record({ eventType: 'video.webhook_rejected', actorType: 'system', reason: 'bad signature' })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Webhook rejected.', 401),
    );
  }
  try {
    if (evt) await videoService.recordJoinFromDailyEvent(evt);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- modules/video/test`
Expected: PASS (all blocks).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/video/controller.js server/src/modules/video/test.js
git commit -m "feat(video): webhook controller verifies + audits video.webhook_rejected on 401 (S2)"
```

---

### Task 6: Raw-body capture on the Daily webhook route

**Files:**
- Modify: `server/src/index.js:21` (global JSON parser)
- Modify: `server/src/modules/video/index.js`

- [ ] **Step 1: Make the global JSON parser skip the daily webhook path**

In `server/src/index.js`, replace line 21 (`app.use(express.json());`) with:

```js
  // Global JSON body parser, EXCEPT the Daily webhook — that route mounts its own
  // express.json({ verify }) to capture req.rawBody for byte-correct HMAC (express.json is
  // idempotent, so a second parser behind this one would never run its verify callback).
  app.use((req, res, next) => {
    if (req.path === '/api/webhooks/daily') return next();
    return express.json()(req, res, next);
  });
```

- [ ] **Step 2: Mount the raw-body parser on the daily route**

Replace the entire contents of `server/src/modules/video/index.js` with:

```js
// @ts-check
import { Router } from 'express';
import express from 'express';
import * as c from './controller.js';

export const videoWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie. This route owns its
// JSON parsing so the verify callback can capture the exact received bytes for HMAC verification.
// VALIDATE raw-body vs JSON.stringify against a live Daily delivery before go-live (doc 07 gate).
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf.toString('utf8');
};
videoWebhookRouter.post('/daily', express.json({ verify: captureRawBody }), c.daily);
```

- [ ] **Step 3: Run the video integration test (mock provider, end-to-end through the route)**

Run: `npm test -- video.integration`
Expected: PASS — `/api/webhooks/daily` posts (no signature headers, mock provider) still record both joins and the appointment reaches `completed`. The route parser sets `req.body` (+`req.rawBody`); `mock.verifyWebhook` reads `req.body`.

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js server/src/modules/video/index.js
git commit -m "feat(video): capture raw body on /api/webhooks/daily for HMAC verification (S2)"
```

---

### Task 7: Route the dev simulator through `verifyWebhook`

**Files:**
- Modify: `server/src/dev/devVideo.js`

- [ ] **Step 1: Rewire both dev recording paths**

In `server/src/dev/devVideo.js`:

(a) Add the provider import after the existing imports (after line 5):

```js
import { videoProvider } from '../integrations/video/index.js';
```

(b) Replace the body of the `POST /video/event` handler (the `try` block contents) with:

```js
    try {
      const evt = videoProvider.verifyWebhook({
        body: {
          type: 'participant.joined',
          room: req.body.room,
          user_name: req.body.user_name,
          timestamp: new Date().toISOString(),
        },
      });
      if (evt) await videoService.recordJoinFromDailyEvent(evt);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
```

(c) Replace the body of the `POST /video/join` handler (the `try` block contents) with:

```js
    try {
      const role = req.session?.role === 'doctor' ? 'doctor' : 'patient';
      const evt = videoProvider.verifyWebhook({
        body: {
          type: 'participant.joined',
          room: `appt_${req.body.appointmentId}`,
          user_name: role,
          timestamp: new Date().toISOString(),
        },
      });
      if (evt) await videoService.recordJoinFromDailyEvent(evt);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
```

- [ ] **Step 2: Run the full video + integration suite**

Run: `npm test -- video`
Expected: PASS — the dev simulator now normalizes through `mock.verifyWebhook` before recording; the integration test (which hits `/dev`-equivalent recording via the webhook route) stays green.

- [ ] **Step 3: Commit**

```bash
git add server/src/dev/devVideo.js
git commit -m "refactor(dev): route the video simulator through verifyWebhook normalization (S2)"
```

---

### Task 8: Config + webhook-registration ops helper

**Files:**
- Modify: `server/src/config/env/env.js:19-22`
- Create: `server/scripts/register-daily-webhook.mjs`

- [ ] **Step 1: Add `DAILY_WEBHOOK_SECRET` to the env schema**

In `server/src/config/env/env.js`, add the `DAILY_WEBHOOK_SECRET` line immediately after the `DAILY_DOMAIN` line (line 20), so the Daily block reads:

```js
  DAILY_API_KEY: z.string().optional(),
  DAILY_DOMAIN: z.string().optional(),
  // Daily webhook HMAC secret (the `hmac` returned by POST /v1/webhooks). Base64; optional until
  // the webhook is registered. See server/scripts/register-daily-webhook.mjs.
  DAILY_WEBHOOK_SECRET: z.string().optional(),
  VIDEO_PROVIDER: z.enum(['stub', 'mock', 'daily']).default('stub'),
```

- [ ] **Step 2: Create the ops helper script**

Create `server/scripts/register-daily-webhook.mjs`:

```js
#!/usr/bin/env node
// One-time OPS step (NOT runtime). Registers the Daily webhook for participant join/leave events
// and prints the `hmac` secret to copy into DAILY_WEBHOOK_SECRET.
//
// Usage:
//   DAILY_API_KEY=dk_xxx APP_BASE_URL=https://app.example.com node server/scripts/register-daily-webhook.mjs
//
// retryType 'exponential' is deliberate: the default 'circuit-breaker' DISABLES the webhook after
// 3 consecutive failures. After running, set DAILY_WEBHOOK_SECRET=<printed hmac> and validate the
// signed-string (raw body vs JSON.stringify) against a live delivery (doc 07 launch gate).

const apiKey = process.env.DAILY_API_KEY;
const appBaseUrl = process.env.APP_BASE_URL;
if (!apiKey || !appBaseUrl) {
  console.error('Set DAILY_API_KEY and APP_BASE_URL in the environment first.');
  process.exit(1);
}

const res = await fetch('https://api.daily.co/v1/webhooks', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `${appBaseUrl}/api/webhooks/daily`,
    eventTypes: ['participant.joined', 'participant.left'],
    retryType: 'exponential',
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(`Daily POST /v1/webhooks responded ${res.status}:`, body);
  process.exit(1);
}
console.log('Webhook registered. Copy this into DAILY_WEBHOOK_SECRET:\n');
console.log(body.hmac);
console.log('\nFull response:', JSON.stringify(body, null, 2));
```

- [ ] **Step 3: Verify the script parses and the env still loads**

Run: `node --check server/scripts/register-daily-webhook.mjs && npm test -- env`
Expected: `node --check` exits 0 (no syntax error); env tests (if any) PASS. (Do NOT execute the script — it makes a live API call.)

- [ ] **Step 4: Commit**

```bash
git add server/src/config/env/env.js server/scripts/register-daily-webhook.mjs
git commit -m "feat(config): add DAILY_WEBHOOK_SECRET + webhook-registration ops helper (S2)"
```

---

### Task 9: Full regression — server + client

**Files:** none (verification only)

- [ ] **Step 1: Run the full server + shared suite**

Run: `npm test`
Expected: all suites PASS (record the exact counts).

- [ ] **Step 2: Run the client suite**

Run: `npm --workspace client test`
Expected: all suites PASS (record the exact counts).

- [ ] **Step 3: Lint (touched files only is fine; full lint is cheap here)**

Run: `npm run lint`
Expected: no new errors in the files this slice touched.

- [ ] **Step 4: If everything is green, no commit needed.** If a regression surfaced, fix it under the relevant task (test-first) before declaring done.

---

## Spec-doc impact (tracked — applied by the controller at task end, with approval; per doc 00 §4/§5)

DO NOT edit docs 00–15 during implementation. Track here:

| Doc | Change (old → new) | Reason |
| --- | ------------------ | ------ |
| 14 §1 | `VideoProvider` typedef gains `verifyWebhook(req) => NormalizedVideoEvent\|null`; `createRoom` gains optional `{ notAfterIso }`; add a `NormalizedVideoEvent` typedef | Adapter now verifies + normalizes (S2) |
| 14 §3 | Replace the simplified dev participant shape with Daily's current versioned envelope (`{version,type,id,payload,event_ts}`, `payload.owner` not `is_owner`, `room` = name); keep the dev-simulator note | Real Daily payload shape |
| 15 §Daily.co | Add `DAILY_WEBHOOK_SECRET` row (base64 HMAC secret, optional) | New config value |
| 15 §VIDEO_PROVIDER | `daily` "resolves to stub" → now "resolves to the real `daily.js` adapter" | Adapter wired |
| 05 §F05 | `POST /api/webhooks/daily` is now signature-verified (401 + `video.webhook_rejected` audit on bad sig); raw-body note | Verification added |
| 07 | Add risks: webhook signed-string byte-sensitivity (raw vs JSON.stringify) live-delivery gate; `.left` timestamp field + test-ping signing unconfirmed; `circuit-breaker` auto-disable avoided via `exponential` | New live-delivery gate |
| 11 | New ADR (next free `ADR-NN`): "Daily adapter — verify+normalize in adapter, role via token `user_id`, raw-body HMAC, webhook `retryType=exponential`"; supersedes the ADR-24 role-inference follow-up | New decision |
| 13 | Status tracker: Video adapter interface → Built (Daily); note P-12/D-04 (video UI) still pending (S3) | Build progress |

Change-impact order (doc 00 §5): this is a "New external integration" cascade (14 → 03/05/08/15) plus a "New architectural decision" (11) and "Build progress" (13). Doc 08 review: the new 401-on-bad-signature + raw-body verification strengthens an existing public endpoint (no new attack surface beyond what doc 14 already implies); confirm whether an explicit note is warranted.

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial plan | Slice H · S2 build plan from the approved design |
