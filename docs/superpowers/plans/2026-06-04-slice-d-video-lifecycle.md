# Slice D — Video & Appointment Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build F05 (video consultation), the `confirmed→in_progress→{completed,patient_no_show,doctor_no_show}` lifecycle transitions driven by a first-of-its-kind appointment-evaluation worker, and the doctor UI (D-02 today view, D-06 cancel modal) — the fourth and final slice of the M1+M2 journey.

**Architecture:** A dev `daily.mock` VideoProvider mirrors ADR-22 (no live Daily account): the real `POST /api/webhooks/daily` handler records participant joins into two new `appointments` columns, and a dev simulator feeds it offline. A pure, clock-injected `evaluateDueAppointments(now)` function (driven by an in-process `node-cron` worker per ADR-08) owns the non-payment transitions, reusing Slice C's refund/email side-effects. `appointmentState.service` stays the single state writer.

**Tech Stack:** Node + Express, Prisma 6.x (PostgreSQL), Zod, Vitest + supertest (server); React 18 + Vite 5 + TanStack Query + react-router (client); `node-cron` (new); `crypto` HMAC for the mock token.

**Design source:** `docs/superpowers/specs/2026-06-04-slice-d-video-lifecycle-design.md`

**Conventions (match existing code):**
- ES modules, `// @ts-check` headers. `AppError(code, message, status)`.
- Server unit tests `vi.mock('../lib/prisma.js', …)` + `vi.mock` services; integration tests under `server/src/test/*.integration.test.js` use real DB + supertest.
- Run server tests: `npm test` (root). Client tests: `npm --workspace client test`. Client build: `npm --workspace client run build`.
- Commit per task. Branch already created: `feat/slice-d-video-lifecycle`.

---

## File Structure

**Create (server):**
- `server/src/integrations/video/daily.mock.js` — dev VideoProvider (deterministic room + HMAC dev token).
- `server/src/services/video.service.js` — `issueAppointmentToken`, `recordJoinFromDailyEvent`.
- `server/src/services/refundSideEffects.js` — shared best-effort `safeRefund` (extracted from `cancellation.service`).
- `server/src/services/evaluation.service.js` — pure `evaluateDueAppointments(now)`.
- `server/src/workers/index.js` — `startWorkers()` node-cron driver.
- `server/src/routes/devVideo.js` — dev-only `/dev/video/*` join simulator + page (+ `/dev/worker/evaluate`).
- `server/src/test/video.integration.test.js` — real-DB lifecycle test.
- Test files alongside each new service.

**Create (client):**
- `client/src/views/VideoRoom.jsx` — P-11 waiting room + P-12/D-04 video stage (shared, role-aware).
- `client/src/views/DoctorToday.jsx` — D-02 today + History tabs.
- `client/src/components/DoctorCancelModal.jsx` — D-06 reason-required cancel modal.
- `client/src/layouts/DoctorLayout.jsx` — only if `SidebarLayout` isn't directly reusable (check first).

**Modify (server):**
- `server/src/config/env.js` (+ `env.test.js`) — `VIDEO_PROVIDER`, `VIDEO_MOCK_SECRET`.
- `prisma/schema.prisma` — two join columns.
- `server/src/integrations/video/index.js` — provider switch.
- `server/src/services/appointmentState.service.js` (+ test) — extend `LEGAL`.
- `server/src/services/appointment.service.js` (+ test) — `getForRole` peer/serverNow; doctor `listForRole` patientName + history scope.
- `server/src/services/cancellation.service.js` (+ test stays green) — use shared `safeRefund`.
- `server/src/controllers/appointment.controller.js`, `routes/appointments.js` — video-token route.
- `server/src/controllers/webhook.controller.js`, `routes/webhooks.js` — daily webhook.
- `server/src/index.js` — mount `/dev/video`, call `startWorkers()` in the run block.
- `.env.example` — document new env.

**Modify (client):**
- `client/src/views/Upcoming.jsx` (+ test) — activate Join Call → `/video/:id`.
- `client/src/App.jsx` — `/video/:id` (authed), `/doctor` → `DoctorToday`.

---

## Phase 0 — Config & schema groundwork

### Task 0.1: Add `VIDEO_PROVIDER` + `VIDEO_MOCK_SECRET` env

**Files:**
- Modify: `server/src/config/env.js`
- Modify: `server/src/config/env.test.js`
- Modify: `.env.example`

- [ ] **Step 1: Add the failing test** to `server/src/config/env.test.js` (append inside the existing describe):

```js
it('defaults VIDEO_PROVIDER to stub and accepts mock/daily', () => {
  expect(parseEnv(base).VIDEO_PROVIDER).toBe('stub');
  expect(parseEnv({ ...base, VIDEO_PROVIDER: 'mock' }).VIDEO_PROVIDER).toBe('mock');
});
```

