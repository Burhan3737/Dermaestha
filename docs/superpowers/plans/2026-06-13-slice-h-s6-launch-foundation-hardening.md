# Slice H · S6 — Launch Foundation + Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the cross-cutting launch foundation — analytics ingestion, DSN-gated Sentry with PII scrubbing, two DB indexes, idempotent Settings bootstrap, and a single-copy Zod alignment — so the funnel is measurable and the platform is safe to launch.

**Architecture:** Six independent infra items. A new `analytics` module owns `POST /api/analytics/events` (public, rate-limited, catalog-validated) plus a best-effort `record()` writer reused by `confirmPaidAppointment`. Error tracking becomes a thin Sentry wrapper that no-ops without a DSN and scrubs PII in `beforeSend`. `shared/` becomes an npm workspace pinned to `zod@3` (with a root `overrides` to collapse the transitive `zod@4`), which lets `errorHandler` drop its ZodError duck-typing.

**Tech Stack:** Node 20 ESM, Express 4, Prisma 6 (PostgreSQL), Zod 3, Vitest 2, `@sentry/node`, npm workspaces.

---

## Decision provenance / verified reality

- `AnalyticsEvent` + `Settings` tables already exist. `AnalyticsEvent` columns: `{ type, networkType, meta }` — no `userId` column (session user folds into `meta`).
- The root `zod@4.4.3` is **transitive**, not a stray direct dep: `client → eslint-plugin-react-hooks@7.1.1 → zod-validation-error@4.0.2` (peer `zod ^3.25.0 || ^4.0.0`). It hoists to the repo root; `shared/schemas/*` resolve it because `shared/` is not a workspace, while `server/` uses its nested `zod@3.25.76`. → Two copies → cross-boundary `instanceof ZodError` fails → the Slice-G `errorHandler` duck-type workaround.
- Because the `zod@4` source is transitive (and `zod-validation-error` accepts `^3.25.0`), making `shared` a workspace alone is **not** sufficient to guarantee a single copy — a root `overrides: { "zod": "^3.23.0" }` is required to force the whole tree (incl. `zod-validation-error`) onto v3. This is the one deviation from the spec's "remove the stray root zod@4" wording.
- `.env` currently sets `ERROR_TRACKING_DSN=` (empty). Renaming to `SENTRY_DSN` leaves Sentry off by default — no behavior change. `.env.example` references `ERROR_TRACKING_DSN` and is updated as part of the rename (not a canon spec).
- Tests: unit tests `vi.mock` prisma; integration tests hit a live PG at `localhost:5433`. `prisma migrate status` is clean (6 migrations).

---

## File Structure

- **Create** `shared/schemas/analytics/analytics.js` — `analyticsEventSchema` + derived `ANALYTICS_EVENT_TYPES`.
- **Modify** `shared/schemas/index.js` — export the analytics schema from the barrel.
- **Create** `server/src/modules/analytics/service.js` — best-effort `record({type,networkType,meta})`.
- **Create** `server/src/modules/analytics/controller.js` — `ingest` handler (folds session userId into meta).
- **Create** `server/src/modules/analytics/index.js` — router: rate limiter + `validate` + `POST /events`; exports `ANALYTICS_RATE`.
- **Create** `server/src/modules/analytics/test.js` — record + endpoint + rate-limit tests.
- **Modify** `server/src/routes.js` — mount `analyticsRouter` at `/api/analytics`.
- **Modify** `server/src/modules/payment/service.js` — emit `booking_confirmed` in `confirmPaidAppointment`.
- **Modify** `server/src/modules/payment/test.js` — assert the emit on both confirm paths.
- **Create** `shared/package.json` — `@dermestha/shared`, `zod@^3.23.0`.
- **Modify** `package.json` (root) — add `"shared"` to `workspaces`; add `overrides.zod`.
- **Modify** `server/src/lib/errorTracking/errorTracking.js` — real Sentry wrapper + `beforeSend` scrubbing.
- **Create** `server/src/lib/errorTracking/errorTracking.test.js` — init gating + scrubbing tests.
- **Modify** `server/src/config/env/env.js` — `ERROR_TRACKING_DSN` → `SENTRY_DSN`.
- **Modify** `.env.example` — rename the var.
- **Modify** `server/src/http/errorHandler/errorHandler.js` — drop ZodError duck-typing.
- **Create** `server/src/http/errorHandler/errorHandler.test.js` — shared-schema ZodError caught via `instanceof`.
- **Create** `server/src/lib/settings/ensureSettings.js` — idempotent upsert.
- **Create** `server/src/lib/settings/ensureSettings.test.js` — idempotency.
- **Modify** `server/src/index.js` — call `ensureSettings()` at boot.
- **Modify** `prisma/seed.js` — call `ensureSettings(prisma)` for dev parity.
- **Modify** `prisma/schema.prisma` — `AuditLog @@index([targetRef])`, `Appointment @@index([slotStart])`.
- **Create** `prisma/migrations/<ts>_slice_h_s6_indexes/migration.sql` — via `prisma migrate dev`.

