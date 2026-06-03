# Slice C — Booking + Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the patient money round-trip — pick slot → `slot_locked` → pay (dev mock gateway, signed IPN) → `confirmed` → see in dashboard → cancel → net-of-fee refund — for the M1+M2 journey (F03 + F04 + F06), with no schema change.

**Architecture:** New server services behind the existing service/controller/route layering. `appointmentState.service` is the *only* writer of `Appointment.state` (doc 05 §5); side-effects (refund, email) fire post-commit. Payment is simulated by a dev mock `PaymentProvider` (`payfast.mock`) whose hosted-checkout page posts a *real* HMAC-signed IPN through the production `verifyWebhook` + atomic-commit path. Lock expiry is lazy (derived from `lockExpiresAt` at read + reclaim-on-conflict at write) — no background worker.

**Tech Stack:** Node/Express, Prisma/Postgres, Zod (shared DTOs), Vitest + supertest (server), React + TanStack Query + React Testing Library (client). Money is integer PKR-paisa; instants are UTC, rendered Asia/Karachi.

**Spec:** `docs/superpowers/specs/2026-06-03-slice-c-booking-payment-design.md`
**Branch:** `feat/slice-c-booking-payment` (already created; spec + changelog committed).

**Conventions to follow (from the codebase):**
- Every server file starts with `// @ts-check`.
- Errors are `throw new AppError(CODE, message, status, details?)`; the error handler emits `{ error: { code, message, details } }`.
- Services own logic; controllers are thin `try/catch → next(e)`; routes wire `requireRole` + `validate`.
- Unit tests mock `../lib/prisma.js` with `vi.mock`; integration tests use `supertest` against `createApp()` and a real DB (`request.agent(app)` for an authenticated session).
- Commit after each green task. Run server tests with `npm test`; client tests with `npm --workspace client test`.

---

## Phase 0 — Config & integration seams

### Task 0.1: Add env switches (payment/email provider + reuse PayFast passphrase)

**Files:**
- Modify: `server/src/config/env.js`
- Modify: `server/src/config/env.test.js`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test** — append to `server/src/config/env.test.js`:

```js
it('defaults PAYMENT_PROVIDER and EMAIL_PROVIDER to stub and accepts overrides', () => {
  const base = {
    APP_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
    SESSION_SECRET: 'x'.repeat(16),
  };
  expect(parseEnv(base).PAYMENT_PROVIDER).toBe('stub');
  expect(parseEnv(base).EMAIL_PROVIDER).toBe('stub');
  const dev = parseEnv({ ...base, PAYMENT_PROVIDER: 'mock', EMAIL_PROVIDER: 'console' });
  expect(dev.PAYMENT_PROVIDER).toBe('mock');
  expect(dev.EMAIL_PROVIDER).toBe('console');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- env.test`
Expected: FAIL (`PAYMENT_PROVIDER` undefined).

- [ ] **Step 3: Implement** — in `server/src/config/env.js`, add to the `schema` object (after `PAYFAST_MERCHANT_ID`):

```js
  PAYFAST_PASSPHRASE: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['stub', 'mock']).default('stub'),
  EMAIL_PROVIDER: z.enum(['stub', 'console']).default('stub'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- env.test`
Expected: PASS.

- [ ] **Step 5: Update `.env.example`** — under the PayFast block add:

```bash
PAYMENT_PROVIDER=stub                      # stub (prod, not yet wired) | mock (dev simulated gateway)
EMAIL_PROVIDER=stub                        # stub (throws) | console (dev logging adapter)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/config/env.js server/src/config/env.test.js .env.example
git commit -m "feat(slice-c): env switches for payment/email provider + payfast passphrase"
```

---

### Task 0.2: Dev logging email adapter + provider switch

**Files:**
- Create: `server/src/integrations/email/console.dev.js`
- Modify: `server/src/integrations/email/index.js`
- Create: `server/src/integrations/email/console.dev.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/integrations/email/console.dev.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { consoleEmail } from './console.dev.js';

describe('consoleEmail dev adapter', () => {
  it('send resolves with a providerId and never throws', async () => {
    const out = await consoleEmail.send({ template: 'booking_confirmation', to: 'p@t.test', vars: { x: 1 } });
    expect(out.providerId).toMatch(/^dev_/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- console.dev`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/integrations/email/console.dev.js`:

```js
// @ts-check
import { logger } from '../../lib/logger.js';

/** Dev email adapter: logs instead of sending. Selected when EMAIL_PROVIDER=console. */
/** @type {import('./index.js').EmailProvider} */
export const consoleEmail = {
  async send({ template, to, vars }) {
    logger.info('DEV email', { template, to, vars });
    return { providerId: `dev_${Date.now()}` };
  },
  parseWebhook() {
    throw new Error('console.dev parseWebhook not supported');
  },
};
```

- [ ] **Step 4: Wire the switch** — replace the body of `server/src/integrations/email/index.js` below the typedef with:

```js
import { resendStub } from './resend.stub.js';
import { consoleEmail } from './console.dev.js';
import { env } from '../../config/env.js';

export const emailProvider = env.EMAIL_PROVIDER === 'console' ? consoleEmail : resendStub;
```

(Keep the existing `@typedef EmailProvider` JSDoc block and the `import { resendStub }` — just add the `consoleEmail` + `env` imports and the conditional export.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- console.dev`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/integrations/email/
git commit -m "feat(slice-c): dev logging email adapter + EMAIL_PROVIDER switch"
```

---

### Task 0.3: Dev mock payment gateway (`payfast.mock`) + provider switch

**Files:**
- Create: `server/src/integrations/payment/payfast.mock.js`
- Modify: `server/src/integrations/payment/index.js`
- Create: `server/src/integrations/payment/payfast.mock.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/integrations/payment/payfast.mock.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { payfastMock, buildSignedIpn, signParams } from './payfast.mock.js';