(If the test file uses a local `base` fixture under a different name, reuse that name. Inspect the file's existing tests first and match them.)

- [ ] **Step 2: Run it, expect FAIL**

Run: `npm test -- env.test`
Expected: FAIL (`VIDEO_PROVIDER` undefined).

- [ ] **Step 3: Implement** — in `server/src/config/env.js`, add to the schema object (after `DAILY_API_KEY`):

```js
  DAILY_DOMAIN: z.string().optional(),
  VIDEO_PROVIDER: z.enum(['stub', 'mock', 'daily']).default('stub'),
  VIDEO_MOCK_SECRET: z.string().optional(),
```

- [ ] **Step 4: Run it, expect PASS**

Run: `npm test -- env.test`

- [ ] **Step 5: Document** — append to `.env.example`:

```
# Video provider: stub (prod default, throws until daily.js is wired) | mock (dev sim) | daily
VIDEO_PROVIDER=stub
# Dev-only mock meeting-token signing key (never used in prod)
VIDEO_MOCK_SECRET=dev-mock-video-secret
DAILY_DOMAIN=your-team.daily.co
```

- [ ] **Step 6: Commit**

```bash
git add server/src/config/env.js server/src/config/env.test.js .env.example
git commit -m "feat(slice-d): add VIDEO_PROVIDER + VIDEO_MOCK_SECRET env (default stub)"
```

---

### Task 0.2: Add join-timestamp columns + migration

**Files:**
- Modify: `prisma/schema.prisma:150-182` (Appointment model)

- [ ] **Step 1: Edit the schema** — in `model Appointment`, after the `lockExpiresAt` line, add:

```prisma
  /// Set on FIRST participant join (idempotent). Drives no-show resolution (ADR-12).
  doctorJoinedAt  DateTime?        @map("doctor_joined_at")  @db.Timestamptz(6)
  patientJoinedAt DateTime?        @map("patient_joined_at") @db.Timestamptz(6)
```

- [ ] **Step 2: Create + apply the migration**

Run: `npx prisma migrate dev --name add_video_join_columns`
Expected: a new migration folder under `prisma/migrations/`, applied to the dev DB; Prisma client regenerated. (Additive nullable columns — no data backfill.)

- [ ] **Step 3: Verify the client typings** — quick sanity:

Run: `npm test -- appointmentState.service.test`
Expected: PASS (existing tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(slice-d): add doctorJoinedAt/patientJoinedAt to appointments"
```

---

## Phase 1 — Video provider + token issuance

### Task 1.1: `daily.mock` VideoProvider + provider switch

**Files:**
- Create: `server/src/integrations/video/daily.mock.js`
- Create: `server/src/integrations/video/daily.mock.test.js`
- Modify: `server/src/integrations/video/index.js`

- [ ] **Step 1: Write the failing test** `daily.mock.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { dailyMock } from './daily.mock.js';

describe('daily.mock VideoProvider', () => {
  it('derives a deterministic room from the appointment id', async () => {
    const room = await dailyMock.createRoom('appt123');
    expect(room.roomName).toBe('appt_appt123');
    expect(room.roomUrl).toContain('appt123');
  });

  it('issues a token whose expiresAt is the notAfter bound', async () => {
    const t = await dailyMock.issueToken({
      roomName: 'appt_appt123',
      role: 'patient',
      notBeforeIso: '2026-06-04T10:00:00.000Z',
      notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Pat',
    });
    expect(typeof t.token).toBe('string');
    expect(t.token.length).toBeGreaterThan(10);
    expect(t.expiresAt).toBe('2026-06-04T10:35:00.000Z');
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- daily.mock`

- [ ] **Step 3: Implement** `daily.mock.js`:

```js
// @ts-check
import crypto from 'node:crypto';
import { env } from '../../config/env.js';

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
```

- [ ] **Step 4: Wire the switch** — replace `server/src/integrations/video/index.js`:

```js
// @ts-check
import { dailyStub } from './daily.stub.js';
import { dailyMock } from './daily.mock.js';
import { env } from '../../config/env.js';
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<{ roomName: string, roomUrl: string }>} createRoom
 * @property {(args: { roomName: string, role: 'patient'|'doctor', notBeforeIso: string,
 *   notAfterIso: string, displayName: string }) => Promise<{ token: string, expiresAt: string }>} issueToken
 */
// 'daily' resolves to the throwing stub until the concrete daily.js adapter is wired.
export const videoProvider = env.VIDEO_PROVIDER === 'mock' ? dailyMock : dailyStub;
```

- [ ] **Step 5: Run it, expect PASS** — `npm test -- daily.mock`

- [ ] **Step 6: Commit**

```bash
git add server/src/integrations/video/
git commit -m "feat(slice-d): daily.mock VideoProvider + VIDEO_PROVIDER switch"
```

---

### Task 1.2: `video.service` — token issuance + window/ownership guards

**Files:**
- Create: `server/src/services/video.service.js`
- Create: `server/src/services/video.service.test.js`

- [ ] **Step 1: Write the failing test** `video.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findUnique: vi.fn(), update: vi.fn() }, doctor: { findUnique: vi.fn() } },
}));
vi.mock('../integrations/video/index.js', () => ({
  videoProvider: {
    createRoom: vi.fn(async (id) => ({ roomName: `appt_${id}`, roomUrl: `u/${id}` })),
    issueToken: vi.fn(async () => ({ token: 'tok', expiresAt: '2026-06-04T10:35:00.000Z' })),
  },
}));

import { prisma } from '../lib/prisma.js';
import { issueAppointmentToken, recordJoinFromDailyEvent } from './video.service.js';

const SLOT_START = new Date('2026-06-04T10:00:00.000Z');
const SLOT_END = new Date('2026-06-04T10:30:00.000Z');
const baseAppt = {
  id: 'a1', state: 'confirmed', slotStart: SLOT_START, slotEnd: SLOT_END,
  patientUserId: 'p1', doctorId: 'd1',
  patient: { fullName: 'Pat' }, doctor: { user: { fullName: 'Dr A' } },
};

beforeEach(() => vi.clearAllMocks());

describe('issueAppointmentToken', () => {
  it('issues a token inside the window for the owning patient', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    const out = await issueAppointmentToken({
      id: 'a1', role: 'patient', userId: 'p1', now: new Date('2026-06-04T09:55:00.000Z'),
    });
    expect(out.token).toBe('tok');
    expect(out.roomName).toBe('appt_a1');
  });

  it('rejects before the window opens with VIDEO_WINDOW_CLOSED (422)', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    await expect(
      issueAppointmentToken({ id: 'a1', role: 'patient', userId: 'p1', now: new Date('2026-06-04T09:30:00.000Z') }),
    ).rejects.toMatchObject({ code: 'VIDEO_WINDOW_CLOSED', status: 422 });
  });

  it('404s a non-owning patient (no existence leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    await expect(
      issueAppointmentToken({ id: 'a1', role: 'patient', userId: 'other', now: SLOT_START }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('404s when the appointment is not confirmed/in_progress', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, state: 'cancelled_refunded' });
    await expect(
      issueAppointmentToken({ id: 'a1', role: 'patient', userId: 'p1', now: SLOT_START }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('recordJoinFromDailyEvent', () => {
  it('sets patientJoinedAt on first patient join only', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: null });
    await recordJoinFromDailyEvent({ type: 'participant.joined', room: 'appt_a1', user_name: 'patient', timestamp: '2026-06-04T10:01:00.000Z' });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: { patientJoinedAt: expect.any(Date) } }),
    );
  });

  it('does not overwrite an existing join timestamp', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: SLOT_START });
    await recordJoinFromDailyEvent({ type: 'participant.joined', room: 'appt_a1', user_name: 'patient', timestamp: '2026-06-04T10:05:00.000Z' });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- video.service`

- [ ] **Step 3: Implement** `video.service.js`:

```js
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
```

> Note: `recordJoinFromDailyEvent` infers role from `user_name` containing "doctor". The dev simulator (Task 2.2) sets `user_name` to the role explicitly, so this is deterministic in dev. The real adapter (future) will pass a role-tagged participant name.

- [ ] **Step 4: Run it, expect PASS** — `npm test -- video.service`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/video.service.js server/src/services/video.service.test.js
git commit -m "feat(slice-d): video.service token issuance + join recording"
```