---

## Task 1: Zod single-copy alignment (do FIRST — unblocks Task 6)

**Files:**
- Create: `shared/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Create `shared/package.json`**

```json
{
  "name": "@dermestha/shared",
  "private": true,
  "type": "module",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Add `shared` to workspaces + a zod override in root `package.json`**

Add `"shared"` to the `workspaces` array (after `"client"`) and a top-level `overrides` block:

```json
  "workspaces": [
    "server",
    "client",
    "shared"
  ],
  "overrides": {
    "zod": "^3.23.0"
  },
```

- [ ] **Step 3: Clean install + verify single copy**

Run: `npm install` then `npm ls zod`
Expected: a single `zod@3.x` resolved (server + shared dedup to one v3; no `zod@4` anywhere in the tree).

- [ ] **Step 4: Commit**

```bash
git add shared/package.json package.json package-lock.json
git commit -m "build: make shared a workspace + pin zod v3 single-copy (override transitive zod@4)"
```

---

## Task 2: Analytics shared schema (closed catalog)

**Files:**
- Create: `shared/schemas/analytics/analytics.js`
- Modify: `shared/schemas/index.js`
- Test: `shared/schemas/analytics/analytics.test.js`

- [ ] **Step 1: Write the failing test** — `shared/schemas/analytics/analytics.test.js`

```js
import { describe, it, expect } from 'vitest';
import { analyticsEventSchema, ANALYTICS_EVENT_TYPES } from './analytics.js';

describe('analyticsEventSchema', () => {
  it('exposes the closed doc 14 §6 catalog', () => {
    expect(ANALYTICS_EVENT_TYPES).toEqual([
      'landing_view',
      'booking_started',
      'booking_confirmed',
      'video_join_attempt',
      'video_join_success',
    ]);
  });

  it('accepts a catalog event with networkType + meta', () => {
    const r = analyticsEventSchema.safeParse({
      type: 'landing_view',
      networkType: '3g',
      meta: { referrer: 'x' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts type-only (networkType + meta optional)', () => {
    expect(analyticsEventSchema.safeParse({ type: 'booking_started' }).success).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(analyticsEventSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npm test -- shared/schemas/analytics`

- [ ] **Step 3: Implement** — `shared/schemas/analytics/analytics.js`

```js
// @ts-check
import { z } from 'zod';

/** POST /api/analytics/events body (doc 14 §6). networkType is a sibling of meta, never nested. */
export const analyticsEventSchema = z.object({
  type: z.enum([
    'landing_view',
    'booking_started',
    'booking_confirmed',
    'video_join_attempt',
    'video_join_success',
  ]),
  networkType: z.string().trim().min(1).max(40).optional(),
  meta: z.record(z.unknown()).optional(),
});

/** The closed catalog, derived from the schema (single source). */
export const ANALYTICS_EVENT_TYPES = analyticsEventSchema.shape.type.options;
```

- [ ] **Step 4: Add to the barrel** — append to `shared/schemas/index.js`

```js
export * from './analytics/analytics.js';
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npm test -- shared/schemas/analytics`

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/analytics/analytics.js shared/schemas/analytics/analytics.test.js shared/schemas/index.js
git commit -m "feat(analytics): shared closed-catalog event schema"
```

---

## Task 3: Analytics writer + endpoint

**Files:**
- Create: `server/src/modules/analytics/service.js`, `controller.js`, `index.js`
- Modify: `server/src/routes.js`
- Test: `server/src/modules/analytics/test.js`

- [ ] **Step 1: Write the failing test** — `server/src/modules/analytics/test.js`

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: { analyticsEvent: { create: vi.fn().mockResolvedValue({ id: 'e1' }) } },
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as analytics from './service.js';
import { analyticsRouter, ANALYTICS_RATE } from './index.js';
import { errorHandler } from '../../http/errorHandler/errorHandler.js';

beforeEach(() => vi.clearAllMocks());

function makeApp({ withSession } = {}) {
  const app = express();
  app.use(express.json());
  if (withSession) app.use((req, _res, next) => { req.session = { userId: 'u1' }; next(); });
  app.use('/api/analytics', analyticsRouter);
  app.use(errorHandler);
  return app;
}

describe('analytics.record', () => {
  it('writes an AnalyticsEvent row', async () => {
    await analytics.record({ type: 'landing_view', networkType: '4g', meta: { a: 1 } });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: { type: 'landing_view', networkType: '4g', meta: { a: 1 } },
    });
  });

  it('never throws (best-effort) when the write fails', async () => {
    prisma.analyticsEvent.create.mockRejectedValueOnce(new Error('db down'));
    await expect(analytics.record({ type: 'booking_started' })).resolves.toBeUndefined();
  });
});

describe('POST /api/analytics/events', () => {
  it('accepts a catalog event and persists it (202)', async () => {
    const res = await request(makeApp()).post('/api/analytics/events').send({
      type: 'landing_view', networkType: 'wifi', meta: { referrer: 'x' },
    });
    expect(res.status).toBe(202);
    expect(prisma.analyticsEvent.create).toHaveBeenCalled();
  });

  it('rejects an unknown type with 400 VALIDATION_FAILED', async () => {
    const res = await request(makeApp()).post('/api/analytics/events').send({ type: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('folds the session userId into meta', async () => {
    await request(makeApp({ withSession: true }))
      .post('/api/analytics/events')
      .send({ type: 'booking_started', meta: { doctorId: 'd1' } });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: { type: 'booking_started', networkType: null, meta: { doctorId: 'd1', userId: 'u1' } },
    });
  });

  it('rate-limits after ANALYTICS_RATE.max requests', async () => {
    const app = makeApp();
    let last;
    for (let i = 0; i < ANALYTICS_RATE.max + 1; i++) {
      last = await request(app).post('/api/analytics/events').send({ type: 'landing_view' });
    }
    expect(last.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (modules not found)

Run: `npm test -- server/src/modules/analytics`

- [ ] **Step 3: Implement the writer** — `server/src/modules/analytics/service.js`

```js
// @ts-check
import { prisma } from '../../lib/prisma/prisma.js';
import { logger } from '../../lib/logger/logger.js';

/**
 * Best-effort analytics writer (doc 14 §6). NEVER throws into a request/worker path.
 * @param {{ type: string, networkType?: string|null, meta?: object|null }} e
 */
export async function record({ type, networkType, meta }) {
  try {
    await prisma.analyticsEvent.create({
      data: { type, networkType: networkType ?? null, meta: meta ?? undefined },
    });
  } catch (err) {
    logger.error('analytics.record failed', { type, err: String(err) });
  }
}
```

- [ ] **Step 4: Implement the controller** — `server/src/modules/analytics/controller.js`

```js
// @ts-check
import * as analytics from './service.js';

/** POST /api/analytics/events — body is already Zod-validated to the closed catalog. */
export async function ingest(req, res) {
  const { type, networkType, meta } = req.body;
  const userId = req.session?.userId;
  const fullMeta = userId ? { ...(meta ?? {}), userId } : meta;
  await analytics.record({ type, networkType, meta: fullMeta });
  res.status(202).json({ ok: true });
}
```

- [ ] **Step 5: Implement the router** — `server/src/modules/analytics/index.js`

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { validate } from '../../middleware/validate/validate.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { analyticsEventSchema } from '../../../../shared/schemas/index.js';

/** Public endpoint: keyed on IP (landing fires pre-auth). */
export const ANALYTICS_RATE = { windowMs: 60 * 1000, max: 60 };

const analyticsLimiter = makeRateLimiter({
  ...ANALYTICS_RATE,
  keyGenerator: (req) => req.ip,
});

export const analyticsRouter = Router();
// POST /api/analytics/events — public, rate-limited, catalog-validated.
analyticsRouter.post('/events', analyticsLimiter, validate(analyticsEventSchema), c.ingest);
```

- [ ] **Step 6: Mount the router** — `server/src/routes.js`

Add the import alongside the others:

```js
import { analyticsRouter } from './modules/analytics/index.js';
```

Mount it with the other `/api` routers (before the `/api` 404 catch-all), e.g. after the health router line:

```js
  app.use('/api/analytics', analyticsRouter); // POST /api/analytics/events (public)
```

- [ ] **Step 7: Run it — expect PASS**

Run: `npm test -- server/src/modules/analytics`

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/analytics server/src/routes.js
git commit -m "feat(analytics): POST /api/analytics/events + best-effort writer"
```

---

## Task 4: Server-side `booking_confirmed` emit

**Files:**
- Modify: `server/src/modules/payment/service.js`
- Test: `server/src/modules/payment/test.js`

- [ ] **Step 1: Add the failing assertions** — in `server/src/modules/payment/test.js`

Add the mock near the other `vi.mock` calls:

```js
vi.mock('../analytics/service.js', () => ({ record: vi.fn().mockResolvedValue(undefined) }));
```

Add the import with the others:

```js
import * as analytics from '../analytics/service.js';
```

Add a test asserting the emit fires from the webhook confirm path (mirror the existing successful-webhook setup), e.g.:

```js
it('emits booking_confirmed analytics on webhook confirmation', async () => {
  prisma.payment.findFirst.mockResolvedValue({ id: 'p1', appointmentId: 'a1' });
  prisma.appointment.findUnique.mockResolvedValue({ ...liveLock, doctorId: 'd1' });
  prisma.$transaction.mockImplementation(async (fn) => fn(prisma));
  prisma.user.findUnique.mockResolvedValue({ email: 'p@x.io', fullName: 'P' });
  prisma.doctor.findUnique.mockResolvedValue({ user: { fullName: 'Dr' } });
  await processWebhook({ event: 'payment.success', providerRef: 'mock_1', amount: 250000, gatewayFee: 1000 });
  expect(analytics.record).toHaveBeenCalledWith({
    type: 'booking_confirmed',
    meta: { doctorId: 'd1', fee: 250000 },
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (record not called)

Run: `npm test -- server/src/modules/payment/test.js`

- [ ] **Step 3: Implement the emit** — `server/src/modules/payment/service.js`

Add the import:

```js
import * as analytics from '../analytics/service.js';
```

At the END of `confirmPaidAppointment`, after the `await prisma.$transaction(...)` block closes (best-effort, outside the transaction):

```js
  // KPI #1 conversion event (doc 14 §6). Best-effort: fires for both the webhook and
  // reconciliation confirm paths; analytics.record never throws.
  await analytics.record({
    type: 'booking_confirmed',
    meta: { doctorId: appointment.doctorId, fee: amount },
  });
```

- [ ] **Step 4: Run it — expect PASS** (full payment suite)

Run: `npm test -- server/src/modules/payment`

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/payment/service.js server/src/modules/payment/test.js
git commit -m "feat(analytics): emit booking_confirmed on confirm (webhook + reconciliation)"
```

---

## Task 5: Sentry error tracking (DSN-gated + PII scrubbing) + config rename

**Files:**
- Modify: `server/src/config/env/env.js`, `.env.example`
- Modify: `server/src/lib/errorTracking/errorTracking.js`
- Modify: `server/package.json` (add `@sentry/node`)
- Test: `server/src/lib/errorTracking/errorTracking.test.js`

- [ ] **Step 1: Add the dependency**

Run: `npm install --workspace server @sentry/node`

- [ ] **Step 2: Rename the env var** — `server/src/config/env/env.js`

Replace `ERROR_TRACKING_DSN: z.string().optional(),` with:

```js
  SENTRY_DSN: z.string().optional(),
```

And in `.env.example` rename `ERROR_TRACKING_DSN=` → `SENTRY_DSN=`.

- [ ] **Step 3: Write the failing test** — `server/src/lib/errorTracking/errorTracking.test.js`

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn() }));
import * as Sentry from '@sentry/node';
import { initErrorTracking, beforeSend } from './errorTracking.js';

beforeEach(() => vi.clearAllMocks());

describe('initErrorTracking', () => {
  it('no-ops when no DSN is provided', () => {
    initErrorTracking(undefined);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry when a DSN is provided', () => {
    initErrorTracking('https://abc@o1.ingest.sentry.io/1');
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = Sentry.init.mock.calls[0][0];
    expect(opts.dsn).toBe('https://abc@o1.ingest.sentry.io/1');
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
  });
});

describe('beforeSend PII scrubbing', () => {
  it('strips request body, cookies, auth headers, and user identity', () => {
    const scrubbed = beforeSend({
      request: {
        data: { email: 'p@x.io', password: 'secret', subjectName: 'Jane' },
        cookies: 'session=abc',
        headers: { authorization: 'Bearer t', cookie: 'session=abc', 'user-agent': 'UA' },
      },
      user: { email: 'p@x.io', id: 'u1' },
    });
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers['user-agent']).toBe('UA');
    expect(scrubbed.user).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it — expect FAIL** (`beforeSend` not exported / behavior absent)

Run: `npm test -- server/src/lib/errorTracking`

- [ ] **Step 5: Implement** — `server/src/lib/errorTracking/errorTracking.js`

```js
// @ts-check
import * as Sentry from '@sentry/node';
import { env } from '../../config/env/env.js';
import { logger } from '../logger/logger.js';

let active = false;

/**
 * Sentry beforeSend hook (doc 08 control): strip PII before any event leaves the process —
 * request bodies, cookies, auth headers, and user identity (emails / patient identifiers).
 * @param {any} event
 */
export function beforeSend(event) {
  if (event?.request) {
    delete event.request.data; // request body
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
  }
  delete event?.user; // emails / patient identifiers
  return event;
}

/** Initialize error tracking. No-op until a DSN is configured. */
export function initErrorTracking(dsn = env.SENTRY_DSN) {
  if (!dsn) {
    logger.info('error-tracking disabled (no DSN)');
    return;
  }
  Sentry.init({ dsn, sendDefaultPii: false, beforeSend });
  active = true;
  logger.info('error-tracking enabled');
}

export function captureException(err) {
  if (active) {
    Sentry.captureException(err);
    return;
  }
  logger.error('captured', { err: String(err) });
}
```

- [ ] **Step 6: Run it — expect PASS**

Run: `npm test -- server/src/lib/errorTracking`

- [ ] **Step 7: Commit**

```bash
git add server/src/lib/errorTracking server/src/config/env/env.js .env.example server/package.json package.json package-lock.json
git commit -m "feat(observability): DSN-gated Sentry with PII scrubbing; rename ERROR_TRACKING_DSN->SENTRY_DSN"
```

---

## Task 6: Remove the errorHandler ZodError duck-typing

**Files:**
- Modify: `server/src/http/errorHandler/errorHandler.js`
- Test: `server/src/http/errorHandler/errorHandler.test.js`

**Prereq:** Task 1 is committed and `npm ls zod` shows a single v3 copy.

- [ ] **Step 1: Write the failing/guard test** — `server/src/http/errorHandler/errorHandler.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { ZodError } from 'zod';
import { errorHandler } from './errorHandler.js';
import { medicineCreateSchema } from '../../../../shared/schemas/index.js';

vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

function mockRes() {
  return {
    statusCode: 0,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('errorHandler ZodError handling (single-copy proof)', () => {
  it('a shared-schema ZodError is an instanceof the server zod ZodError', () => {
    const err = medicineCreateSchema.safeParse({}).error;
    expect(err).toBeInstanceOf(ZodError);
  });

  it('maps a shared-schema ZodError to 400 VALIDATION_FAILED', () => {
    const err = medicineCreateSchema.safeParse({ name: '', dosageForms: [] }).error;
    const res = mockRes();
    errorHandler(err, { path: '/x', method: 'POST' }, res, () => {});
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
```

- [ ] **Step 2: Run it — expect PASS already for the instanceof assertion (single copy from Task 1); the mapping test passes via the current duck-type path**

Run: `npm test -- server/src/http/errorHandler`
Expected: PASS (this test guards the behavior before and after the refactor).

- [ ] **Step 3: Remove the duck-typing** — `server/src/http/errorHandler/errorHandler.js`

Replace the comment + duck-typed condition:

```js
  // instanceof alone misses ZodErrors from shared/ (root zod@4) — the server pins zod@3; duck-type as fallback.
  if (err instanceof ZodError || (err?.name === 'ZodError' && Array.isArray(err?.issues))) {
```

with the plain instanceof check (now that shared + server share one zod copy):

```js
  if (err instanceof ZodError) {
```

- [ ] **Step 4: Run it — expect PASS** (proves single copy: a shared-schema error is caught by `instanceof`)

Run: `npm test -- server/src/http/errorHandler`

- [ ] **Step 5: Commit**

```bash
git add server/src/http/errorHandler/errorHandler.js server/src/http/errorHandler/errorHandler.test.js
git commit -m "refactor(errorHandler): drop ZodError duck-typing now that zod is single-copy"
```

---

## Task 7: Settings(id=1) boot bootstrap

**Files:**
- Create: `server/src/lib/settings/ensureSettings.js`
- Modify: `server/src/index.js`, `prisma/seed.js`
- Test: `server/src/lib/settings/ensureSettings.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/lib/settings/ensureSettings.test.js`

```js
import { describe, it, expect, afterAll } from 'vitest';
import { ensureSettings } from './ensureSettings.js';
import { prisma } from '../../lib/prisma/prisma.js';

describe('ensureSettings', () => {
  it('is idempotent — two calls leave exactly one settings row (id=1)', async () => {
    await ensureSettings();
    await ensureSettings();
    const count = await prisma.settings.count();
    const row = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(count).toBe(1);
    expect(row?.id).toBe(1);
  });

  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 2: Run it — expect FAIL** (module not found)

Run: `npm test -- server/src/lib/settings`

- [ ] **Step 3: Implement** — `server/src/lib/settings/ensureSettings.js`

```js
// @ts-check
import { prisma } from '../prisma/prisma.js';

/**
 * Idempotent Settings(id=1) bootstrap (doc 10 §3). Runs at boot so a fresh DB serves
 * GET/PUT /api/admin/settings without the null/throw trap. Schema defaults fill the row.
 * @param {{ settings: { upsert: Function } }} [client]
 */
export function ensureSettings(client = prisma) {
  return client.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npm test -- server/src/lib/settings`

- [ ] **Step 5: Wire into boot** — `server/src/index.js`

Add the import:

```js
import { ensureSettings } from './lib/settings/ensureSettings.js';
```

In the direct-execution block, before `startWorkers()` / `listen`:

```js
  initErrorTracking();
  await ensureSettings();
  startWorkers();
  createApp().listen(env.PORT, () => logger.info(`Dermestha listening on :${env.PORT}`));
```

(Top-level `await` is valid in this ESM entrypoint.)

- [ ] **Step 6: Mirror into the seed** — `prisma/seed.js`

Replace the inline `await prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });` with the shared helper for dev parity:

```js
import { ensureSettings } from '../server/src/lib/settings/ensureSettings.js';
// ...
  await ensureSettings(prisma);
```

- [ ] **Step 7: Run it — expect PASS; seed still runs**

Run: `npm test -- server/src/lib/settings` and `npm run db:seed`

- [ ] **Step 8: Commit**

```bash
git add server/src/lib/settings server/src/index.js prisma/seed.js
git commit -m "feat(ops): idempotent Settings(id=1) bootstrap at boot + seed parity"
```

---

## Task 8: DB index migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_slice_h_s6_indexes/migration.sql`

- [ ] **Step 1: Add the indexes** — `prisma/schema.prisma`

In `model Appointment`, add alongside the existing `@@index` lines:

```prisma
  @@index([slotStart])
```

In `model AuditLog`, add alongside the existing `@@index` lines:

```prisma
  @@index([targetRef])
```

- [ ] **Step 2: Generate + apply the migration**

Run: `npx prisma migrate dev --name slice_h_s6_indexes`
Expected: a new migration with two `CREATE INDEX` statements; applies cleanly.

- [ ] **Step 3: Verify**

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add AuditLog(targetRef) + Appointment(slotStart) indexes"
```

---

## Task 9: Full verification (blast-radius gate)

- [ ] **Step 1: Clean install + single-copy check**

Run: `rm -rf node_modules && npm install && npm ls zod`
Expected: one `zod@3.x`; no `zod@4`.

- [ ] **Step 2: Server + shared suite**

Run: `npm test`
Expected: all green; record the count (was 248 server + shared).

- [ ] **Step 3: Client suite**

Run: `npm --workspace client test`
Expected: all green (was 97).

- [ ] **Step 4: Client build**

Run: `npm --workspace client run build`
Expected: success.

- [ ] **Step 5: Migrate status**

Run: `npx prisma migrate status`
Expected: up to date.

---

## Self-Review

**Spec coverage:** (1) analytics endpoint + writer + `booking_confirmed` → Tasks 2,3,4. (2) Sentry DSN-gated + scrubbing → Task 5. (3) two indexes → Task 8. (4) Settings bootstrap → Task 7. (5) Zod single-copy + drop duck-typing → Tasks 1,6. (6) `SENTRY_DSN` config → Task 5. All six covered.

**Type consistency:** `analyticsEventSchema` / `ANALYTICS_EVENT_TYPES`, `analytics.record({type,networkType,meta})`, `analyticsRouter` + `ANALYTICS_RATE`, `ensureSettings(client?)`, `beforeSend`, `initErrorTracking(dsn?)` — names consistent across tasks.

**Ordering:** Task 1 (zod single-copy) precedes Task 6 (drop duck-typing) — the workaround is only removed after single-copy is confirmed.
</content>
</invoke>