describe('payfast.mock gateway', () => {
  it('createCheckout returns a dev redirectUrl + providerRef', async () => {
    const out = await payfastMock.createCheckout({
      appointmentId: 'a1', intentKey: 'u1:2026', amount: 250000,
      returnUrl: 'r', cancelUrl: 'c', notifyUrl: 'n',
    });
    expect(out.providerRef).toMatch(/^mock_/);
    expect(out.redirectUrl).toContain('/dev/checkout?ref=');
  });

  it('verifyWebhook accepts a correctly signed IPN and parses it', () => {
    const ipn = buildSignedIpn({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000, gatewayFee: 5000 });
    const result = payfastMock.verifyWebhook({ body: ipn });
    expect(result).toEqual({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000, gatewayFee: 5000 });
  });

  it('verifyWebhook throws 401 on a bad signature', () => {
    const ipn = buildSignedIpn({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000 });
    expect(() => payfastMock.verifyWebhook({ body: { ...ipn, signature: 'tampered' } }))
      .toThrowError(/signature/i);
  });

  it('signParams ignores the signature field and is order-independent', () => {
    const a = signParams({ b: 2, a: 1, signature: 'zzz' });
    const b = signParams({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('refund returns a settled refundRef keyed by idempotencyKey', async () => {
    const out = await payfastMock.refund({ providerRef: 'mock_1', amount: 240000, idempotencyKey: 'rf_a1' });
    expect(out).toEqual({ refundRef: 'refund_rf_a1', status: 'settled' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- payfast.mock`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/integrations/payment/payfast.mock.js`:

```js
// @ts-check
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../http/AppError.js';

const PASSPHRASE = env.PAYFAST_PASSPHRASE || 'dev-mock-passphrase';

/** Deterministic HMAC over the IPN params (sorted key=value joined by &), excluding `signature`/nullish. */
export function signParams(params) {
  const base = Object.keys(params)
    .filter((k) => k !== 'signature' && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHmac('sha256', PASSPHRASE).update(base).digest('hex');
}

/** Build a signed IPN body (used by the dev checkout-complete handler and tests). */
export function buildSignedIpn({ event, providerRef, intentKey, amount, gatewayFee = null }) {
  const params = { event, providerRef, intentKey, amount, gatewayFee };
  return { ...params, signature: signParams(params) };
}

/** @type {import('./index.js').PaymentProvider} */
export const payfastMock = {
  async createCheckout({ providerRef } = {}) {
    const ref = providerRef || `mock_${crypto.randomUUID()}`;
    return { redirectUrl: `${env.APP_BASE_URL}/dev/checkout?ref=${encodeURIComponent(ref)}`, providerRef: ref };
  },
  verifyWebhook(req) {
    const b = req.body ?? {};
    if (!b.signature || b.signature !== signParams(b)) {
      throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed.', 401);
    }
    return {
      event: b.event,
      providerRef: b.providerRef,
      intentKey: b.intentKey,
      amount: Number(b.amount),
      gatewayFee: b.gatewayFee == null ? null : Number(b.gatewayFee),
    };
  },
  async refund({ idempotencyKey }) {
    return { refundRef: `refund_${idempotencyKey}`, status: 'settled' };
  },
  async listUnconfirmed() {
    return [];
  },
};
```

- [ ] **Step 4: Wire the switch** — replace `server/src/integrations/payment/index.js` (keep the `@typedef` block) so the export reads:

```js
// @ts-check
import { payfastStub } from './payfast.stub.js';
import { payfastMock } from './payfast.mock.js';
import { env } from '../../config/env.js';

/* (keep the existing @typedef PaymentProvider JSDoc block here) */

/** Selected provider. `mock` = dev simulated gateway; `stub` (default) = prod, not yet wired. */
export const paymentProvider = env.PAYMENT_PROVIDER === 'mock' ? payfastMock : payfastStub;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- payfast.mock`
Expected: PASS (4–5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/integrations/payment/
git commit -m "feat(slice-c): dev mock payment gateway with real signed IPN + PAYMENT_PROVIDER switch"
```

---

## Phase 1 — Backend domain

### Task 1.1: Shared booking/cancel Zod DTOs

**Files:**
- Create: `shared/schemas/booking.js`
- Modify: `shared/schemas/index.js`
- Create: `shared/schemas/booking.test.js`

- [ ] **Step 1: Write the failing test** — `shared/schemas/booking.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { lockSchema, cancelSchema } from './booking.js';

describe('booking schemas', () => {
  it('lockSchema accepts a self booking', () => {
    const r = lockSchema.safeParse({ doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: true });
    expect(r.success).toBe(true);
  });
  it('lockSchema requires subject fields when forSelf is false', () => {
    const bad = lockSchema.safeParse({ doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: false });
    expect(bad.success).toBe(false);
    const ok = lockSchema.safeParse({
      doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: false,
      subject: { name: 'Child', age: 7, relation: 'Son' },
    });
    expect(ok.success).toBe(true);
  });
  it('cancelSchema allows an optional reason', () => {
    expect(cancelSchema.safeParse({}).success).toBe(true);
    expect(cancelSchema.safeParse({ reason: 'unavailable' }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- booking.test` (run from repo root; Vitest picks up `shared/`)
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `shared/schemas/booking.js`:

```js
// @ts-check
import { z } from 'zod';

const subjectSchema = z.object({
  name: z.string().min(1).max(120),
  age: z.number().int().positive().max(120),
  relation: z.string().min(1).max(60),
});

/** POST /api/appointments/lock */
export const lockSchema = z
  .object({
    doctorId: z.string().min(1),
    slotStart: z.string().datetime(),
    forSelf: z.boolean(),
    subject: subjectSchema.optional(),
  })
  .refine((b) => b.forSelf || !!b.subject, {
    message: 'subject is required when forSelf is false',
    path: ['subject'],
  });

/** POST /api/appointments/:id/cancel */
export const cancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
```

- [ ] **Step 4: Re-export** — add to `shared/schemas/index.js`:

```js
export * from './booking.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- booking.test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/schemas/booking.js shared/schemas/booking.test.js shared/schemas/index.js
git commit -m "feat(slice-c): shared lock + cancel Zod DTOs"
```

---

### Task 1.2: `audit.service.record` accepts an optional transaction client

So audit rows can be written inside the same `$transaction` as a state change (atomicity, #2).

**Files:**
- Modify: `server/src/services/audit.service.js`
- Modify: `server/src/services/audit.service.test.js`

- [ ] **Step 1: Write the failing test** — append to `server/src/services/audit.service.test.js` (mirror the existing mock style; if the file mocks prisma, extend it):

```js
it('record uses the provided client when given (tx support)', async () => {
  const fakeClient = { auditLog: { create: vi.fn().mockResolvedValue({ id: 'a1' }) } };
  await record({ eventType: 'appointment.confirmed', actorType: 'system', targetRef: 'appt1' }, fakeClient);
  expect(fakeClient.auditLog.create).toHaveBeenCalledOnce();
});
```

(If `record` is imported at the top of the existing test, reuse that import; otherwise add `import { record } from './audit.service.js'` and `import { vi } from 'vitest'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- audit.service`
Expected: FAIL (second arg ignored → calls the real `prisma`, not `fakeClient`).

- [ ] **Step 3: Implement** — change the signature in `server/src/services/audit.service.js`:

```js
export function record(e, client = prisma) {
  return client.auditLog.create({
    data: {
      eventType: e.eventType,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      targetRef: e.targetRef ?? null,
      reason: e.reason ?? null,
      meta: e.meta ?? undefined,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- audit.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/audit.service.js server/src/services/audit.service.test.js
git commit -m "feat(slice-c): audit.record accepts an optional tx client"
```

---

### Task 1.3: `appointmentState.service` — the single state transition writer

**Files:**
- Create: `server/src/services/appointmentState.service.js`
- Create: `server/src/services/appointmentState.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/appointmentState.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../lib/prisma.js';
import * as audit from './audit.service.js';
import { transition } from './appointmentState.service.js';

beforeEach(() => vi.clearAllMocks());

describe('appointmentState.transition', () => {
  it('applies a legal transition + writes an audit entry', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    const out = await transition({ appointmentId: 'a1', to: 'confirmed', actorType: 'system', data: { feeAtBooking: 250000 } });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { state: 'confirmed', feeAtBooking: 250000 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.confirmed', actorType: 'system', targetRef: 'a1' }),
      prisma,
    );
    expect(out.state).toBe('confirmed');
  });

  it('rejects an illegal transition with INVALID_TRANSITION', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'completed' });
    await expect(transition({ appointmentId: 'a1', to: 'confirmed', actorType: 'system' }))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('throws 404 when the appointment is missing', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(transition({ appointmentId: 'x', to: 'confirmed', actorType: 'system' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- appointmentState`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/appointmentState.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import * as audit from './audit.service.js';

/** Legal transitions in Slice C scope (doc 05 §5). Extend in later slices. */
const LEGAL = {
  slot_locked: new Set(['confirmed']),
  confirmed: new Set(['cancelled_refunded', 'cancelled_no_refund', 'doctor_cancelled']),
};

/**
 * The ONLY writer of Appointment.state. Validates from→to, applies extra column data,
 * and appends the audit entry (using the same client, so it is atomic inside a $transaction).
 * @param {{ appointmentId: string, to: string,
 *   actorType: 'patient'|'doctor'|'system', actorId?: string|null, reason?: string|null,
 *   data?: object, client?: any }} args
 */
export async function transition({ appointmentId, to, actorType, actorId = null, reason = null, data = {}, client = prisma }) {
  const appt = await client.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  const allowed = LEGAL[appt.state];
  if (!allowed || !allowed.has(to)) {
    throw new AppError('INVALID_TRANSITION', `Cannot move ${appt.state} → ${to}.`, 409);
  }
  const updated = await client.appointment.update({ where: { id: appointmentId }, data: { state: to, ...data } });
  await audit.record({ eventType: `appointment.${to}`, actorType, actorId, targetRef: appointmentId, reason }, client);
  return updated;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- appointmentState`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/appointmentState.service.js server/src/services/appointmentState.service.test.js
git commit -m "feat(slice-c): appointmentState.service single transition writer"
```

---

### Task 1.4: Lazy-expiry — exclude expired locks from slot generation

**Files:**
- Modify: `server/src/services/availability.service.js:58-65` (the `active` query in `generateSlots`)
- Create: `server/src/services/availability.expiry.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/availability.expiry.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    availabilityBlock: { findMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}));

import { prisma } from '../lib/prisma.js';
import { generateSlots } from './availability.service.js';

beforeEach(() => vi.clearAllMocks());

describe('generateSlots lazy-expiry', () => {
  it('queries active appointments while excluding expired slot_locked rows', async () => {
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    prisma.settings.findUnique.mockResolvedValue({ minBookingLeadMinutes: 0 });
    prisma.appointment.findMany.mockResolvedValue([]);
    // A future Monday in Karachi terms.
    const date = '2099-01-04'; // a Monday
    await generateSlots('d1', date);
    const call = prisma.appointment.findMany.mock.calls[0][0];
    expect(call.where.NOT).toEqual({ state: 'slot_locked', lockExpiresAt: { lt: expect.any(Date) } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- availability.expiry`
Expected: FAIL (`where.NOT` is undefined).

- [ ] **Step 3: Implement** — in `server/src/services/availability.service.js`, change the `active` query inside `generateSlots` to add the `NOT` clause:

```js
  const active = await prisma.appointment.findMany({
    where: {
      doctorId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { in: future.map((s) => s.slotStart) },
      // Lazy expiry: an expired slot_locked no longer occupies the slot (Slice C, ADR-23).
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: new Date() } },
    },
    select: { slotStart: true },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- availability.expiry`
Expected: PASS. Then run the existing Slice-B suite to confirm no regression: `npm test -- availability.service` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/availability.service.js server/src/services/availability.expiry.test.js
git commit -m "feat(slice-c): lazy lock-expiry in slot generation (ADR-23)"
```

---

### Task 1.5: `booking.service.lockSlot` (validate, single-lock, no-overlap, reclaim-on-conflict)

**Files:**
- Create: `server/src/services/booking.service.js`
- Create: `server/src/services/booking.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/booking.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));
vi.mock('./availability.service.js', () => ({ generateSlots: vi.fn() }));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../lib/prisma.js';
import * as availability from './availability.service.js';
import { lockSlot } from './booking.service.js';

const slotStart = '2099-01-04T13:00:00.000Z';
const bookable = () => availability.generateSlots.mockResolvedValue([{ slotStart, slotEnd: '2099-01-04T13:30:00.000Z' }]);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.appointment.findFirst.mockResolvedValue(null); // no existing lock / no overlap by default
});

describe('booking.lockSlot', () => {
  it('rejects a slot that is not bookable', async () => {
    availability.generateSlots.mockResolvedValue([]);
    await expect(lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }))
      .rejects.toMatchObject({ code: 'SLOT_NOT_BOOKABLE', status: 422 });
  });

  it('rejects when the patient already holds a live lock (single-lock)', async () => {
    bookable();
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'lock1' }); // existing live lock
    await expect(lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }))
      .rejects.toMatchObject({ code: 'ACTIVE_LOCK_EXISTS', status: 409 });
  });

  it('inserts a slot_locked row on the happy path', async () => {
    bookable();
    prisma.appointment.create.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    const out = await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(out).toMatchObject({ id: 'a1', state: 'slot_locked' });
    expect(prisma.appointment.create).toHaveBeenCalledOnce();
  });

  it('reclaims an expired lock on P2002 then retries', async () => {
    bookable();
    prisma.appointment.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'a2', state: 'slot_locked' });
    // findFirst calls: (1) live-lock check null, (2) overlap check null, (3) expired-blocker found
    prisma.appointment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'expired1' });
    prisma.appointment.delete.mockResolvedValue({});
    const out = await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'expired1' } });
    expect(out).toMatchObject({ id: 'a2' });
  });

  it('returns SLOT_TAKEN on P2002 when the blocker is NOT an expired lock', async () => {
    bookable();
    prisma.appointment.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.appointment.findFirst
      .mockResolvedValueOnce(null) // live lock
      .mockResolvedValueOnce(null) // overlap
      .mockResolvedValueOnce(null); // no expired blocker
    await expect(lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }))
      .rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- booking.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/booking.service.js`:

```js
// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { KARACHI } from '../lib/tz.js';
import { SLOT_GRANULARITY_MIN, SLOT_LOCK_TTL_MIN, ACTIVE_APPOINTMENT_STATES } from '../config/constants.js';
import { generateSlots } from './availability.service.js';
import * as audit from './audit.service.js';

/**
 * Create a slot_locked hold for a patient. Validates the slot is genuinely bookable,
 * enforces Single-Lock + No-Overlap, then inserts — reclaiming an expired lock on collision.
 * @param {{ patientUserId: string, doctorId: string, slotStart: string,
 *   forSelf: boolean, subject?: { name: string, age: number, relation: string } }} args
 */
export async function lockSlot({ patientUserId, doctorId, slotStart, forSelf, subject }) {
  const slotStartDate = new Date(slotStart);
  const slotEnd = new Date(slotStartDate.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000);
  const now = new Date();

  // 1. The slot must currently be a real, future, lead-time-valid, un-taken slot.
  const dateYMD = formatInTimeZone(slotStartDate, KARACHI, 'yyyy-MM-dd');
  const slots = await generateSlots(doctorId, dateYMD);
  if (!slots.some((s) => s.slotStart === slotStartDate.toISOString())) {
    throw new AppError('SLOT_NOT_BOOKABLE', 'That slot is not available.', 422);
  }

  // 2. Single-Lock: no other live hold for this patient.
  const liveLock = await prisma.appointment.findFirst({
    where: { patientUserId, state: 'slot_locked', lockExpiresAt: { gt: now } },
    select: { id: true },
  });
  if (liveLock) throw new AppError('ACTIVE_LOCK_EXISTS', 'Finish your current booking first.', 409);

  // 3. No-Overlap: no active appointment overlapping [slotStart, slotEnd).
  const overlap = await prisma.appointment.findFirst({
    where: {
      patientUserId,
      state: { in: ACTIVE_APPOINTMENT_STATES },
      slotStart: { lt: slotEnd },
      slotEnd: { gt: slotStartDate },
      NOT: { state: 'slot_locked', lockExpiresAt: { lt: now } },
    },
    select: { id: true },
  });
  if (overlap) throw new AppError('OVERLAP', 'You already have an appointment at this time.', 409);

  const data = {
    doctorId,
    patientUserId,
    slotStart: slotStartDate,
    slotEnd,
    state: 'slot_locked',
    lockExpiresAt: new Date(now.getTime() + SLOT_LOCK_TTL_MIN * 60 * 1000),
    forSelf,
    subjectName: subject?.name ?? null,
    subjectAge: subject?.age ?? null,
    subjectRelation: subject?.relation ?? null,
  };

  const created = await createWithReclaim(data, doctorId, slotStartDate, now);
  await audit.record({ eventType: 'appointment.slot_locked', actorType: 'patient', actorId: patientUserId, targetRef: created.id });
  return created;
}

async function createWithReclaim(data, doctorId, slotStartDate, now) {
  try {
    return await prisma.appointment.create({ data });
  } catch (e) {
    if (e?.code !== 'P2002') throw e;
    const blocker = await prisma.appointment.findFirst({
      where: { doctorId, slotStart: slotStartDate, state: 'slot_locked', lockExpiresAt: { lt: now } },
      select: { id: true },
    });
    if (!blocker) throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
    await prisma.appointment.delete({ where: { id: blocker.id } });
    try {
      return await prisma.appointment.create({ data });
    } catch (e2) {
      if (e2?.code === 'P2002') throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
      throw e2;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- booking.service`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/booking.service.js server/src/services/booking.service.test.js
git commit -m "feat(slice-c): booking.service lockSlot with single-lock, no-overlap, reclaim"
```

---

### Task 1.6: `refund.service` — net-of-fee math + idempotent refund

**Files:**
- Create: `server/src/services/refund.service.js`
- Create: `server/src/services/refund.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/refund.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { payment: { findFirst: vi.fn(), update: vi.fn() }, settings: { findUnique: vi.fn() } },
}));
vi.mock('../integrations/payment/index.js', () => ({
  paymentProvider: { refund: vi.fn() },
}));

import { prisma } from '../lib/prisma.js';
import { paymentProvider } from '../integrations/payment/index.js';
import { quoteRefund, initiateRefund } from './refund.service.js';

beforeEach(() => vi.clearAllMocks());

describe('refund.quoteRefund', () => {
  it('uses the reported gateway fee when present', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: 6000 });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 250, fallbackFeeFixed: 0 });
    expect(await quoteRefund('a1')).toEqual({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
  });

  it('falls back to the Settings fee model when none reported', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: null });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 250, fallbackFeeFixed: 1000 });
    // 2.50% of 250000 = 6250, + 1000 fixed = 7250
    expect(await quoteRefund('a1')).toEqual({ amountPaid: 250000, gatewayFee: 7250, refund: 242750 });
  });
});

describe('refund.initiateRefund', () => {
  it('calls the provider net-of-fee + persists an idempotency key, ref, status', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'p1', appointmentId: 'a1', amount: 250000, gatewayFee: 6000, providerRef: 'mock_1', refundIdempotencyKey: null });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 0, fallbackFeeFixed: 0 });
    paymentProvider.refund.mockResolvedValue({ refundRef: 'refund_rf_a1', status: 'settled' });
    await initiateRefund({ appointmentId: 'a1' });
    expect(paymentProvider.refund).toHaveBeenCalledWith({ providerRef: 'mock_1', amount: 244000, idempotencyKey: 'rf_a1' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { refundIdempotencyKey: 'rf_a1', refundRef: 'refund_rf_a1', refundStatus: 'settled' },
    });
  });

  it('is a no-op when there is no successful payment', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    expect(await initiateRefund({ appointmentId: 'a1' })).toBeNull();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- refund.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/refund.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { paymentProvider } from '../integrations/payment/index.js';

function fallbackFee(amount, s) {
  const pct = Math.round((amount * (s?.fallbackFeePctBps ?? 0)) / 10000);
  return pct + (s?.fallbackFeeFixed ?? 0);
}

/** Pure-ish quote so the cancel modal and dashboard show the identical number (policy #5). */
export async function quoteRefund(appointmentId) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) throw new AppError('NOT_FOUND', 'No payment to refund.', 404);
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const gatewayFee = payment.gatewayFee ?? fallbackFee(payment.amount, settings);
  return { amountPaid: payment.amount, gatewayFee, refund: Math.max(0, payment.amount - gatewayFee) };
}

/** Idempotency-keyed refund (#10). Best-effort caller fires the email post-commit. */
export async function initiateRefund({ appointmentId }) {
  const payment = await prisma.payment.findFirst({ where: { appointmentId, status: 'success' } });
  if (!payment) return null;
  const { refund } = await quoteRefund(appointmentId);
  const key = payment.refundIdempotencyKey ?? `rf_${appointmentId}`;
  const result = await paymentProvider.refund({ providerRef: payment.providerRef, amount: refund, idempotencyKey: key });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { refundIdempotencyKey: key, refundRef: result.refundRef, refundStatus: result.status },
  });
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- refund.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/refund.service.js server/src/services/refund.service.test.js
git commit -m "feat(slice-c): refund.service net-of-fee quote + idempotent refund"
```

---

### Task 1.7: `payment.service` — createIntent + processWebhook (atomic commit)

**Files:**
- Create: `server/src/services/payment.service.js`
- Create: `server/src/services/payment.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/payment.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    appointment: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    payment: { upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../integrations/payment/index.js', () => ({ paymentProvider: { createCheckout: vi.fn() } }));
vi.mock('../integrations/email/index.js', () => ({ emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) } }));
vi.mock('./appointmentState.service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../lib/prisma.js';
import { paymentProvider } from '../integrations/payment/index.js';
import * as state from './appointmentState.service.js';
import { createIntent, processWebhook } from './payment.service.js';

beforeEach(() => vi.clearAllMocks());

const liveLock = { id: 'a1', patientUserId: 'u1', doctorId: 'd1', state: 'slot_locked', slotStart: new Date('2099-01-04T13:00:00Z'), lockExpiresAt: new Date(Date.now() + 600000) };

describe('payment.createIntent', () => {
  it('creates an idempotent intent and returns the checkout redirectUrl', async () => {
    prisma.appointment.findUnique.mockResolvedValue(liveLock);
    prisma.doctor.findUnique.mockResolvedValue({ fee: 250000 });
    prisma.payment.upsert.mockResolvedValue({ id: 'p1', providerRef: null });
    paymentProvider.createCheckout.mockResolvedValue({ redirectUrl: '/dev/checkout?ref=mock_1', providerRef: 'mock_1' });
    const out = await createIntent({ patientUserId: 'u1', appointmentId: 'a1' });
    expect(out).toEqual({ redirectUrl: '/dev/checkout?ref=mock_1' });
    expect(prisma.payment.upsert).toHaveBeenCalled();
  });

  it('rejects when the lock has expired', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...liveLock, lockExpiresAt: new Date(Date.now() - 1000) });
    await expect(createIntent({ patientUserId: 'u1', appointmentId: 'a1' }))
      .rejects.toMatchObject({ code: 'LOCK_EXPIRED', status: 409 });
  });

  it('hides another patient’s appointment as 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...liveLock, patientUserId: 'other' });
    await expect(createIntent({ patientUserId: 'u1', appointmentId: 'a1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('payment.processWebhook', () => {
  it('on success commits state+payment in one $transaction', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'p1', appointmentId: 'a1', providerRef: 'mock_1' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked', patientUserId: 'u1' });
    prisma.$transaction.mockImplementation(async (fn) => fn({ payment: { update: vi.fn() } }));
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    await processWebhook({ event: 'payment.success', providerRef: 'mock_1', amount: 250000, gatewayFee: 6000 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'confirmed', data: { feeAtBooking: 250000, lockExpiresAt: null } }));
  });

  it('on an already-confirmed appointment is an idempotent no-op', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'p1', appointmentId: 'a1', providerRef: 'mock_1' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    await processWebhook({ event: 'payment.success', providerRef: 'mock_1', amount: 250000, gatewayFee: null });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- payment.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/payment.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { paymentProvider } from '../integrations/payment/index.js';
import { emailProvider } from '../integrations/email/index.js';
import * as appointmentState from './appointmentState.service.js';

/** Create (or reuse) the idempotent payment intent and return the hosted-checkout redirect. */
export async function createIntent({ patientUserId, appointmentId }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientUserId !== patientUserId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'slot_locked' || !appt.lockExpiresAt || appt.lockExpiresAt < new Date()) {
    throw new AppError('LOCK_EXPIRED', 'Your slot hold has expired. Please pick the slot again.', 409);
  }
  const doctor = await prisma.doctor.findUnique({ where: { id: appt.doctorId }, select: { fee: true } });
  const amount = doctor.fee;

  const payment = await prisma.payment.upsert({
    where: { intent_key: { patientUserId, slotStart: appt.slotStart } },
    update: {},
    create: { appointmentId, patientUserId, slotStart: appt.slotStart, amount, status: 'pending' },
  });

  const checkout = await paymentProvider.createCheckout({
    appointmentId,
    intentKey: `${patientUserId}:${appt.slotStart.toISOString()}`,
    amount,
    returnUrl: `${env.APP_BASE_URL}/pay/return?appt=${appointmentId}`,
    cancelUrl: `${env.APP_BASE_URL}/book/${appt.doctorId}`,
    notifyUrl: `${env.APP_BASE_URL}/api/webhooks/payfast`,
  });
  if (checkout.providerRef && checkout.providerRef !== payment.providerRef) {
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: checkout.providerRef } });
  }
  return { redirectUrl: checkout.redirectUrl };
}

/** Process a verified IPN. Source of truth for confirmation (#2). */
export async function processWebhook({ event, providerRef, amount, gatewayFee }) {
  const payment = await prisma.payment.findFirst({ where: { providerRef } });
  if (!payment) throw new AppError('NOT_FOUND', 'Unknown payment reference.', 404);

  if (event === 'payment.failed') {
    await prisma.appointment.deleteMany({ where: { id: payment.appointmentId, state: 'slot_locked' } });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed' } });
    return { ok: true };
  }

  const appt = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
  if (!appt || appt.state === 'confirmed') return { ok: true }; // idempotent

  await prisma.$transaction(async (tx) => {
    await appointmentState.transition({
      appointmentId: appt.id,
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: amount, lockExpiresAt: null },
      client: tx,
    });
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'success', gatewayFee: gatewayFee ?? null } });
  });

  // Post-commit, best-effort confirmation email (never blocks the transition).
  try {
    const patient = await prisma.user.findUnique({ where: { id: appt.patientUserId }, select: { email: true, fullName: true } });
    await emailProvider.send({
      template: 'booking_confirmation',
      to: patient.email,
      vars: { patientName: patient.fullName, appointmentRef: appt.id },
    });
  } catch {
    logger.warn('confirmation email not sent', { appointmentId: appt.id });
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- payment.service`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/payment.service.js server/src/services/payment.service.test.js
git commit -m "feat(slice-c): payment.service createIntent + atomic webhook commit"
```

---

### Task 1.8: `cancellation.service` — patient (≥2h/<2h) + doctor cancel

**Files:**
- Create: `server/src/services/cancellation.service.js`
- Create: `server/src/services/cancellation.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/cancellation.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findUnique: vi.fn() }, doctor: { findUnique: vi.fn() }, user: { findUnique: vi.fn() } },
}));
vi.mock('./appointmentState.service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('./refund.service.js', () => ({ initiateRefund: vi.fn().mockResolvedValue({ refundRef: 'r', status: 'settled' }) }));
vi.mock('../integrations/email/index.js', () => ({ emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) } }));

import { prisma } from '../lib/prisma.js';
import * as state from './appointmentState.service.js';
import * as refund from './refund.service.js';
import { cancel } from './cancellation.service.js';

const future = (mins) => new Date(Date.now() + mins * 60000);
beforeEach(() => vi.clearAllMocks());

describe('cancellation.cancel', () => {
  it('patient ≥2h before → cancelled_refunded + refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'u1', slotStart: future(180) });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'cancelled_refunded' }));
    expect(refund.initiateRefund).toHaveBeenCalledWith({ appointmentId: 'a1' });
    expect(out.state).toBe('cancelled_refunded');
  });

  it('patient <2h before → cancelled_no_refund, no refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'u1', slotStart: future(60) });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'cancelled_no_refund' }));
    expect(refund.initiateRefund).not.toHaveBeenCalled();
    expect(out.state).toBe('cancelled_no_refund');
  });

  it('doctor cancel → doctor_cancelled + refund (reason required)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', doctorId: 'd1', patientUserId: 'u1', slotStart: future(30) });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    const out = await cancel({ appointmentId: 'a1', actorType: 'doctor', actorId: 'docUser', reason: 'sick' });
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'doctor_cancelled', reason: 'sick' }));
    expect(refund.initiateRefund).toHaveBeenCalled();
    expect(out.state).toBe('doctor_cancelled');
  });

  it('doctor cancel without a reason → 400', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', doctorId: 'd1', slotStart: future(30) });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(cancel({ appointmentId: 'a1', actorType: 'doctor', actorId: 'docUser' }))
      .rejects.toMatchObject({ status: 400 });
  });

  it('patient cancelling someone else’s appointment → 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'other', slotStart: future(180) });
    await expect(cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('cancelling a non-confirmed appointment → 409', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked', patientUserId: 'u1', slotStart: future(180) });
    await expect(cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cancellation.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/cancellation.service.js`:

```js
// @ts-check
import { prisma } from '../lib/prisma.js';
import { AppError } from '../http/AppError.js';
import { logger } from '../lib/logger.js';
import { emailProvider } from '../integrations/email/index.js';
import * as appointmentState from './appointmentState.service.js';
import * as refund from './refund.service.js';

const FREE_CANCEL_MS = 2 * 60 * 60 * 1000;

/**
 * @param {{ appointmentId: string, actorType: 'patient'|'doctor', actorId: string, reason?: string }} args
 */
export async function cancel({ appointmentId, actorType, actorId, reason }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);

  if (actorType === 'patient' && appt.patientUserId !== actorId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404); // 404, not 403 (no existence leak)
  }
  if (actorType === 'doctor') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actorId }, select: { id: true } });
    if (!doctor || doctor.id !== appt.doctorId) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'confirmed') {
    throw new AppError('INVALID_TRANSITION', 'Only confirmed appointments can be cancelled.', 409);
  }

  if (actorType === 'doctor') {
    if (!reason) throw new AppError('VALIDATION_FAILED', 'A cancellation reason is required.', 400);
    await appointmentState.transition({ appointmentId, to: 'doctor_cancelled', actorType: 'doctor', actorId, reason });
    await refund.initiateRefund({ appointmentId });
    await sendApology(appt, 'cancellation_apology');
    return { state: 'doctor_cancelled' };
  }

  const refundable = appt.slotStart.getTime() - Date.now() >= FREE_CANCEL_MS;
  if (refundable) {
    await appointmentState.transition({ appointmentId, to: 'cancelled_refunded', actorType: 'patient', actorId });
    await refund.initiateRefund({ appointmentId });
    await sendApology(appt, 'refund_confirmation');
    return { state: 'cancelled_refunded' };
  }
  await appointmentState.transition({ appointmentId, to: 'cancelled_no_refund', actorType: 'patient', actorId });
  return { state: 'cancelled_no_refund' };
}

async function sendApology(appt, template) {
  try {
    const patient = await prisma.user.findUnique({ where: { id: appt.patientUserId }, select: { email: true, fullName: true } });
    await emailProvider.send({ template, to: patient.email, vars: { patientName: patient.fullName, appointmentRef: appt.id } });
  } catch {
    logger.warn('cancellation email not sent', { appointmentId: appt.id, template });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cancellation.service`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/cancellation.service.js server/src/services/cancellation.service.test.js
git commit -m "feat(slice-c): cancellation.service patient + doctor cancel with refund"
```

---

### Task 1.9: `appointment.service` — role-scoped list + detail (+ refund quote)

**Files:**
- Create: `server/src/services/appointment.service.js`
- Create: `server/src/services/appointment.service.test.js`

- [ ] **Step 1: Write the failing test** — `server/src/services/appointment.service.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findMany: vi.fn(), findUnique: vi.fn() }, doctor: { findUnique: vi.fn() } },
}));
vi.mock('./refund.service.js', () => ({ quoteRefund: vi.fn() }));

import { prisma } from '../lib/prisma.js';
import { quoteRefund } from './refund.service.js';
import { listForRole, getForRole } from './appointment.service.js';

beforeEach(() => vi.clearAllMocks());

describe('appointment.listForRole', () => {
  it('patient list returns upcoming rows with doctor card fields, no PII leak', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a1', slotStart: new Date('2099-01-04T13:00:00Z'), slotEnd: new Date('2099-01-04T13:30:00Z'), state: 'confirmed', feeAtBooking: 250000, forSelf: true, subjectName: null,
        doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } } },
    ]);
    const out = await listForRole({ role: 'patient', userId: 'u1' });
    expect(out[0]).toEqual({
      id: 'a1', slotStart: '2099-01-04T13:00:00.000Z', slotEnd: '2099-01-04T13:30:00.000Z',
      state: 'confirmed', feeAtBooking: 250000, forSelf: true, subjectName: null,
      doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null,
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { patientUserId: 'u1', state: { in: ['confirmed', 'in_progress'] } },
    }));
  });
});