---

### Task 1.3: `video-token` route + controller

**Files:**
- Modify: `server/src/controllers/appointment.controller.js`
- Modify: `server/src/routes/appointments.js`

- [ ] **Step 1: Add the controller** — append to `appointment.controller.js`:

```js
import * as videoService from '../services/video.service.js';

export async function videoToken(req, res, next) {
  try {
    res.json(
      await videoService.issueAppointmentToken({
        id: req.params.id, role: req.session.role, userId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
```

(Place the `import` with the other imports at the top.)

- [ ] **Step 2: Add the route** — in `routes/appointments.js`, after the `:id/cancel` route:

```js
appointmentsRouter.get('/:id/video-token', requireRole('patient', 'doctor'), c.videoToken);
```

- [ ] **Step 3: Verify wiring compiles** — `npm test -- appointment` (existing controller/service tests still pass; the route is exercised in Task 5 integration).

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/appointment.controller.js server/src/routes/appointments.js
git commit -m "feat(slice-d): GET /api/appointments/:id/video-token route"
```

---

## Phase 2 — Join recording webhook + dev simulator

### Task 2.1: `POST /api/webhooks/daily` handler

**Files:**
- Modify: `server/src/controllers/webhook.controller.js`
- Modify: `server/src/routes/webhooks.js`
- Create: `server/src/controllers/webhook.controller.test.js` (if absent; else append)

- [ ] **Step 1: Write the failing test** (append/create `webhook.controller.test.js`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../services/video.service.js', () => ({ recordJoinFromDailyEvent: vi.fn() }));
import * as video from '../services/video.service.js';
import { daily } from './webhook.controller.js';

beforeEach(() => vi.clearAllMocks());

describe('daily webhook', () => {
  it('forwards a participant event to recordJoinFromDailyEvent and 200s', async () => {
    const req = { body: { type: 'participant.joined', room: 'appt_a1', user_name: 'doctor' } };
    const res = { json: vi.fn() };
    const next = vi.fn();
    await daily(req, res, next);
    expect(video.recordJoinFromDailyEvent).toHaveBeenCalledWith(req.body);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- webhook.controller`

- [ ] **Step 3: Implement** — append to `webhook.controller.js`:

```js
import * as videoService from '../services/video.service.js';

// Daily participant events (doc 14 §3). Signature verification deferred to the real adapter.
export async function daily(req, res, next) {
  try {
    await videoService.recordJoinFromDailyEvent(req.body ?? {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Add the route** — in `routes/webhooks.js`:

```js
webhooksRouter.post('/daily', c.daily);
```

- [ ] **Step 5: Run it, expect PASS** — `npm test -- webhook.controller`

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/webhook.controller.js server/src/controllers/webhook.controller.test.js server/src/routes/webhooks.js
git commit -m "feat(slice-d): POST /api/webhooks/daily join-event handler"
```

---

### Task 2.2: Dev video simulator + worker trigger (`/dev/video/*`, `/dev/worker/evaluate`)

**Files:**
- Create: `server/src/routes/devVideo.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Implement** `devVideo.js` (dev-only; no unit test — exercised via integration Task 5):

```js
// @ts-check
import { Router } from 'express';
import express from 'express';
import * as videoService from '../services/video.service.js';
import * as evaluation from '../services/evaluation.service.js';

/** Dev-only video + worker simulation. Mounted ONLY when VIDEO_PROVIDER=mock. */
export const devVideoRouter = Router();

// Simulated room page: buttons emit the documented Daily payload to the real webhook path.
devVideoRouter.get('/video/:id', (req, res) => {
  const id = String(req.params.id);
  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><body style="font-family:sans-serif;max-width:420px;margin:64px auto">
  <h1>Mock video room — ${id}</h1>
  <form method="POST" action="/dev/video/event">
    <input type="hidden" name="room" value="appt_${id}" />
    <button name="user_name" value="doctor">Doctor joined</button>
    <button name="user_name" value="patient">Patient joined</button>
  </form>
</body></html>`);
});

// Documented-payload sink (the dev page + the SPA join-sim both reach recordJoin through here).
devVideoRouter.post('/video/event', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    await videoService.recordJoinFromDailyEvent({
      type: 'participant.joined', room: req.body.room, user_name: req.body.user_name,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// SPA join-sim: role derived from the session, appointmentId from the body.
devVideoRouter.post('/video/join', express.json(), async (req, res, next) => {
  try {
    const role = req.session?.role === 'doctor' ? 'doctor' : 'patient';
    await videoService.recordJoinFromDailyEvent({
      type: 'participant.joined', room: `appt_${req.body.appointmentId}`, user_name: role,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// On-demand single evaluation pass (demo/testing without waiting for the cron tick).
devVideoRouter.post('/worker/evaluate', async (_req, res, next) => {
  try {
    await evaluation.evaluateDueAppointments(new Date());
    res.json({ ok: true });
  } catch (e) { next(e); }
});
```

- [ ] **Step 2: Mount it** — in `server/src/index.js`, replace the dev-mount block:

```js
  // Dev-only simulated gateways. NEVER mounted in production.
  if (env.PAYMENT_PROVIDER === 'mock') app.use('/dev', devCheckoutRouter);
  if (env.VIDEO_PROVIDER === 'mock') app.use('/dev', devVideoRouter);
```

Add the import near the other route imports:

```js
import { devVideoRouter } from './routes/devVideo.js';
```

- [ ] **Step 3: Verify the app still constructs** — `npm test -- booking.integration` (PAYMENT_PROVIDER=mock; app boots with the new mount). Expect PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/devVideo.js server/src/index.js
git commit -m "feat(slice-d): dev video simulator + /dev/worker/evaluate (mock-guarded)"
```

---

## Phase 3 — State machine + evaluation worker

### Task 3.1: Extend the `LEGAL` transition map

**Files:**
- Modify: `server/src/services/appointmentState.service.js:7-10`
- Modify: `server/src/services/appointmentState.service.test.js`

- [ ] **Step 1: Add failing tests** (append to the describe):

```js
it('allows confirmed → in_progress', async () => {
  prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
  prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'in_progress' });
  const out = await transition({ appointmentId: 'a1', to: 'in_progress', actorType: 'system' });
  expect(out.state).toBe('in_progress');
});

it.each(['completed', 'patient_no_show', 'doctor_no_show'])('allows in_progress → %s', async (to) => {
  prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'in_progress' });
  prisma.appointment.update.mockResolvedValue({ id: 'a1', state: to });
  const out = await transition({ appointmentId: 'a1', to, actorType: 'system' });
  expect(out.state).toBe(to);
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- appointmentState`

- [ ] **Step 3: Implement** — update the `LEGAL` map:

```js
const LEGAL = {
  slot_locked: new Set(['confirmed']),
  confirmed: new Set(['cancelled_refunded', 'cancelled_no_refund', 'doctor_cancelled', 'in_progress']),
  in_progress: new Set(['completed', 'patient_no_show', 'doctor_no_show']),
};
```

- [ ] **Step 4: Run it, expect PASS** — `npm test -- appointmentState`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/appointmentState.service.js server/src/services/appointmentState.service.test.js
git commit -m "feat(slice-d): extend state machine with in_progress transitions"
```

---

### Task 3.2: Extract shared `safeRefund`

**Files:**
- Create: `server/src/services/refundSideEffects.js`
- Modify: `server/src/services/cancellation.service.js:12-26` (remove the local `safeRefund`, import the shared one)

- [ ] **Step 1: Create** `refundSideEffects.js` (move the exact logic from `cancellation.service`):

```js
// @ts-check
import { logger } from '../lib/logger.js';
import * as refund from './refund.service.js';
import * as audit from './audit.service.js';

/** Best-effort refund: never throws; logs + audits failures for reconciliation. */
export async function safeRefund(appointmentId) {
  try {
    await refund.initiateRefund({ appointmentId });
  } catch (e) {
    logger.warn('refund initiation failed (will be reconciled)', { appointmentId, err: String(e) });
    await audit
      .record({
        eventType: 'payment.refund_failed', actorType: 'system',
        targetRef: appointmentId, reason: String(e?.message ?? e),
      })
      .catch(() => {});
  }
}
```