describe('appointment.getForRole', () => {
  it('returns a confirmed appointment detail with a refundQuote for the owner', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1', state: 'confirmed', slotStart: new Date('2099-01-04T13:00:00Z'), slotEnd: new Date('2099-01-04T13:30:00Z'), feeAtBooking: 250000, forSelf: true, subjectName: null, doctorId: 'd1' });
    quoteRefund.mockResolvedValue({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
    const out = await getForRole({ id: 'a1', role: 'patient', userId: 'u1' });
    expect(out.refundQuote).toEqual({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
  });

  it('hides another patient’s appointment as 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'other', state: 'confirmed' });
    await expect(getForRole({ id: 'a1', role: 'patient', userId: 'u1' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- appointment.service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `server/src/services/appointment.service.js`:

```js
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

export async function listForRole({ role, userId }) {
  if (role === 'patient') {
    const rows = await prisma.appointment.findMany({
      where: { patientUserId: userId, state: { in: UPCOMING } },
      orderBy: { slotStart: 'asc' },
      include: { doctor: { select: { id: true, specialization: true, photoUrl: true, user: { select: { fullName: true } } } } },
    });
    return rows.map(toPatientRow);
  }
  const doctor = await prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
  if (!doctor) return [];
  const rows = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, state: { in: UPCOMING } },
    orderBy: { slotStart: 'asc' },
  });
  return rows.map((a) => ({
    id: a.id,
    slotStart: a.slotStart.toISOString(),
    slotEnd: a.slotEnd.toISOString(),
    state: a.state,
    forSelf: a.forSelf,
    subjectName: a.subjectName,
  }));
}

export async function getForRole({ id, role, userId }) {
  const a = await prisma.appointment.findUnique({
    where: { id },
    include: { doctor: { select: { id: true, specialization: true, photoUrl: true, user: { select: { fullName: true } } } } },
  });
  const visible =
    a &&
    ((role === 'patient' && a.patientUserId === userId) ||
      (role === 'doctor' && a.doctor && (await prisma.doctor.findUnique({ where: { userId }, select: { id: true } }))?.id === a.doctorId) ||
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
  if (a.state === 'confirmed') {
    detail.refundQuote = await quoteRefund(id).catch(() => null);
  }
  return detail;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- appointment.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/appointment.service.js server/src/services/appointment.service.test.js
git commit -m "feat(slice-c): appointment.service role-scoped list + detail with refund quote"
```

---

## Phase 2 — HTTP layer

### Task 2.1: appointments controller + routes (lock, pay, list, detail, cancel)

**Files:**
- Create: `server/src/controllers/appointment.controller.js`
- Create: `server/src/routes/appointments.js`

- [ ] **Step 1: Implement the controller** — `server/src/controllers/appointment.controller.js`:

```js
// @ts-check
import * as bookingService from '../services/booking.service.js';
import * as paymentService from '../services/payment.service.js';
import * as appointmentService from '../services/appointment.service.js';
import * as cancellationService from '../services/cancellation.service.js';

export async function lock(req, res, next) {
  try {
    const appt = await bookingService.lockSlot({ patientUserId: req.session.userId, ...req.body });
    res.status(201).json({ id: appt.id });
  } catch (e) {
    next(e);
  }
}

export async function pay(req, res, next) {
  try {
    res.json(await paymentService.createIntent({ patientUserId: req.session.userId, appointmentId: req.params.id }));
  } catch (e) {
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    res.json({ data: await appointmentService.listForRole({ role: req.session.role, userId: req.session.userId }) });
  } catch (e) {
    next(e);
  }
}

export async function detail(req, res, next) {
  try {
    res.json(await appointmentService.getForRole({ id: req.params.id, role: req.session.role, userId: req.session.userId }));
  } catch (e) {
    next(e);
  }
}

export async function cancel(req, res, next) {
  try {
    res.json(await cancellationService.cancel({
      appointmentId: req.params.id,
      actorType: req.session.role,
      actorId: req.session.userId,
      reason: req.body.reason,
    }));
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 2: Implement the routes** — `server/src/routes/appointments.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from '../controllers/appointment.controller.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { makeRateLimiter } from '../middleware/rateLimit.js';
import { lockSchema, cancelSchema } from '../../../shared/schemas/index.js';
import { PAYMENT_INTENT_MAX_PER_PATIENT_HOUR } from '../config/constants.js';

const payLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: PAYMENT_INTENT_MAX_PER_PATIENT_HOUR,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const appointmentsRouter = Router();
appointmentsRouter.post('/lock', requireRole('patient'), validate(lockSchema), c.lock);
appointmentsRouter.post('/:id/pay', requireRole('patient'), payLimiter, c.pay);
appointmentsRouter.get('/', requireRole('patient', 'doctor'), c.list);
appointmentsRouter.get('/:id', requireRole('patient', 'doctor', 'admin'), c.detail);
appointmentsRouter.post('/:id/cancel', requireRole('patient', 'doctor'), validate(cancelSchema), c.cancel);
```

- [ ] **Step 3: Commit** (routes are wired + integration-tested in Task 2.4/2.5)

```bash
git add server/src/controllers/appointment.controller.js server/src/routes/appointments.js
git commit -m "feat(slice-c): appointments controller + routes"
```

---

### Task 2.2: PayFast webhook controller + route

**Files:**
- Create: `server/src/controllers/webhook.controller.js`
- Create: `server/src/routes/webhooks.js`

- [ ] **Step 1: Implement the controller** — `server/src/controllers/webhook.controller.js`:

```js
// @ts-check
import { paymentProvider } from '../integrations/payment/index.js';
import * as paymentService from '../services/payment.service.js';
import * as audit from '../services/audit.service.js';
import { AppError } from '../http/AppError.js';
import { logger } from '../lib/logger.js';

export async function payfast(req, res, next) {
  let result;
  try {
    result = paymentProvider.verifyWebhook(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('payfast webhook signature rejected');
    await audit.record({ eventType: 'payment.webhook_rejected', actorType: 'system', reason: 'bad signature' }).catch(() => {});
    return next(e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Webhook rejected.', 401));
  }
  try {
    await paymentService.processWebhook(result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 2: Implement the route** — `server/src/routes/webhooks.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from '../controllers/webhook.controller.js';

export const webhooksRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
webhooksRouter.post('/payfast', c.payfast);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/controllers/webhook.controller.js server/src/routes/webhooks.js
git commit -m "feat(slice-c): payfast webhook controller + route (signature-verified)"
```

---

### Task 2.3: Dev checkout routes (mock hosted page + complete)

**Files:**
- Create: `server/src/routes/devCheckout.js`

- [ ] **Step 1: Implement** — `server/src/routes/devCheckout.js`:

```js
// @ts-check
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { paymentProvider } from '../integrations/payment/index.js';
import { buildSignedIpn } from '../integrations/payment/payfast.mock.js';
import * as paymentService from '../services/payment.service.js';

/**
 * Dev-only simulated PayFast hosted checkout. Mounted ONLY when PAYMENT_PROVIDER=mock.
 * The "Pay"/"Fail" actions build a REAL signed IPN and run it through the same
 * verifyWebhook + processWebhook path as production.
 */
export const devCheckoutRouter = Router();

devCheckoutRouter.get('/checkout', (req, res) => {
  const ref = String(req.query.ref ?? '');
  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Dev Checkout</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:64px auto">
  <h1>Mock PayFast checkout</h1>
  <p>Simulated hosted page — not the real gateway.</p>
  <form method="POST" action="/dev/payment/complete">
    <input type="hidden" name="ref" value="${ref}" />
    <button name="outcome" value="success">Pay</button>
    <button name="outcome" value="failed">Fail</button>
  </form>
</body></html>`);
});

devCheckoutRouter.post('/payment/complete', express_urlencoded_or_json, async (req, res, next) => {
  try {
    const { ref, outcome } = req.body;
    const payment = await prisma.payment.findFirst({ where: { providerRef: ref } });
    if (!payment) return res.status(404).send('Unknown payment ref');
    // Mock gateway reports a 2.5% fee on success.
    const gatewayFee = outcome === 'success' ? Math.round(payment.amount * 0.025) : null;
    const ipn = buildSignedIpn({
      event: outcome === 'success' ? 'payment.success' : 'payment.failed',
      providerRef: ref,
      intentKey: `${payment.patientUserId}:${payment.slotStart.toISOString()}`,
      amount: payment.amount,
      gatewayFee,
    });
    const result = paymentProvider.verifyWebhook({ body: ipn }); // real signature verification
    await paymentService.processWebhook(result);
    res.redirect(`${env.APP_BASE_URL}/pay/return?appt=${payment.appointmentId}`);
  } catch (e) {
    next(e);
  }
});

// The form posts urlencoded; accept both urlencoded and json on this dev route only.
function express_urlencoded_or_json(req, res, next) {
  if (req.is('application/x-www-form-urlencoded')) return Router().use(expressUrlencoded)(req, res, next);
  next();
}
```

> **Implementer note:** simplify the body parsing — import `express` at the top and use `express.urlencoded({ extended: false })` directly as route middleware instead of the helper. Replace the `express_urlencoded_or_json` placeholder with:
> ```js
> import express from 'express';
> // ...
> devCheckoutRouter.post('/payment/complete', express.urlencoded({ extended: false }), async (req, res, next) => { ... });
> ```
> Delete the `express_urlencoded_or_json` function. (The handler body above is correct as written.)

- [ ] **Step 2: Commit** (wired + exercised in Task 2.4/2.5)

```bash
git add server/src/routes/devCheckout.js
git commit -m "feat(slice-c): dev-only mock checkout routes (env-guarded mount in 2.4)"
```

---

### Task 2.4: Wire routers in `index.js` (dev routes env-guarded)

**Files:**
- Modify: `server/src/index.js`

- [ ] **Step 1: Implement** — add imports near the other route imports:

```js
import { appointmentsRouter } from './routes/appointments.js';
import { webhooksRouter } from './routes/webhooks.js';
```

- [ ] **Step 2:** Register the API routers (after the `availabilityRouter` line, before `healthRouter`):

```js
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/webhooks', webhooksRouter);
```

- [ ] **Step 3:** Mount the dev checkout routes **before** the static SPA block, guarded by the provider switch:

```js
  // Dev-only simulated payment gateway. NEVER mounted in production.
  if (env.PAYMENT_PROVIDER === 'mock') {
    const { devCheckoutRouter } = await import('./routes/devCheckout.js');
    app.use('/dev', devCheckoutRouter);
  }
```

> **Implementer note:** `createApp` must become `async` for the dynamic `import`, OR import `devCheckoutRouter` statically at the top and mount it conditionally (no `await`). Prefer the static import to keep `createApp` synchronous (tests call `createApp()` directly):
> ```js
> import { devCheckoutRouter } from './routes/devCheckout.js';
> // ...inside createApp, before express.static:
> if (env.PAYMENT_PROVIDER === 'mock') app.use('/dev', devCheckoutRouter);
> ```

- [ ] **Step 4: Run the full server suite**

Run: `npm test`
Expected: PASS (all prior + new unit suites; integration added next).

- [ ] **Step 5: Commit**

```bash
git add server/src/index.js
git commit -m "feat(slice-c): wire appointments + webhooks routers; env-guarded dev checkout"
```

---

### Task 2.5: Integration test — full booking→pay→confirm→cancel→refund (real DB)

**Files:**
- Create: `server/src/test/booking.integration.test.js`

**Precondition:** the test process must run with `PAYMENT_PROVIDER=mock` and `EMAIL_PROVIDER=console`. Add a test setup that sets these before importing the app (see Step 1), or set them in the test script env. The test signs in a real patient via `request.agent`.

- [ ] **Step 1: Write the test** — `server/src/test/booking.integration.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma.js');
const { buildSignedIpn } = await import('../integrations/payment/payfast.mock.js');
const { formatInTimeZone } = await import('date-fns-tz');

const app = createApp();
const uniq = () => `slicec_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

// Pick a near-future seeded slot (seed doctors have Mon/Wed/Fri 18:00–21:00 Karachi).
async function pickSlot(doctorId) {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const date = formatInTimeZone(d, 'Asia/Karachi', 'yyyy-MM-dd');
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date });
    if (res.body.data?.length) return res.body.data[0].slotStart;
  }
  throw new Error('no slot found');
}

describe('booking + payment integration', () => {
  let agent, email, doctorId, slotStart, appointmentId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({ where: { isActive: true, status: 'active' } });
    doctorId = d.id;
    slotStart = await pickSlot(doctorId);
    email = uniq();
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({ fullName: 'Booker', email, phone: '03001234567', password: 'password1', tosAccepted: true });
  });

  it('locks a slot', async () => {
    const res = await agent.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201);
    appointmentId = res.body.id;
  });

  it('a second lock on the same slot fails with SLOT_TAKEN', async () => {
    const email2 = uniq();
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/signup').send({ fullName: 'B2', email: email2, phone: '03001234567', password: 'password1', tosAccepted: true });
    const res = await agent2.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');
    await prisma.user.deleteMany({ where: { email: email2 } });
  });

  it('creates a pay intent then confirms via a signed webhook', async () => {
    const pay = await agent.post(`/api/appointments/${appointmentId}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.redirectUrl).toContain('/dev/checkout?ref=');
    const payment = await prisma.payment.findFirst({ where: { appointmentId } });
    const ipn = buildSignedIpn({ event: 'payment.success', providerRef: payment.providerRef, intentKey: `x`, amount: payment.amount, gatewayFee: 5000 });
    const wh = await request(app).post('/api/webhooks/payfast').send(ipn);
    expect(wh.status).toBe(200);
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('confirmed');
    expect(appt.feeAtBooking).toBe(payment.amount);
  });

  it('rejects a webhook with a bad signature (401)', async () => {
    const res = await request(app).post('/api/webhooks/payfast').send({ event: 'payment.success', providerRef: 'x', signature: 'bad' });
    expect(res.status).toBe(401);
  });

  it('shows the appointment in the patient upcoming list', async () => {
    const res = await agent.get('/api/appointments');
    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.id === appointmentId && a.state === 'confirmed')).toBe(true);
  });

  it('cancels ≥2h before → cancelled_refunded with a refund recorded', async () => {
    // The seeded slot is days away, so this is always ≥2h.
    const res = await agent.post(`/api/appointments/${appointmentId}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('cancelled_refunded');
    const payment = await prisma.payment.findFirst({ where: { appointmentId } });
    expect(payment.refundStatus).toBe('settled');
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
```

> **Implementer note:** Vitest supports top-level `await` in ESM test files; if the runner config disallows it, move the dynamic imports into `beforeAll`. Confirm the existing `vitest.config` doesn't reset `process.env` between files; the env vars are set at module load. If env must be set globally, add them to the test script in `server/package.json` instead.

- [ ] **Step 2: Run the integration test**

Run: `npm test -- booking.integration`
Expected: PASS (all cases). Requires the dev DB running + seeded (`npm run seed` or equivalent — confirm the seeded doctors exist).

- [ ] **Step 3: Run the whole server suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add server/src/test/booking.integration.test.js
git commit -m "test(slice-c): booking→pay→confirm→cancel→refund integration"
```

---

## Phase 3 — Frontend (patient)

### Task 3.1: `CancelModal` component (P-10)

**Files:**
- Create: `client/src/components/CancelModal.jsx`
- Create: `client/src/components/CancelModal.test.jsx`

- [ ] **Step 1: Write the failing test** — `client/src/components/CancelModal.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CancelModal } from './CancelModal.jsx';

beforeEach(() => vi.clearAllMocks());

describe('P-10 CancelModal', () => {
  it('shows the refund breakdown when a quote is provided (≥2h)', () => {
    render(<CancelModal quote={{ amountPaid: 250000, gatewayFee: 6000, refund: 244000 }} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Rs 2,440')).toBeTruthy();
    expect(screen.getByText(/excludes the payment-gateway fee/i)).toBeTruthy();
  });

  it('shows the no-refund warning when no quote (<2h handled by absence)', () => {
    render(<CancelModal quote={null} lateNoRefund onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByText(/no refund/i)).toBeTruthy();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<CancelModal quote={{ amountPaid: 250000, gatewayFee: 6000, refund: 244000 }} onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- CancelModal`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `client/src/components/CancelModal.jsx`:

```jsx
// @ts-check
import { formatPkr } from '../lib/format.js';

export function CancelModal({ quote, lateNoRefund = false, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal--danger">
        <h2>Cancel appointment?</h2>
        {quote && !lateNoRefund ? (
          <>
            <p>Paid: {formatPkr(quote.amountPaid)}</p>
            <p>Gateway fee: −{formatPkr(quote.gatewayFee)}</p>
            <p>
              <strong>Refund: {formatPkr(quote.refund)}</strong>
            </p>
            <p className="help">Refund excludes the payment-gateway fee charged at booking.</p>
          </>
        ) : (
          <p className="help">No refund available for late cancellations — the slot stays blocked.</p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Keep appointment
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            {quote && !lateNoRefund ? 'Cancel & refund' : 'Cancel anyway'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- CancelModal`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CancelModal.jsx client/src/components/CancelModal.test.jsx
git commit -m "feat(slice-c): P-10 cancel modal component"
```

---

### Task 3.2: `Booking` view (P-06)

**Files:**
- Create: `client/src/views/Booking.jsx`
- Create: `client/src/views/Booking.test.jsx`

- [ ] **Step 1: Write the failing test** — `client/src/views/Booking.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Booking } from './Booking.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

const slot = '2099-01-04T13:00:00.000Z';
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/book/d1?slot=${encodeURIComponent(slot)}`]}>
        <Routes>
          <Route path="/book/:id" element={<Booking />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null });
  // jsdom has no navigation; stub it.
  delete window.location;
  window.location = { href: '' };
});

describe('P-06 Booking', () => {
  it('locks then pays and redirects to the checkout URL on confirm', async () => {
    api.post
      .mockResolvedValueOnce({ id: 'a1' }) // lock
      .mockResolvedValueOnce({ redirectUrl: '/dev/checkout?ref=mock_1' }); // pay
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /confirm & pay/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/lock', { doctorId: 'd1', slotStart: slot, forSelf: true }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/pay'));
    await waitFor(() => expect(window.location.href).toBe('/dev/checkout?ref=mock_1'));
  });

  it('requires subject fields when booking for someone else', async () => {
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/someone else/i));
    expect(screen.getByLabelText(/patient name/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- Booking`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `client/src/views/Booking.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../lib/format.js';

export function Booking() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const slotStart = params.get('slot');
  const [forSelf, setForSelf] = useState(true);
  const [subject, setSubject] = useState({ name: '', age: '', relation: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const doctor = useQuery({ queryKey: ['doctor', id], queryFn: () => api.get(`/doctors/${id}`) });

  async function confirmAndPay() {
    setError(null);
    setBusy(true);
    try {
      const body = { doctorId: id, slotStart, forSelf };
      if (!forSelf) body.subject = { name: subject.name, age: Number(subject.age), relation: subject.relation };
      const appt = await api.post('/appointments/lock', body);
      const { redirectUrl } = await api.post(`/appointments/${appt.id}/pay`);
      window.location.href = redirectUrl;
    } catch (e) {
      setError(e.message ?? 'Could not start payment.');
      setBusy(false);
    }
  }

  return (
    <PatientLayout>
      {doctor.data && (
        <section className="section-card">
          <h1>{doctor.data.fullName}</h1>
          <p className="doc-card__spec">{doctor.data.specialization}</p>
          <p>Slot: {formatKarachi(slotStart)}</p>
          <p className="doc-card__fee">{formatPkr(doctor.data.fee)}</p>
        </section>
      )}
      <section className="section-card">
        <h2>Who is this consultation for?</h2>
        <label>
          <input type="radio" name="who" checked={forSelf} onChange={() => setForSelf(true)} /> Myself
        </label>
        <label>
          <input type="radio" name="who" checked={!forSelf} onChange={() => setForSelf(false)} /> Someone else
        </label>
        {!forSelf && (
          <div>
            <label>
              Patient name
              <input value={subject.name} onChange={(e) => setSubject({ ...subject, name: e.target.value })} />
            </label>
            <label>
              Age
              <input type="number" value={subject.age} onChange={(e) => setSubject({ ...subject, age: e.target.value })} />
            </label>
            <label>
              Relation
              <input value={subject.relation} onChange={(e) => setSubject({ ...subject, relation: e.target.value })} />
            </label>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn--primary" disabled={busy || !slotStart} onClick={confirmAndPay}>
          Confirm & Pay
        </button>
      </section>
    </PatientLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- Booking`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/Booking.jsx client/src/views/Booking.test.jsx
git commit -m "feat(slice-c): P-06 booking view (slot + who-for + confirm/pay)"
```

---

### Task 3.3: `PaymentReturn` view (P-07)

**Files:**
- Create: `client/src/views/PaymentReturn.jsx`
- Create: `client/src/views/PaymentReturn.test.jsx`

- [ ] **Step 1: Write the failing test** — `client/src/views/PaymentReturn.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaymentReturn } from './PaymentReturn.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pay/return?appt=a1']}>
        <Routes>
          <Route path="/pay/return" element={<PaymentReturn />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-07 PaymentReturn', () => {
  it('shows Confirmed when the appointment is confirmed', async () => {
    api.get.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    setup();
    await waitFor(() => expect(screen.getByText(/confirmed/i)).toBeTruthy());
  });

  it('shows a failure message when the appointment is gone (404)', async () => {
    api.get.mockRejectedValue({ status: 404 });
    setup();
    await waitFor(() => expect(screen.getByText(/payment did not complete/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- PaymentReturn`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `client/src/views/PaymentReturn.jsx`:

```jsx
// @ts-check
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';

export function PaymentReturn() {
  const [params] = useSearchParams();
  const apptId = params.get('appt');
  const q = useQuery({
    queryKey: ['appointment', apptId],
    queryFn: () => api.get(`/appointments/${apptId}`),
    refetchInterval: (query) => (query.state.data?.state === 'confirmed' ? false : 2000),
    retry: false,
  });

  return (
    <PatientLayout>
      <section className="section-card status-card">
        {q.data?.state === 'confirmed' && (
          <>
            <h1>Booking confirmed</h1>
            <Link className="btn btn--primary" to="/appointments">
              View my appointments
            </Link>
          </>
        )}
        {q.isError && (
          <>
            <h1>Payment did not complete</h1>
            <Link className="btn btn--secondary" to="/">
              Back to doctors
            </Link>
          </>
        )}
        {!q.data && !q.isError && <p className="help">Confirming your payment…</p>}
        {q.data && q.data.state !== 'confirmed' && <p className="help">Awaiting payment confirmation…</p>}
      </section>
    </PatientLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- PaymentReturn`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/PaymentReturn.jsx client/src/views/PaymentReturn.test.jsx
git commit -m "feat(slice-c): P-07 payment return view (polls appointment state)"
```

---

### Task 3.4: `Upcoming` dashboard view (P-08) + cancel wiring

**Files:**
- Create: `client/src/views/Upcoming.jsx`
- Create: `client/src/views/Upcoming.test.jsx`

- [ ] **Step 1: Write the failing test** — `client/src/views/Upcoming.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Upcoming } from './Upcoming.jsx';
import { api } from '../lib/apiClient.js';

vi.mock('../lib/apiClient.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../lib/session.jsx', () => ({ useSession: () => ({ session: { role: 'patient' } }) }));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Upcoming />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('P-08 Upcoming', () => {
  it('renders the empty state when there are no appointments', async () => {
    api.get.mockResolvedValue({ data: [] });
    setup();
    await waitFor(() => expect(screen.getByText(/no upcoming appointments/i)).toBeTruthy());
  });

  it('lists a confirmed appointment with a Cancel control', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/appointments')
        return Promise.resolve({ data: [{ id: 'a1', slotStart: '2099-01-04T13:00:00.000Z', slotEnd: '2099-01-04T13:30:00.000Z', state: 'confirmed', feeAtBooking: 250000, forSelf: true, subjectName: null, doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null }] });
      return Promise.resolve({ id: 'a1', state: 'confirmed', refundQuote: { amountPaid: 250000, gatewayFee: 6000, refund: 244000 } });
    });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
  });

  it('opens the cancel modal and posts the cancel on confirm', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/appointments')
        return Promise.resolve({ data: [{ id: 'a1', slotStart: '2099-01-04T13:00:00.000Z', slotEnd: '2099-01-04T13:30:00.000Z', state: 'confirmed', feeAtBooking: 250000, forSelf: true, subjectName: null, doctorName: 'Dr A', specialization: 'Acne', doctorPhotoUrl: null }] });
      return Promise.resolve({ id: 'a1', state: 'confirmed', refundQuote: { amountPaid: 250000, gatewayFee: 6000, refund: 244000 } });
    });
    api.post.mockResolvedValue({ state: 'cancelled_refunded' });
    setup();
    await waitFor(() => expect(screen.getByText('Dr A')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.getByText('Rs 2,440')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /cancel & refund/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/appointments/a1/cancel', {}));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace client test -- Upcoming`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `client/src/views/Upcoming.jsx`:

```jsx
// @ts-check
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient.js';
import { PatientLayout } from '../layouts/PatientLayout.jsx';
import { formatPkr, formatKarachi } from '../lib/format.js';
import { CancelModal } from '../components/CancelModal.jsx';

export function Upcoming() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['appointments'], queryFn: () => api.get('/appointments') });
  const [cancelId, setCancelId] = useState(null);

  const detail = useQuery({
    queryKey: ['appointment', cancelId],
    queryFn: () => api.get(`/appointments/${cancelId}`),
    enabled: !!cancelId,
  });

  const cancelMut = useMutation({
    mutationFn: (id) => api.post(`/appointments/${id}/cancel`, {}),
    onSuccess: () => {
      setCancelId(null);
      qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  const rows = list.data?.data ?? [];

  return (
    <PatientLayout>
      <section className="section-card">
        <h1>Upcoming appointments</h1>
        {list.isPending && <p className="help">Loading…</p>}
        {list.data && rows.length === 0 && (
          <div className="empty-state">
            <p>No upcoming appointments.</p>
            <Link className="btn btn--primary" to="/">
              Browse doctors
            </Link>
          </div>
        )}
        {rows.map((a) => (
          <div key={a.id} className="appt-row">
            <strong>{a.doctorName}</strong> — {a.specialization}
            <div>{formatKarachi(a.slotStart)}</div>
            {!a.forSelf && <div>for: {a.subjectName}</div>}
            <div>{formatPkr(a.feeAtBooking)}</div>
            <button type="button" className="btn btn--secondary" disabled>
              Join Call
            </button>
            {a.state === 'confirmed' && (
              <button type="button" className="btn btn--ghost" onClick={() => setCancelId(a.id)}>
                Cancel
              </button>
            )}
          </div>
        ))}
      </section>
      {cancelId && detail.data && (
        <CancelModal
          quote={detail.data.refundQuote}
          onClose={() => setCancelId(null)}
          onConfirm={() => cancelMut.mutate(cancelId)}
        />
      )}
    </PatientLayout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace client test -- Upcoming`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add client/src/views/Upcoming.jsx client/src/views/Upcoming.test.jsx
git commit -m "feat(slice-c): P-08 upcoming dashboard with cancel flow"
```

---

### Task 3.5: Wire client routes

**Files:**
- Modify: `client/src/routes.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add imports + routes** in `client/src/routes.jsx`:

```js
import { Booking } from './views/Booking.jsx';
import { PaymentReturn } from './views/PaymentReturn.jsx';
```

Add to the `routes` array:

```js
  { path: '/book/:id', element: <Booking /> },
  { path: '/pay/return', element: <PaymentReturn /> },
```

- [ ] **Step 2: Add the patient-scoped Upcoming route** in `client/src/App.jsx` — import and add a `RoleRoute`:

```js
import { Upcoming } from './views/Upcoming.jsx';
// ...inside <Routes>, alongside the doctor availability RoleRoute:
      <Route
        path="/appointments"
        element={
          <RoleRoute session={session} role="patient">
            <Upcoming />
          </RoleRoute>
        }
      />
```

- [ ] **Step 3: Run the whole client suite + build**

Run: `npm --workspace client test`
Expected: PASS (all suites). Then: `npm --workspace client run build` — Expected: clean build, no unresolved imports.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes.jsx client/src/App.jsx
git commit -m "feat(slice-c): wire /book/:id, /pay/return, /appointments routes"
```

---

## Phase 4 — Docs & normalization

### Task 4.1: Canonical doc-suite updates (only after user approval)

> The controller must get the user's approval of this list before editing canon (CLAUDE.md governance). Apply with the surgical-edit rule + revision footers + version bumps (doc 00 §4/§6).

- [ ] **11 — ADR:** add **ADR-22** (dev mock gateway with real signed IPN) and **ADR-23** (lazy lock-expiry, no background worker); bump version + footer.
- [ ] **15 — Config:** add `PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, and the reuse of `PAYFAST_PASSPHRASE` for mock signing; note dev-only mount. Cascade: **08** (mock passphrase is a dev secret; `/dev/*` disabled in prod), **10** (deploy: `PAYMENT_PROVIDER=stub` + no `/dev` mount in prod).
- [ ] **14 — Integration:** note `payfast.mock` + the dev `/dev/checkout` flow as the dev implementation of the `PaymentProvider` typedef.
- [ ] **05 — API:** add error codes `SLOT_NOT_BOOKABLE`, `ACTIVE_LOCK_EXISTS`, `OVERLAP`, `INVALID_TRANSITION`; note `/dev/*` is dev-only and non-canonical.
- [ ] **13 — Status:** mark F03/F04/F06 + the booking/payment module progress.
- [ ] **04 / 12:** confirm no schema change; confirm existing F03/F04/F06 test-case IDs cover the new suites (add TC rows only if a behavior is uncovered).
- [ ] **Commit** the doc edits in one commit: `docs(slice-c): canon updates (ADR-22/23, config, integration, API codes, status)`.

---

### Task 4.2: Final verification + Prettier

- [ ] **Step 1: Prettier** the slice files:

Run: `npx prettier --write "server/src/**/*.js" "client/src/**/*.{js,jsx}" "shared/**/*.js"`

- [ ] **Step 2: Full server suite**

Run: `npm test`
Expected: PASS (M0 + Slice A + Slice B + Slice C suites green).

- [ ] **Step 3: Full client suite + build**

Run: `npm --workspace client test` then `npm --workspace client run build`
Expected: PASS + clean build.

- [ ] **Step 4: Update the session changelog** (`agentChangeLogs/2026-06-03-1905-slice-c-booking-payment.md`): fill in Verification (suite counts), flip Status to reflect the build, list the file table. Update `agentChangeLogs/index.md` summary if needed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(slice-c): prettier + changelog verification sweep"
```

- [ ] **Step 6:** Hand off via superpowers:finishing-a-development-branch (merge/PR decision with the user).

---

## Self-review (plan vs spec)

**Spec coverage check:**
- F03 slot lock + who-for → Task 1.5 (lockSlot, single-lock, no-overlap, reclaim), 1.1 (DTO), 2.1 (route). ✅
- F04 intent idempotency + checkout + signed webhook + atomic commit + fee snapshot → Tasks 0.3 (mock + verifyWebhook), 1.7 (createIntent/processWebhook), 2.2 (webhook route), 2.3 (dev checkout). ✅
- F06 cancel (patient ≥2h/<2h, doctor) + net-of-fee refund + quote parity → Tasks 1.6 (refund/quote), 1.8 (cancel), 3.1/3.4 (UI). ✅
- Lazy expiry (ADR-23) → Task 1.4 + reclaim in 1.5. ✅
- Emails best-effort post-commit → Tasks 0.2 (adapter), used in 1.7/1.8. ✅
- Single transition writer → Task 1.3 (used by 1.7/1.8). ✅
- Screens P-06/P-07/P-08/P-10 → Tasks 3.2/3.3/3.4/3.1. ✅
- Dev gate (no prod mount) → Task 2.4 env guard + integration assertion of 401 bad-sig in 2.5. ✅
- No schema change → confirmed; no migration task. ✅
- Doc-suite updates → Task 4.1 (gated on approval). ✅

**Type/name consistency:** `lockSlot`, `createIntent`, `processWebhook`, `quoteRefund`, `initiateRefund`, `cancel`, `transition`, `listForRole`, `getForRole`, `buildSignedIpn`, `signParams`, `payfastMock`, `consoleEmail` are used consistently across tasks. The `intent_key` compound-unique name matches `schema.prisma`. The webhook `WebhookResult` shape (`event/providerRef/intentKey/amount/gatewayFee`) matches doc 14 and is produced by `buildSignedIpn`/`verifyWebhook` and consumed by `processWebhook`. ✅

**Placeholder scan:** the only deliberate "note" is the `express.urlencoded` simplification in Task 2.3 and the env-setup note in 2.5 — both give exact drop-in code. No `TBD`/`TODO`/vague steps. ✅