- [ ] **Step 2: Update `cancellation.service.js`** — delete the local `safeRefund` function (lines ~12-26) and its now-unused imports if only used by it (`refund`, `audit`, `logger` — keep `logger` only if still used by `sendApology`'s catch; it is). Replace with:

```js
import { safeRefund } from './refundSideEffects.js';
```

Remove the `import * as refund from './refund.service.js';` and `import * as audit from './audit.service.js';` lines **only if** no longer referenced elsewhere in the file (grep the file — they are not, after removal). Keep `import { logger }` (used in `sendApology`).

- [ ] **Step 3: Run the cancellation tests, expect PASS (unchanged behavior)** — `npm test -- cancellation`

- [ ] **Step 4: Commit**

```bash
git add server/src/services/refundSideEffects.js server/src/services/cancellation.service.js
git commit -m "refactor(slice-d): extract shared safeRefund for worker reuse"
```

---

### Task 3.3: `evaluation.service.evaluateDueAppointments(now)`

**Files:**
- Create: `server/src/services/evaluation.service.js`
- Create: `server/src/services/evaluation.service.test.js`

- [ ] **Step 1: Write the failing tests** `evaluation.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({ prisma: { appointment: { findMany: vi.fn() } } }));
vi.mock('./appointmentState.service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('./refundSideEffects.js', () => ({ safeRefund: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('../integrations/email/index.js', () => ({ emailProvider: { send: vi.fn().mockResolvedValue({}) } }));
vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findMany: vi.fn() }, user: { findUnique: vi.fn().mockResolvedValue({ email: 'p@x', fullName: 'Pat' }) } },
}));

import { prisma } from '../lib/prisma.js';
import * as state from './appointmentState.service.js';
import { safeRefund } from './refundSideEffects.js';
import * as audit from './audit.service.js';
import { evaluateDueAppointments } from './evaluation.service.js';

const start = new Date('2026-06-04T10:00:00.000Z');
const end = new Date('2026-06-04T10:30:00.000Z');
// helper to drive the two findMany calls (confirmed pass, in_progress pass)
function mockQueues({ confirmed = [], inProgress = [] }) {
  prisma.appointment.findMany.mockImplementation(({ where }) =>
    Promise.resolve(where.state === 'confirmed' ? confirmed : inProgress),
  );
}
beforeEach(() => vi.clearAllMocks());

describe('evaluateDueAppointments', () => {
  it('activates confirmed appts whose slot has started', async () => {
    mockQueues({ confirmed: [{ id: 'a1', slotStart: start, slotEnd: end }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:00:30.000Z'));
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1', to: 'in_progress', actorType: 'system' }));
  });

  it('marks doctor_no_show at grace when doctor never joined', async () => {
    mockQueues({ inProgress: [{ id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: null, patientJoinedAt: start, patientUserId: 'p1' }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z')); // grace = start+15
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }));
    expect(safeRefund).toHaveBeenCalledWith('a1');
  });

  it('marks patient_no_show at grace when doctor joined but patient did not', async () => {
    mockQueues({ inProgress: [{ id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: start, patientJoinedAt: null, patientUserId: 'p1' }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1', to: 'patient_no_show' }));
    expect(safeRefund).not.toHaveBeenCalled();
  });

  it('completes at slot-end+5 when both joined', async () => {
    mockQueues({ inProgress: [{ id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: start, patientJoinedAt: start, patientUserId: 'p1' }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z')); // cutoff = end+5
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1', to: 'completed' }));
  });

  it('at the hard cutoff resolves a never-joined appt to doctor_no_show + a data-gap alert', async () => {
    mockQueues({ inProgress: [{ id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: null, patientJoinedAt: null, patientUserId: 'p1' }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'appointment.evaluation_data_gap' }));
  });

  it('does nothing before the grace window', async () => {
    mockQueues({ inProgress: [{ id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: null, patientJoinedAt: null }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:05:00.000Z'));
    expect(state.transition).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- evaluation.service`

- [ ] **Step 3: Implement** `evaluation.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import * as state from './appointmentState.service.js';
import { safeRefund } from './refundSideEffects.js';
import * as audit from './audit.service.js';
import { emailProvider } from '../integrations/email/index.js';
import { NO_SHOW_GRACE_MIN, VIDEO_TOKEN_POST_MIN } from '../config/constants.js';

/** Pure-ish, clock-injected, catch-up-safe. The ONLY transitions are via state.transition. */
export async function evaluateDueAppointments(now = new Date()) {
  await activateDue(now);
  await resolveInProgress(now);
}

async function activateDue(now) {
  const due = await prisma.appointment.findMany({
    where: { state: 'confirmed', slotStart: { lte: now } },
  });
  for (const a of due) {
    await state.transition({ appointmentId: a.id, to: 'in_progress', actorType: 'system' });
  }
}

async function resolveInProgress(now) {
  const open = await prisma.appointment.findMany({ where: { state: 'in_progress' } });
  for (const a of open) {
    const graceEnd = a.slotStart.getTime() + NO_SHOW_GRACE_MIN * 60000;
    const hardCutoff = a.slotEnd.getTime() + VIDEO_TOKEN_POST_MIN * 60000;
    const both = a.doctorJoinedAt && a.patientJoinedAt;
    const t = now.getTime();
    if (t >= hardCutoff) {
      if (both) {
        await state.transition({ appointmentId: a.id, to: 'completed', actorType: 'system' });
      } else {
        await resolveNoShow(a, /* atCutoff */ true);
      }
    } else if (t >= graceEnd && !both) {
      await resolveNoShow(a, /* atCutoff */ false);
    }
  }
}

async function resolveNoShow(a, atCutoff) {
  // ADR-12 precedence: doctor never joined → doctor_no_show (whether or not patient joined).
  const to = !a.doctorJoinedAt ? 'doctor_no_show' : 'patient_no_show';
  await state.transition({ appointmentId: a.id, to, actorType: 'system' });
  if (to === 'doctor_no_show') {
    await safeRefund(a.id);
    await sendApology(a.patientUserId, a.id).catch(() => {});
    if (atCutoff && !a.doctorJoinedAt && !a.patientJoinedAt) {
      // Resolved at the hard deadline without confident join data — flag for admin review (ADR-12).
      await audit
        .record({
          eventType: 'appointment.evaluation_data_gap', actorType: 'system',
          targetRef: a.id, reason: 'no join data at slot-end+5m; resolved non-penalizing',
        })
        .catch(() => {});
    }
  }
}

async function sendApology(patientUserId, appointmentId) {
  const patient = await prisma.user.findUnique({
    where: { id: patientUserId }, select: { email: true, fullName: true },
  });
  if (!patient) return;
  try {
    await emailProvider.send({
      template: 'cancellation_apology', to: patient.email,
      vars: { patientName: patient.fullName, appointmentRef: appointmentId },
    });
  } catch {
    logger.warn('no-show apology email not sent', { appointmentId });
  }
}
```

- [ ] **Step 4: Run it, expect PASS** — `npm test -- evaluation.service`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/evaluation.service.js server/src/services/evaluation.service.test.js
git commit -m "feat(slice-d): appointment-evaluation logic (lifecycle + ADR-12 no-show)"
```

---

### Task 3.4: node-cron worker driver

**Files:**
- Create: `server/src/workers/index.js`
- Modify: `server/src/index.js` (call `startWorkers()` in the run block)
- Modify: `server/package.json` (add `node-cron`)

- [ ] **Step 1: Add the dependency**

Run: `npm --workspace server install node-cron`
Expected: `node-cron` added to `server/package.json` dependencies + lockfile updated.

- [ ] **Step 2: Implement** `server/src/workers/index.js`:

```js
// @ts-check
import cron from 'node-cron';
import { evaluateDueAppointments } from '../services/evaluation.service.js';
import { logger } from '../lib/logger.js';

/**
 * Start in-process workers (ADR-08). Single-instance; no leader election (doc 15 §3).
 * The deferred notification + reconciliation workers register here later.
 */
export function startWorkers() {
  cron.schedule('* * * * *', async () => {
    try {
      await evaluateDueAppointments(new Date());
    } catch (e) {
      logger.error('appointment-evaluation tick failed', { err: String(e) });
    }
  });
  logger.info('workers started: appointment-evaluation (* * * * *)');
}
```

- [ ] **Step 3: Wire into the run block** — in `server/src/index.js`, inside the `if (process.argv[1] === …)` block, after `initErrorTracking();`:

```js
  startWorkers();
```

Add the import at the top:

```js
import { startWorkers } from './workers/index.js';
```

(Do NOT call `startWorkers()` inside `createApp()` — tests import `createApp` and must not start timers.)

- [ ] **Step 4: Verify nothing regressed** — `npm test`
Expected: full server suite PASS (no worker started under tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/workers/index.js server/src/index.js server/package.json package-lock.json
git commit -m "feat(slice-d): node-cron appointment-evaluation worker (ADR-08)"
```

---

## Phase 4 — appointment.service extensions

### Task 4.1: `getForRole` peer/serverNow + doctor `listForRole` patientName + history scope

**Files:**
- Modify: `server/src/services/appointment.service.js`
- Modify: `server/src/services/appointment.service.test.js` (append)

- [ ] **Step 1: Write the failing tests** (append to `appointment.service.test.js`; match its existing mock setup):

```js
it('detail exposes role-aware peerJoined + serverNow for a patient', async () => {
  prisma.appointment.findUnique.mockResolvedValue({
    id: 'a1', patientUserId: 'p1', doctorId: 'd1', state: 'in_progress',
    slotStart: new Date('2026-06-04T10:00:00Z'), slotEnd: new Date('2026-06-04T10:30:00Z'),
    feeAtBooking: 250000, forSelf: true, subjectName: null,
    doctorJoinedAt: new Date('2026-06-04T10:01:00Z'), patientJoinedAt: null,
    doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
  });
  const out = await getForRole({ id: 'a1', role: 'patient', userId: 'p1' });
  expect(out.peerJoined).toBe(true); // patient sees the DOCTOR's presence
  expect(typeof out.serverNow).toBe('string');
});

it('doctor list rows include patientName', async () => {
  prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
  prisma.appointment.findMany.mockResolvedValue([
    { id: 'a1', slotStart: new Date(), slotEnd: new Date(), state: 'confirmed', forSelf: false,
      subjectName: 'Child', patient: { fullName: 'Parent P' } },
  ]);
  const rows = await listForRole({ role: 'doctor', userId: 'docUser' });
  expect(rows[0].patientName).toBe('Parent P');
});
```

(Import `getForRole, listForRole` if not already imported in the test file. Confirm the file's `prisma` mock includes `doctor.findUnique` and `appointment.findMany`; extend the mock if needed.)

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- appointment.service`

- [ ] **Step 3: Implement** in `appointment.service.js`:

(a) Doctor branch of `listForRole` — add `scope` param + `patient` include + `patientName`, and a history query:

```js
export async function listForRole({ role, userId, scope = 'active' }) {
  if (role === 'patient') {
    // ...unchanged patient branch...
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
    id: a.id, slotStart: a.slotStart.toISOString(), slotEnd: a.slotEnd.toISOString(),
    state: a.state, forSelf: a.forSelf, subjectName: a.subjectName,
    patientName: a.patient?.fullName ?? null,
  }));
}
```

(b) `getForRole` — include join columns, then compute `peerJoined` (role-aware) + `serverNow`. Add to the `findUnique` `select`/default (it currently fetches all scalar fields by default since no `select` — only `include` for doctor — so `doctorJoinedAt`/`patientJoinedAt` are already returned). After building `detail`:

```js
  detail.serverNow = new Date().toISOString();
  detail.peerJoined =
    role === 'patient' ? !!a.doctorJoinedAt : role === 'doctor' ? !!a.patientJoinedAt : false;
```

(Place these before `if (a.state === 'confirmed')`.)

- [ ] **Step 4: Run it, expect PASS** — `npm test -- appointment.service`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/appointment.service.js server/src/services/appointment.service.test.js
git commit -m "feat(slice-d): detail peerJoined/serverNow + doctor list patientName/history"
```

---

## Phase 5 — Integration test (real DB)

### Task 5.1: Video lifecycle integration

**Files:**
- Create: `server/src/test/video.integration.test.js`

- [ ] **Step 1: Write the test** (mirror `booking.integration.test.js` setup; this drives the *real* webhook + dev-worker path). Because slots are always future-dated, this test inserts an appointment directly via Prisma at a controllable time, then drives the worker:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.VIDEO_PROVIDER = 'mock';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma.js');
const { evaluateDueAppointments } = await import('../services/evaluation.service.js');

const app = createApp();
const uniq = () => `sliced_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('video + lifecycle integration', () => {
  let agent, email, doctorId, apptId;
  const start = new Date(Date.now() - 60 * 1000); // started 1 min ago
  const end = new Date(start.getTime() + 30 * 60000);

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({ where: { isActive: true, status: 'active' } });
    doctorId = d.id;
    email = uniq();
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
      fullName: 'Vid Patient', email, phone: '03001234567', password: 'password1', tosAccepted: true,
    });
    const me = await agent.get('/api/auth/me');
    const appt = await prisma.appointment.create({
      data: {
        doctorId, patientUserId: me.body.id, slotStart: start, slotEnd: end,
        state: 'confirmed', feeAtBooking: 250000, forSelf: true,
      },
    });
    apptId = appt.id;
  });

  it('issues a video token inside the window', async () => {
    const res = await agent.get(`/api/appointments/${apptId}/video-token`);
    expect(res.status).toBe(200);
    expect(res.body.roomName).toBe(`appt_${apptId}`);
    expect(res.body.joinSimUrl).toBe('/dev/video/join');
  });

  it('records both joins via the daily webhook and completes after cutoff', async () => {
    await request(app).post('/api/webhooks/daily')
      .send({ type: 'participant.joined', room: `appt_${apptId}`, user_name: 'doctor' });
    await request(app).post('/api/webhooks/daily')
      .send({ type: 'participant.joined', room: `appt_${apptId}`, user_name: 'patient' });
    // now() is past slot-end+5m for this back-dated slot → completed
    await evaluateDueAppointments(new Date());
    const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(appt.state).toBe('completed');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetRef: apptId } });
    await prisma.appointment.deleteMany({ where: { id: apptId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
```

- [ ] **Step 2: Run it, expect PASS** — `npm test -- video.integration`
Expected: both tests PASS. (The back-dated slot makes `now` past the cutoff, so the worker completes it.)

- [ ] **Step 3: Commit**

```bash
git add server/src/test/video.integration.test.js
git commit -m "test(slice-d): video token + webhook-join + worker-complete integration"
```

---

## Phase 6 — Frontend

### Task 6.1: `VideoRoom` view (P-11 waiting + P-12/D-04 stage)

**Files:**
- Create: `client/src/views/VideoRoom.jsx`
- Create: `client/src/views/VideoRoom.test.jsx`

- [ ] **Step 1: Write the failing test** `VideoRoom.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VideoRoom } from './VideoRoom.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/video/a1']}>
        <Routes><Route path="/video/:id" element={<VideoRoom />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('VideoRoom', () => {
  it('shows the waiting room until the peer joins', async () => {
    api.get.mockImplementation((path) =>
      path.includes('video-token')
        ? Promise.resolve({ token: 't', roomName: 'appt_a1', roomUrl: 'u', serverNow: new Date().toISOString(), joinSimUrl: null })
        : Promise.resolve({ id: 'a1', state: 'in_progress', peerJoined: false, slotStart: new Date().toISOString(), slotEnd: new Date(Date.now()+18e5).toISOString(), serverNow: new Date().toISOString() }),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/will be with you shortly/i)).toBeTruthy());
  });

  it('shows the live stage once the peer has joined', async () => {
    api.get.mockImplementation((path) =>
      path.includes('video-token')
        ? Promise.resolve({ token: 't', roomName: 'appt_a1', roomUrl: 'u', serverNow: new Date().toISOString(), joinSimUrl: null })
        : Promise.resolve({ id: 'a1', state: 'in_progress', peerJoined: true, slotStart: new Date().toISOString(), slotEnd: new Date(Date.now()+18e5).toISOString(), serverNow: new Date().toISOString() }),
    );
    setup();
    await waitFor(() => expect(screen.getByText(/live|in call|connected/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm --workspace client test -- VideoRoom`

- [ ] **Step 3: Implement** `VideoRoom.jsx` (simulated stage; doc 06 chrome classes; polls detail for peer presence; emits the mock join on mount when `joinSimUrl` is present):

```jsx
// @ts-check
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';

export function VideoRoom() {
  const { id } = useParams();
  const token = useQuery({
    queryKey: ['video-token', id],
    queryFn: () => api.get(`/appointments/${id}/video-token`),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get(`/appointments/${id}`),
    refetchInterval: 5000,
  });

  // Mock mode: entering the room records this participant's join (server-provided URL).
  useEffect(() => {
    if (token.data?.joinSimUrl) api.post(token.data.joinSimUrl, { appointmentId: id }).catch(() => {});
  }, [token.data?.joinSimUrl, id]);

  if (token.isError)
    return <main className="video-page"><p className="help">The video room isn’t open yet. Try again closer to your appointment time.</p></main>;
  if (token.isPending || detail.isPending) return <main className="video-page"><p className="help">Connecting…</p></main>;

  const peerJoined = detail.data?.peerJoined;
  return (
    <main className="video-page" style={{ background: 'var(--color-dark-deep)' }}>
      <div className="video-stage">
        {peerJoined ? (
          <p style={{ color: 'var(--color-on-dark)' }}>● Live — connected</p>
        ) : (
          <p style={{ color: 'var(--color-on-dark)' }}>Doctor will be with you shortly…</p>
        )}
        <div className="video-self" />
      </div>
      <div className="video-controls">
        <button type="button" className="video-ctrl">Mic</button>
        <button type="button" className="video-ctrl">Cam</button>
        <button type="button" className="video-ctrl video-ctrl--leave" onClick={() => window.history.back()}>Leave</button>
      </div>
    </main>
  );
}
```

> The simulated stage satisfies P-12/D-04 without live media (mock). The real-Daily swap (deferred) replaces the `.video-stage` body with the Daily SDK call object using `token.data.roomUrl` + `token.data.token`.

- [ ] **Step 4: Run it, expect PASS** — `npm --workspace client test -- VideoRoom`

- [ ] **Step 5: Commit**

```bash
git add client/src/views/VideoRoom.jsx client/src/views/VideoRoom.test.jsx
git commit -m "feat(slice-d): P-11/P-12 VideoRoom view (mock stage + peer polling)"
```

---

### Task 6.2: Activate patient Join Call → `/video/:id`

**Files:**
- Modify: `client/src/views/Upcoming.jsx:50-52`
- Modify: `client/src/views/Upcoming.test.jsx` (append)
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add the failing test** (append to `Upcoming.test.jsx`):

```jsx
it('enables Join Call within 10 min of slot start linking to the video room', async () => {
  const soon = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  api.get.mockResolvedValue({ data: [{
    id: 'a1', slotStart: soon, slotEnd: soon, state: 'confirmed', feeAtBooking: 250000,
    forSelf: true, subjectName: null, doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null,
  }] });
  setup();
  await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
  const join = screen.getByRole('link', { name: /join call/i });
  expect(join.getAttribute('href')).toContain('/video/a1');
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm --workspace client test -- Upcoming`

- [ ] **Step 3: Implement** — in `Upcoming.jsx`, replace the disabled Join Call button (lines ~50-52) with an activation-aware control:

```jsx
{(() => {
  const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
  const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
  const active = Date.now() >= opensAt && Date.now() <= closesAt;
  return active ? (
    <Link className="btn btn--secondary" to={`/video/${a.id}`}>Join Call</Link>
  ) : (
    <button type="button" className="btn btn--secondary" disabled>Join Call</button>
  );
})()}
```

- [ ] **Step 4: Add the route** — in `App.jsx`, add (after `/pay/return`; reachable by patient or doctor — render directly and let the server enforce ownership):

```jsx
<Route path="/video/:id" element={session ? <VideoRoom /> : <Login />} />
```

Add imports: `import { VideoRoom } from './views/VideoRoom.jsx';` and ensure `Login` is imported (it's in `routes.jsx`; import it: `import { Login } from './views/Login.jsx';`).

- [ ] **Step 5: Run it, expect PASS** — `npm --workspace client test -- Upcoming`

- [ ] **Step 6: Commit**

```bash
git add client/src/views/Upcoming.jsx client/src/views/Upcoming.test.jsx client/src/App.jsx
git commit -m "feat(slice-d): activate patient Join Call → /video/:id"
```

---

### Task 6.3: Doctor D-02 today view + D-06 cancel modal

**Files:**
- Create: `client/src/components/DoctorCancelModal.jsx`
- Create: `client/src/views/DoctorToday.jsx`
- Create: `client/src/views/DoctorToday.test.jsx`
- Modify: `client/src/App.jsx` (`/doctor` → `DoctorToday`)

- [ ] **Step 1: Implement** `DoctorCancelModal.jsx` (reason-required; reuses modal chrome):

```jsx
// @ts-check
import { useState } from 'react';

export function DoctorCancelModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Cancel appointment</h2>
        <p className="help">The patient is refunded automatically (net of the gateway fee) and emailed an apology.</p>
        <label htmlFor="cancel-reason">Reason (internal)</label>
        <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Keep appointment</button>
          <button type="button" className="btn btn--danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            Cancel & refund
          </button>
        </div>
      </div>
    </div>
  );
}
```

(Match the actual class names used by the existing `CancelModal.jsx` — open it first and mirror its markup/classes.)

- [ ] **Step 2: Write the failing test** `DoctorToday.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DoctorToday } from './DoctorToday.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'doctor' }, logout: vi.fn() }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><DoctorToday /></MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());

describe('D-02 DoctorToday', () => {
  it('lists today appointments with the patient name', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'a1', slotStart: new Date(Date.now()+3e5).toISOString(),
      slotEnd: new Date(Date.now()+21e5).toISOString(), state: 'confirmed', forSelf: false,
      subjectName: 'Child', patientName: 'Parent P' }] });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    expect(screen.getByText(/for: Child/i)).toBeTruthy();
  });

  it('opens the doctor cancel modal and posts a reason', async () => {
    api.get.mockResolvedValue({ data: [{ id: 'a1', slotStart: new Date(Date.now()+1e7).toISOString(),
      slotEnd: new Date(Date.now()+1e7).toISOString(), state: 'confirmed', forSelf: true, subjectName: null, patientName: 'Parent P' }] });
    api.post.mockResolvedValue({ state: 'doctor_cancelled' });
    setup();
    await waitFor(() => expect(screen.getByText('Parent P')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Unwell' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', { reason: 'Unwell' }));
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** — `npm --workspace client test -- DoctorToday`

- [ ] **Step 4: Implement** `DoctorToday.jsx` (reuse `SidebarLayout`; today list + Join Call + cancel modal):

```jsx
// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { SidebarLayout } from '../layouts/SidebarLayout.jsx';
import { formatKarachi } from '../lib/format.js';
import { DoctorCancelModal } from '../components/DoctorCancelModal.jsx';

export function DoctorToday() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['doctor-appointments'], queryFn: () => api.get('/appointments') });
  const [cancelId, setCancelId] = useState(null);
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }) => api.post(`/appointments/${id}/cancel`, { reason }),
    onSuccess: () => { setCancelId(null); qc.invalidateQueries({ queryKey: ['doctor-appointments'] }); },
  });
  const rows = list.data?.data ?? [];
  return (
    <SidebarLayout>
      <section className="section-card">
        <h1>Today’s appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && <p className="help">No appointments.</p>}
        {rows.map((a) => {
          const opensAt = new Date(a.slotStart).getTime() - 10 * 60 * 1000;
          const closesAt = new Date(a.slotEnd).getTime() + 5 * 60 * 1000;
          const active = Date.now() >= opensAt && Date.now() <= closesAt;
          return (
            <div key={a.id} className="appt-row">
              <div>{formatKarachi(a.slotStart)}</div>
              <strong>{a.patientName}</strong>
              {!a.forSelf && <div>for: {a.subjectName}</div>}
              {active ? (
                <Link className="btn btn--secondary" to={`/video/${a.id}`}>Join Call</Link>
              ) : (
                <button type="button" className="btn btn--secondary" disabled>Join Call</button>
              )}
              {a.state === 'confirmed' && (
                <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>Cancel</button>
              )}
            </div>
          );
        })}
      </section>
      {cancelId && (
        <DoctorCancelModal
          onClose={() => setCancelId(null)}
          onConfirm={(reason) => cancelMut.mutate({ id: cancelId, reason })}
        />
      )}
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Route it** — in `App.jsx`, replace the doctor placeholder route:

```jsx
<Route path="/doctor" element={<RoleRoute session={session} role="doctor"><DoctorToday /></RoleRoute>} />
```

Add `import { DoctorToday } from './views/DoctorToday.jsx';`.

- [ ] **Step 6: Run it, expect PASS** — `npm --workspace client test -- DoctorToday`

- [ ] **Step 7: Commit**

```bash
git add client/src/views/DoctorToday.jsx client/src/views/DoctorToday.test.jsx client/src/components/DoctorCancelModal.jsx client/src/App.jsx
git commit -m "feat(slice-d): D-02 doctor today view + D-06 cancel modal"
```

---

## Phase 7 — Verify, normalize, docs

### Task 7.1: Full suite + build + Prettier

- [ ] **Step 1: Server suite** — `npm test` → expect all green (prior 109 + new video/evaluation/state/appointment tests).
- [ ] **Step 2: Client suite** — `npm --workspace client test` → expect all green (prior 32 + VideoRoom + DoctorToday + new Upcoming case).
- [ ] **Step 3: Client build** — `npm --workspace client run build` → expect clean (no unresolved imports).
- [ ] **Step 4: Prettier (slice files only)** — `npx prettier --write` on the created/modified files listed in this plan.
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(slice-d): prettier normalize slice files"
```

### Task 7.2: Canon documentation updates (REQUIRES USER APPROVAL FIRST)

> Per CLAUDE.md, present the exact edits to the user and apply only after approval. Do NOT edit canon docs without it. Follow doc 00 surgical-edit rule + version bumps + revision footers.

- [ ] **Step 1:** Present the doc-impact set (from design §11) with the exact diffs:
  - **04** join columns + migration note; **05** `VIDEO_WINDOW_CLOSED` (422); **11** ADR-24 (video sim) + ADR-25 (evaluation worker); **15** `VIDEO_PROVIDER`/`VIDEO_MOCK_SECRET` (+08/10/03 cascade); **14** daily.mock note; **12** TC rows; **13** status sweep (F05 Built; M2 progress).
- [ ] **Step 2:** On approval, apply surgically with version bumps + revision-footer rows.
- [ ] **Step 3:** Commit `docs(slice-d): canon updates (ADR-24/25, schema, API code, config, status)`.

### Task 7.3: Update session changelog + index

- [ ] **Step 1:** Fill `agentChangeLogs/2026-06-04-1746-slice-d-video-lifecycle.md` Verification/Files/Status with final results; update `agentChangeLogs/index.md` line.
- [ ] **Step 2:** Commit `docs(slice-d): changelog — build complete`.

---

## Self-review checklist (done at plan-write time)

- **Spec coverage:** F05 video (1.1–1.3, 6.1), token route (1.3), webhook+join (2.1–2.2, 1.2), evaluation worker + ADR-12 (3.1–3.4), doctor D-02/D-06 (6.3), patient P-11/P-12 (6.1–6.2), schema (0.2), config (0.1), peer/serverNow + patientName/history (4.1), integration (5.1), docs (7.2). ✔ All design sections map to a task.
- **Deferred correctly out:** F07, F04.03, F08, real Daily adapter/SDK, analytics — none have tasks. ✔
- **Type/name consistency:** `issueAppointmentToken`, `recordJoinFromDailyEvent`, `evaluateDueAppointments`, `safeRefund`, `startWorkers`, `VIDEO_WINDOW_CLOSED`, `joinSimUrl`, `peerJoined`, `serverNow`, `patientName` — used identically across producer (service) and consumer (controller/route/client/test) tasks. ✔
- **Placeholder scan:** every code step shows real code; commands have expected outcomes. ✔
- **Known assumption to verify during build:** the doctor session role drives `/dev/video/join`; `appointment.service.test.js` may need its `prisma` mock extended with `doctor.findUnique`/`appointment.findMany` (Task 4.1 Step 1 notes this). Confirm `CancelModal.jsx` class names before mirroring them in `DoctorCancelModal` (Task 6.3 Step 1).
