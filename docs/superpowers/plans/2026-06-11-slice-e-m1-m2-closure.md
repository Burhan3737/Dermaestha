# Slice E — M1/M2 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete M1/M2 against the spec: notification outbox + dispatch worker (F07), refund-retry worker (F06.03), reconciliation worker (F04.03), the still-open fidelity fixes (G2-booking, G3, G4), and a real Resend adapter with key-based console fallback.

**Architecture:** One new `notification_jobs` outbox table backs all appointment emails; event emails are enqueued inside the caller's `$transaction` (vars snapshotted as JSON at enqueue), a minute-cron dispatcher delivers with state re-check + exponential backoff, and two money workers (refund retry, hourly reconciliation) close the F06/F04 safety nets. Workers stay in-process `node-cron` drivers over pure clock-injected service functions (ADR-08/25 pattern). `appointmentState.transition` remains the only `Appointment.state` writer.

**Tech Stack:** Node 20 ESM + Express, Prisma 6 (PostgreSQL), node-cron, Vitest (unit: mocked Prisma in module-local `test.js`; integration: real DB in `server/src/test/`), Zod env, JSDoc typedefs for adapters.

**Spec:** `docs/superpowers/specs/2026-06-11-slice-e-m1-m2-closure-design.md`

---

## Reality check vs the design doc (verified 2026-06-11 in source)

The 2026-06-09 gap-fix session already landed some of the design's §6 items. This plan covers ONLY what is still open:

| Design item | Code reality | In this plan? |
|---|---|---|
| G1 visibility (`refundStatus` on failure) | DONE — `initiateRefund` catch sets `refundStatus:'failed'` (`server/src/modules/appointment/service.js:295-303`) | Only the retry semantics change (Task 7) |
| G2 route half (slots 404 for inactive) | DONE — `slots` controller gates via `getPublicDoctor` (`server/src/modules/doctor/controller.js:22-31`) | No |
| G2 booking half (`lockSlot` active check) | OPEN — `lockSlot` calls `generateSlots` with no active-doctor guard | Task 10 |
| G3 (doctor "today" scope) | OPEN | Task 11 |
| G4 (forgot-password timing) | OPEN | Task 12 |
| G5 (replace-guard expired-lock exclusion) | DONE — `replaceWeeklyBlocks` has the `NOT` clause (`doctor/service.js:160-162`) | No |

Baseline before Task 1: `npm test` → **139 passed** (server+shared), `npm --workspace client test` → **41 passed**.

**Execution preconditions:**
- DB container healthy; `.env` `DATABASE_URL` points at `localhost:5433` (see gap report note).
- **Branch:** creating a branch requires user approval (CLAUDE.md). At execution start, ask the user: branch `feature/slice-e` (recommended, matches prior slices) or work on `main`. Do not create a branch without their answer.

---

### Task 1: Schema migration — `NotificationJob` + `Payment` retry fields

**Files:**
- Modify: `prisma/schema.prisma`
- Created by tool: `prisma/migrations/<timestamp>_slice_e_notification_outbox/migration.sql`

- [ ] **Step 1: Add enums + model + Payment fields to `prisma/schema.prisma`**

Add to the enums section (after `AuditActorType`, ~line 78):

```prisma
enum NotificationType {
  booking_confirmation
  reminder_24h
  reminder_1h
  prescription_ready
  refund_confirmation
  cancellation_apology
  refund_delayed
}

enum NotificationStatus {
  pending
  sent
  failed
  suppressed
}
```

Add to `model Appointment` relations block (next to `payments Payment[]`, ~line 176):

```prisma
  notificationJobs NotificationJob[]
```

Add to `model Payment` (after `refundStatus`, ~line 203):

```prisma
  /// Refund-retry bookkeeping (F06.03 / edge #30). Worker polls retrying+due rows.
  refundAttempts    Int       @default(0)  @map("refund_attempts")
  nextRefundRetryAt DateTime? @map("next_refund_retry_at") @db.Timestamptz(6)
```

Add new model (after `model Payment`):

```prisma
/// Transactional email outbox (F07): the intent-to-send persists in the same DB (and, for
/// event emails, the same $transaction) as the state change that promised it. The dispatch
/// worker delivers, retries with backoff, and suppresses invalidated reminders.
model NotificationJob {
  id             String             @id @default(cuid())
  type           NotificationType
  appointmentId  String             @map("appointment_id")
  appointment    Appointment        @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  /// Snapshot at enqueue time.
  recipientEmail String             @map("recipient_email")
  /// Merge-vars snapshot at enqueue time (doc 14 §5 contract).
  vars           Json?
  scheduledFor   DateTime           @map("scheduled_for") @db.Timestamptz(6)
  status         NotificationStatus @default(pending)
  attempts       Int                @default(0)
  nextAttemptAt  DateTime?          @map("next_attempt_at") @db.Timestamptz(6)
  lastError      String?            @map("last_error")
  sentAt         DateTime?          @map("sent_at") @db.Timestamptz(6)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  /// Idempotent enqueue: a webhook replay cannot duplicate a job. Slice F relaxes
  /// this if prescription_ready needs to repeat per prescription (YAGNI now).
  @@unique([appointmentId, type])
  @@index([status, scheduledFor])
  @@map("notification_jobs")
}
```

`onDelete: Cascade` matters: the `payment.failed` webhook path and the edge-#6a reconciliation path delete `slot_locked` appointments; a leftover job row must not block that.

- [ ] **Step 2: Run the migration**

Run: `npm run prisma:migrate -- --name slice_e_notification_outbox`
Expected: "Your database is now in sync with your schema" + new folder under `prisma/migrations/`.

- [ ] **Step 3: Verify clean state + suite still green**

Run: `npx prisma migrate status` → "Database schema is up to date!"
Run: `npm test` → 139 passed (schema is additive; nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): NotificationJob outbox + Payment refund-retry fields (Slice E)"
```

---

### Task 2: New constants

**Files:**
- Modify: `server/src/config/constants.js`

- [ ] **Step 1: Add the four Slice E constants** (after `REFUND_BACKOFF_BASE_SEC`, line 20)

```js
export const EMAIL_MAX_ATTEMPTS = Number(process.env.EMAIL_MAX_ATTEMPTS ?? 3);
export const EMAIL_BACKOFF_BASE_SEC = Number(process.env.EMAIL_BACKOFF_BASE_SEC ?? 60);
export const RECONCILIATION_LOOKBACK_H = Number(process.env.RECONCILIATION_LOOKBACK_H ?? 24);
export const RECONCILIATION_MIN_AGE_MIN = Number(process.env.RECONCILIATION_MIN_AGE_MIN ?? 60);
```

- [ ] **Step 2: Run suite, commit**

Run: `npm test` → 139 passed.

```bash
git add server/src/config/constants.js
git commit -m "feat(config): Slice E worker constants (email retry, reconciliation window)"
```

---

### Task 3: Notification service — enqueue (outbox writes)

**Files:**
- Create: `server/src/modules/notification/service.js`
- Test: `server/src/modules/notification/test.js`

- [ ] **Step 1: Write the failing tests** (`server/src/modules/notification/test.js`)

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    notificationJob: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    appointment: { findUnique: vi.fn() },
  },
}));
vi.mock('../../integrations/email/index.js', () => ({
  emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import { enqueue, enqueueBookingEmails } from './service.js';

beforeEach(() => vi.clearAllMocks());

const NOW = new Date('2099-01-04T08:00:00Z');

describe('notification.enqueue', () => {
  it('upserts on (appointmentId, type) so a replayed webhook cannot duplicate a job', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({ id: 'n1' });
    await enqueue({
      type: 'booking_confirmation',
      appointmentId: 'a1',
      recipientEmail: 'p@t.test',
      scheduledFor: NOW,
      vars: { patientName: 'P' },
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: { appointmentId_type: { appointmentId: 'a1', type: 'booking_confirmation' } },
      update: {},
      create: {
        type: 'booking_confirmation',
        appointmentId: 'a1',
        recipientEmail: 'p@t.test',
        scheduledFor: NOW,
        vars: { patientName: 'P' },
      },
    });
  });

  it('uses the provided transaction client (outbox atomicity)', async () => {
    const tx = { notificationJob: { upsert: vi.fn().mockResolvedValue({}) } };
    await enqueue({
      type: 'refund_delayed',
      appointmentId: 'a1',
      recipientEmail: 'p@t.test',
      scheduledFor: NOW,
      client: tx,
    });
    expect(tx.notificationJob.upsert).toHaveBeenCalled();
    expect(prisma.notificationJob.upsert).not.toHaveBeenCalled();
  });
});

describe('notification.enqueueBookingEmails (F07.02 cadence + short-lead skip)', () => {
  const appointment = { id: 'a1', slotStart: new Date('2099-01-06T09:00:00Z') }; // 49h out

  it('enqueues confirmation now + 24h and 1h reminders at slot-relative times', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment,
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation', 'reminder_24h', 'reminder_1h']);
    const r24 = prisma.notificationJob.upsert.mock.calls[1][0].create;
    expect(r24.scheduledFor).toEqual(new Date('2099-01-05T09:00:00Z'));
    const r1 = prisma.notificationJob.upsert.mock.calls[2][0].create;
    expect(r1.scheduledFor).toEqual(new Date('2099-01-06T08:00:00Z'));
  });

  it('skips the 24h reminder when confirmed <24h before slot start', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment: { id: 'a1', slotStart: new Date('2099-01-04T18:00:00Z') }, // 10h out
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation', 'reminder_1h']);
  });

  it('skips both reminders when confirmed <1h before slot start', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment: { id: 'a1', slotStart: new Date('2099-01-04T08:30:00Z') }, // 30m out
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/src/modules/notification/test.js`
Expected: FAIL — "Cannot find module './service.js'" (or equivalent).

- [ ] **Step 3: Implement** (`server/src/modules/notification/service.js`)

```js
// @ts-check
import { formatInTimeZone } from 'date-fns-tz';
import { prisma } from '../../lib/prisma/prisma.js';
import { KARACHI } from '../../lib/tz/tz.js';
import { env } from '../../config/env/env.js';

const HOUR_MS = 60 * 60 * 1000;

/** All times in emails are Asia/Karachi (F07.02 Timezone Rule). */
export const slotStartLocal = (slotStart) =>
  formatInTimeZone(slotStart, KARACHI, 'EEE, dd MMM yyyy HH:mm');

/**
 * Persist one outbox row. Idempotent on (appointmentId, type): a replay is a no-op.
 * Pass `client` to join the caller's $transaction (the outbox guarantee).
 * @param {{ type: string, appointmentId: string, recipientEmail: string,
 *   scheduledFor: Date, vars?: object, client?: any }} args
 */
export async function enqueue({
  type,
  appointmentId,
  recipientEmail,
  scheduledFor,
  vars,
  client = prisma,
}) {
  return client.notificationJob.upsert({
    where: { appointmentId_type: { appointmentId, type } },
    update: {},
    create: { type, appointmentId, recipientEmail, scheduledFor, vars },
  });
}

/**
 * Enqueue the confirmation + reminder cadence at confirmation time (F07.02).
 * Short-Lead Skip Rule: no 24h reminder if <24h to slot; no 1h reminder if <1h.
 * @param {{ appointment: { id: string, slotStart: Date },
 *   patient: { email: string, fullName: string }, doctorName: string, fee: number|null,
 *   now?: Date, client?: any }} args
 */
export async function enqueueBookingEmails({
  appointment,
  patient,
  doctorName,
  fee,
  now = new Date(),
  client = prisma,
}) {
  const base = { appointmentId: appointment.id, recipientEmail: patient.email, client };
  const common = {
    patientName: patient.fullName,
    doctorName,
    slotStartLocal: slotStartLocal(appointment.slotStart),
  };
  const dashboardUrl = `${env.APP_BASE_URL}/appointments`;

  await enqueue({
    ...base,
    type: 'booking_confirmation',
    scheduledFor: now,
    vars: { ...common, fee, dashboardUrl },
  });

  const at24h = new Date(appointment.slotStart.getTime() - 24 * HOUR_MS);
  if (at24h.getTime() > now.getTime()) {
    await enqueue({
      ...base,
      type: 'reminder_24h',
      scheduledFor: at24h,
      vars: { ...common, joinUrl: dashboardUrl },
    });
  }
  const at1h = new Date(appointment.slotStart.getTime() - HOUR_MS);
  if (at1h.getTime() > now.getTime()) {
    await enqueue({
      ...base,
      type: 'reminder_1h',
      scheduledFor: at1h,
      vars: { ...common, joinUrl: dashboardUrl },
    });
  }
}
```


- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/src/modules/notification/test.js` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/notification
git commit -m "feat(notification): outbox enqueue with reminder cadence + short-lead skip (F07.02)"
```

---

### Task 4: Notification service — dispatch worker function

**Files:**
- Modify: `server/src/modules/notification/service.js`
- Modify: `server/src/modules/notification/test.js`

- [ ] **Step 1: Add failing dispatch tests** (append to `server/src/modules/notification/test.js`)

```js
import { emailProvider } from '../../integrations/email/index.js';
import * as audit from '../../services/audit/audit.service.js';
import { dispatchDueNotifications } from './service.js';

const baseJob = {
  id: 'n1',
  type: 'booking_confirmation',
  appointmentId: 'a1',
  recipientEmail: 'p@t.test',
  vars: { patientName: 'P' },
  status: 'pending',
  attempts: 0,
};

describe('notification.dispatchDueNotifications', () => {
  beforeEach(() => {
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.update.mockResolvedValue({});
  });

  it('sends a due job and marks it sent', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalledWith({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P' },
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('suppresses a reminder whose appointment left confirmed/in_progress (F07.03 invalidation)', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, type: 'reminder_24h' }]);
    prisma.appointment.findUnique.mockResolvedValue({ state: 'cancelled_refunded' });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'suppressed' } }),
    );
  });

  it('still sends a reminder while the appointment is confirmed', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, type: 'reminder_1h' }]);
    prisma.appointment.findUnique.mockResolvedValue({ state: 'confirmed' });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalled();
  });

  it('on failure schedules an exponential-backoff retry', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    emailProvider.send.mockRejectedValueOnce(new Error('smtp down'));
    await dispatchDueNotifications(NOW);
    const update = prisma.notificationJob.update.mock.calls[0][0];
    expect(update.data.attempts).toBe(1);
    // EMAIL_BACKOFF_BASE_SEC=60 default: 60s * 2^1 = 120s after NOW
    expect(update.data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 120_000));
    expect(update.data.status).toBeUndefined();
  });

  it('at EMAIL_MAX_ATTEMPTS marks failed and writes the email.send_failed_final audit alert', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, attempts: 2 }]); // 3rd try
    emailProvider.send.mockRejectedValueOnce(new Error('smtp down'));
    await dispatchDueNotifications(NOW);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed', attempts: 3 }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'email.send_failed_final', targetRef: 'a1' }),
    );
  });

  it('skips a job another pass already claimed (lease flip returned count 0)', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('one poisoned job does not starve the batch', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      { ...baseJob, id: 'n1' },
      { ...baseJob, id: 'n2' },
    ]);
    prisma.notificationJob.updateMany
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValue({ count: 1 });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run server/src/modules/notification/test.js`
Expected: 5 pass (Task 3), 7 FAIL — "dispatchDueNotifications is not a function".

- [ ] **Step 3: Implement dispatch** (append to `server/src/modules/notification/service.js`; add these imports to the top of the file)

```js
import { logger } from '../../lib/logger/logger.js';
import { EMAIL_MAX_ATTEMPTS, EMAIL_BACKOFF_BASE_SEC } from '../../config/constants.js';
import { emailProvider } from '../../integrations/email/index.js';
import * as audit from '../../services/audit/audit.service.js';
```

```js
const REMINDER_TYPES = new Set(['reminder_24h', 'reminder_1h']);
const SENDABLE_STATES = new Set(['confirmed', 'in_progress']);
const LEASE_MS = 60_000;

/** Minute-cron worker body: deliver due outbox rows. Pure w.r.t. the injected clock. */
export async function dispatchDueNotifications(now = new Date()) {
  const due = await prisma.notificationJob.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledFor: 'asc' },
  });
  for (const job of due) {
    // One poisoned row must not starve the batch — it is retried next tick.
    try {
      await dispatchOne(job, now);
    } catch (e) {
      logger.error('notification dispatch failed; will retry next tick', {
        jobId: job.id,
        err: String(e),
      });
    }
  }
}

async function dispatchOne(job, now) {
  // Lease claim (defense-in-depth over the ADR-08 single-instance assumption): pushing
  // nextAttemptAt forward atomically prevents a concurrent pass double-sending this row.
  const claimed = await prisma.notificationJob.updateMany({
    where: { id: job.id, status: 'pending' },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  });
  if (claimed.count === 0) return;

  // Reminder-Invalidation Rule (F07.03): re-check state immediately before dispatch.
  if (REMINDER_TYPES.has(job.type)) {
    const appt = await prisma.appointment.findUnique({
      where: { id: job.appointmentId },
      select: { state: true },
    });
    if (!appt || !SENDABLE_STATES.has(appt.state)) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'suppressed' },
      });
      return;
    }
  }

  try {
    await emailProvider.send({ template: job.type, to: job.recipientEmail, vars: job.vars ?? {} });
  } catch (e) {
    const attempts = job.attempts + 1;
    const lastError = String(e?.message ?? e);
    if (attempts >= EMAIL_MAX_ATTEMPTS) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: { status: 'failed', attempts, lastError },
      });
      // Alert source for the Slice G admin feed (F12.01 "email failures after retry exhaustion").
      await audit
        .record({
          eventType: 'email.send_failed_final',
          actorType: 'system',
          targetRef: job.appointmentId,
          reason: `${job.type}: ${lastError}`,
        })
        .catch(() => {});
      return;
    }
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        attempts,
        lastError,
        nextAttemptAt: new Date(now.getTime() + EMAIL_BACKOFF_BASE_SEC * 1000 * 2 ** attempts),
      },
    });
    return;
  }

  await prisma.notificationJob.update({
    where: { id: job.id },
    data: { status: 'sent', sentAt: new Date(), lastError: null },
  });
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx vitest run server/src/modules/notification/test.js` → PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/notification
git commit -m "feat(notification): dispatch worker — invalidation re-check, backoff, exhaustion alert (F07.03)"
```

---

### Task 5: Wire the payment webhook to the outbox (in-transaction)

**Files:**
- Modify: `server/src/modules/payment/service.js`
- Modify: `server/src/modules/payment/test.js`

- [ ] **Step 1: Update the webhook test** — in `server/src/modules/payment/test.js`:

Add to the `vi.mock` block list (top of file):

```js
vi.mock('../notification/service.js', () => ({
  enqueueBookingEmails: vi.fn().mockResolvedValue(undefined),
}));
```

and import it:

```js
import * as notification from '../notification/service.js';
```

Replace the existing `processWebhook` success test's assertions about `emailProvider.send` (and add a rollback-safety test) so the describe block contains:

```js
describe('payment.processWebhook', () => {
  it('on success commits state+payment+outbox in one $transaction', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const tx = {
      payment: { update: vi.fn() },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'p@t.test', fullName: 'P' }),
      },
      doctor: {
        findUnique: vi.fn().mockResolvedValue({ user: { fullName: 'Dr. D' } }),
      },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await processWebhook({
      event: 'payment.success',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: 6000,
    });
    expect(notification.enqueueBookingEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        appointment: expect.objectContaining({ id: 'a1' }),
        patient: { email: 'p@t.test', fullName: 'P' },
        doctorName: 'Dr. D',
        fee: 250000,
        client: tx,
      }),
    );
    expect(emailProvider.send).not.toHaveBeenCalled(); // no direct send path remains
  });
```

Keep the block's other existing tests (idempotent replay, failed event) unchanged below this.

- [ ] **Step 2: Run to verify the changed test fails**

Run: `npx vitest run server/src/modules/payment/test.js`
Expected: FAIL — `enqueueBookingEmails` not called.

- [ ] **Step 3: Rewire `processWebhook`** in `server/src/modules/payment/service.js`:

Add import (and **delete** the now-unused `emailProvider` import and `logger` import if nothing else uses it):

```js
import * as notification from '../notification/service.js';
```

Replace the `$transaction` block and the post-commit email block (lines 69-98) with:

```js
  await prisma.$transaction(async (tx) => {
    await appointmentState.transition({
      appointmentId: appt.id,
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: amount, lockExpiresAt: null },
      client: tx,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'success', gatewayFee: gatewayFee ?? null },
    });
    // Outbox (F07): the confirmation + reminder jobs commit atomically with `confirmed` —
    // a crash after commit can never lose the email, and the IPN ack never waits on a send.
    const [patient, doctor] = await Promise.all([
      tx.user.findUnique({
        where: { id: appt.patientUserId },
        select: { email: true, fullName: true },
      }),
      tx.doctor.findUnique({
        where: { id: appt.doctorId },
        select: { user: { select: { fullName: true } } },
      }),
    ]);
    await notification.enqueueBookingEmails({
      appointment: appt,
      patient,
      doctorName: doctor.user.fullName,
      fee: amount,
      client: tx,
    });
  });
  return { ok: true };
```

- [ ] **Step 4: Run the module + full suite**

Run: `npx vitest run server/src/modules/payment/test.js` → PASS.
Run: `npm test` → expect green; if an integration test asserted on the old direct confirmation send (check `server/src/test/booking.integration.test.js`), update it to assert a `notification_jobs` row exists instead (`prisma.notificationJob.findMany({ where: { appointmentId } })` → 1-3 rows).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/payment server/src/test
git commit -m "feat(payment): confirmation + reminders enqueue in the webhook transaction (outbox, F04.02/F07)"
```

---

### Task 6: Wire cancellation + no-show emails through the outbox

**Files:**
- Modify: `server/src/modules/appointment/service.js`
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Update appointment tests.** In `server/src/modules/appointment/test.js` add the mock:

```js
vi.mock('../notification/service.js', () => ({
  enqueue: vi.fn().mockResolvedValue({}),
  enqueueBookingEmails: vi.fn().mockResolvedValue(undefined),
}));
```

import `* as notification from './../notification/service.js';` and, in the existing cancel-flow tests that currently assert `emailProvider.send` was called with `cancellation_apology` / `refund_confirmation`, change the assertion to:

```js
expect(notification.enqueue).toHaveBeenCalledWith(
  expect.objectContaining({ type: 'cancellation_apology', appointmentId: 'a1' }),
);
```

(respectively `refund_confirmation`). Also for the doctor_no_show worker test (apology path).

- [ ] **Step 2: Run to verify the changed tests fail**

Run: `npx vitest run server/src/modules/appointment/test.js` → targeted FAILs.

- [ ] **Step 3: Replace the direct senders.** In `server/src/modules/appointment/service.js`:

Add import:

```js
import * as notification from '../notification/service.js';
```

Replace the `sendApology` helper (lines 387-401) with an outbox version, and route `sendNoShowApology` through it:

```js
/** Enqueue a cancellation-flow email (outbox). Vars are snapshotted now (doc 14 §5). */
async function enqueueCancellationEmail(appt, type) {
  try {
    const [patient, doctor, payment] = await Promise.all([
      prisma.user.findUnique({
        where: { id: appt.patientUserId },
        select: { email: true, fullName: true },
      }),
      prisma.doctor.findUnique({
        where: { id: appt.doctorId },
        select: { user: { select: { fullName: true } } },
      }),
      prisma.payment.findFirst({ where: { appointmentId: appt.id, status: 'success' } }),
    ]);
    if (!patient) return;
    const refundAmount = payment
      ? Math.max(0, payment.amount - (payment.gatewayFee ?? 0))
      : null;
    await notification.enqueue({
      type,
      appointmentId: appt.id,
      recipientEmail: patient.email,
      scheduledFor: new Date(),
      vars: {
        patientName: patient.fullName,
        doctorName: doctor?.user?.fullName ?? null,
        slotStartLocal: notification.slotStartLocal(appt.slotStart),
        appointmentRef: appt.id,
        amount: refundAmount,
        refundAmount,
        refundRef: payment?.refundRef ?? null,
      },
    });
  } catch (e) {
    logger.warn('cancellation email not enqueued', { appointmentId: appt.id, type, err: String(e) });
  }
}
```

Then update the three call sites:
- in `cancel()` doctor branch: `await sendApology(appt, 'cancellation_apology')` → `await enqueueCancellationEmail(appt, 'cancellation_apology')`
- in `cancel()` refundable branch: `await sendApology(appt, 'refund_confirmation')` → `await enqueueCancellationEmail(appt, 'refund_confirmation')`
- in `resolveNoShow()`: `await sendNoShowApology(a.patientUserId, a.id).catch(() => {})` → `await enqueueCancellationEmail(a, 'cancellation_apology')`

Delete the now-orphaned `sendNoShowApology` function (lines 476-491) and, if `emailProvider` has no remaining users in this file, its import.

- [ ] **Step 4: Run module tests + full suite**

Run: `npx vitest run server/src/modules/appointment/test.js` → PASS.
Run: `npm test` → green (update any integration assertion on direct cancel emails the same way as Task 5 Step 4).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment server/src/test
git commit -m "refactor(appointment): cancellation + no-show emails via the notification outbox (F07)"
```

---

### Task 7: Refund retry — semantics + worker function (G1 completion)

**Files:**
- Modify: `server/src/modules/appointment/service.js` (`initiateRefund` + new `retryDueRefunds`)
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write failing tests** (append to `server/src/modules/appointment/test.js`; the file's existing mocks for `prisma`, `paymentProvider`, `audit`, plus the Task 6 `notification` mock, cover these — ensure `prisma.payment.findMany` and `prisma.user.findUnique` are in the prisma mock):

```js
import { initiateRefund, retryDueRefunds } from './service.js';

describe('refund retry (F06.03 / edge #30)', () => {
  const failedPayment = {
    id: 'p1',
    appointmentId: 'a1',
    providerRef: 'mock_1',
    amount: 250000,
    gatewayFee: 6000,
    refundIdempotencyKey: null,
    refundAttempts: 0,
  };

  it('on provider failure marks retrying with attempts+1 and a backoff schedule', async () => {
    prisma.payment.findFirst.mockResolvedValue(failedPayment);
    prisma.settings.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockRejectedValue(new Error('gateway 500'));
    await expect(initiateRefund({ appointmentId: 'a1' })).rejects.toThrow('gateway 500');
    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.refundStatus).toBe('retrying');
    expect(data.refundAttempts).toBe(1);
    expect(data.nextRefundRetryAt).toBeInstanceOf(Date);
  });

  it('at REFUND_MAX_ATTEMPTS marks failed, audits exhaustion, and enqueues refund_delayed', async () => {
    prisma.payment.findFirst.mockResolvedValue({ ...failedPayment, refundAttempts: 4 }); // 5th try
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
      doctorId: 'd1',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    paymentProvider.refund.mockRejectedValue(new Error('gateway 500'));
    await expect(initiateRefund({ appointmentId: 'a1' })).rejects.toThrow();
    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.refundStatus).toBe('failed');
    expect(data.nextRefundRetryAt).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.refund_exhausted', targetRef: 'a1' }),
    );
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund_delayed', appointmentId: 'a1' }),
    );
  });

  it('retryDueRefunds re-runs initiateRefund for due retrying payments', async () => {
    prisma.payment.findMany.mockResolvedValue([{ ...failedPayment, refundStatus: 'retrying' }]);
    prisma.payment.findFirst.mockResolvedValue({ ...failedPayment, refundAttempts: 1 });
    prisma.settings.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await retryDueRefunds(new Date('2099-01-04T08:00:00Z'));
    expect(paymentProvider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'rf_a1' }),
    );
    const success = prisma.payment.update.mock.calls.at(-1)[0].data;
    expect(success.refundStatus).toBe('settled');
    expect(success.nextRefundRetryAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/src/modules/appointment/test.js` → FAIL (`retryDueRefunds` undefined; `retrying` not set).

- [ ] **Step 3: Implement.** In `server/src/modules/appointment/service.js`:

Add `REFUND_MAX_ATTEMPTS, REFUND_BACKOFF_BASE_SEC` to the existing `constants.js` import. Replace the `catch` block of `initiateRefund` (lines 295-303) with:

```js
  } catch (e) {
    // Edge #30: schedule an exponential-backoff retry; on exhaustion alert the admin and
    // notify the patient of the delay. Idempotency key (#10) makes every retry safe.
    const attempts = (payment.refundAttempts ?? 0) + 1;
    const exhausted = attempts >= REFUND_MAX_ATTEMPTS;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundIdempotencyKey: key,
        refundStatus: exhausted ? 'failed' : 'retrying',
        refundAttempts: attempts,
        nextRefundRetryAt: exhausted
          ? null
          : new Date(Date.now() + REFUND_BACKOFF_BASE_SEC * 1000 * 2 ** attempts),
      },
    });
    if (exhausted) {
      await audit
        .record({
          eventType: 'payment.refund_exhausted',
          actorType: 'system',
          targetRef: appointmentId,
          reason: String(e?.message ?? e),
          meta: { providerRef: payment.providerRef ?? null, attempts },
        })
        .catch(() => {});
      await enqueueRefundDelayed(appointmentId).catch(() => {});
    }
    throw e;
  }
```

Update the success-path `payment.update` of `initiateRefund` to also clear the schedule:

```js
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      refundIdempotencyKey: key,
      refundRef: result.refundRef,
      refundStatus: result.status,
      nextRefundRetryAt: null,
    },
  });
```

Add below `safeRefund`:

```js
async function enqueueRefundDelayed(appointmentId) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return;
  const patient = await prisma.user.findUnique({
    where: { id: appt.patientUserId },
    select: { email: true, fullName: true },
  });
  if (!patient) return;
  await notification.enqueue({
    type: 'refund_delayed',
    appointmentId,
    recipientEmail: patient.email,
    scheduledFor: new Date(),
    vars: { patientName: patient.fullName, appointmentRef: appointmentId },
  });
}

/** Minute-cron worker body (F06.03): re-run due refund retries. Clock-injected. */
export async function retryDueRefunds(now = new Date()) {
  const due = await prisma.payment.findMany({
    where: { refundStatus: 'retrying', nextRefundRetryAt: { lte: now } },
  });
  for (const p of due) {
    // Best-effort per row; initiateRefund itself reschedules/exhausts on failure.
    await self.initiateRefund({ appointmentId: p.appointmentId }).catch(() => {});
  }
}
```

- [ ] **Step 4: Run module tests + full suite**

Run: `npx vitest run server/src/modules/appointment/test.js` → PASS. Then `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment
git commit -m "feat(refund): exponential-backoff retry + exhaustion alert + refund_delayed email (F06.03, closes G1)"
```

---

### Task 8: Payment adapter — `queryPaymentStatus` contract

**Files:**
- Modify: `server/src/integrations/payment/index.js` (typedef)
- Modify: `server/src/integrations/payment/payfast.mock.js`
- Modify: `server/src/integrations/payment/payfast.stub.js`
- Test: `server/src/integrations/payment/payfast.mock.test.js`

- [ ] **Step 1: Write the failing test** (append to `payfast.mock.test.js`):

```js
import { payfastMock } from './payfast.mock.js';

describe('payfastMock.queryPaymentStatus', () => {
  it('returns unknown — the dev mock gateway keeps no ledger; tests stub richer answers', async () => {
    await expect(payfastMock.queryPaymentStatus({ providerRef: 'mock_x' })).resolves.toEqual({
      status: 'unknown',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/integrations/payment/payfast.mock.test.js` → FAIL.

- [ ] **Step 3: Implement.**

In `index.js`, extend the typedef:

```js
/**
 * @typedef {Object} PaymentProvider
 * @property {(args: any) => Promise<any>} createCheckout
 * @property {(req: import('express').Request) => any} verifyWebhook
 * @property {(args: any) => Promise<any>} refund
 * @property {(sinceIso: string) => Promise<any[]>} listUnconfirmed
 * @property {(args: { providerRef: string }) => Promise<{ status: 'paid'|'failed'|'unknown', amount?: number, gatewayFee?: number|null }>} queryPaymentStatus
 */
```

In `payfast.mock.js`, add to the exported object:

```js
  /** The dev mock keeps no payment ledger; reconciliation tests stub this per-case. */
  async queryPaymentStatus() {
    return { status: 'unknown' };
  },
```

In `payfast.stub.js`, add to the exported object (matching its existing `ni()` style — open the file and mirror it exactly):

```js
  queryPaymentStatus: ni('queryPaymentStatus'),
```

- [ ] **Step 4: Run tests, commit**

Run: `npx vitest run server/src/integrations/payment` → PASS.

```bash
git add server/src/integrations/payment
git commit -m "feat(payment-adapter): queryPaymentStatus contract for the reconciliation worker (F04.03)"
```

---

### Task 9: Reconciliation worker function (F04.03 + edge #6a)

**Files:**
- Modify: `server/src/modules/payment/service.js`
- Modify: `server/src/modules/payment/test.js`

- [ ] **Step 1: Refactor seam (no behavior change).** Extract the success-commit `$transaction` body of `processWebhook` (Task 5's version) into an exported helper in the same file, then have `processWebhook` call it:

```js
/** The single atomic confirm commit (#2): transition + payment success + outbox enqueue.
 *  Shared by the webhook path and the reconciliation path (F04.03). */
export async function confirmPaidAppointment({ payment, appointment, amount, gatewayFee }) {
  await prisma.$transaction(async (tx) => {
    await appointmentState.transition({
      appointmentId: appointment.id,
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: amount, lockExpiresAt: null },
      client: tx,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'success', gatewayFee: gatewayFee ?? null },
    });
    const [patient, doctor] = await Promise.all([
      tx.user.findUnique({
        where: { id: appointment.patientUserId },
        select: { email: true, fullName: true },
      }),
      tx.doctor.findUnique({
        where: { id: appointment.doctorId },
        select: { user: { select: { fullName: true } } },
      }),
    ]);
    await notification.enqueueBookingEmails({
      appointment,
      patient,
      doctorName: doctor.user.fullName,
      fee: amount,
      client: tx,
    });
  });
}
```

`processWebhook` success branch becomes `await self.confirmPaidAppointment({ payment, appointment: appt, amount, gatewayFee }); return { ok: true };` — add the module self-import at the top (mirrors `appointment/service.js`):

```js
import * as self from './service.js';
```

Run: `npx vitest run server/src/modules/payment/test.js` → still PASS (pure extract).

- [ ] **Step 2: Write failing reconciliation tests** (append to `server/src/modules/payment/test.js`; add `payment.findMany`, `appointment.deleteMany` to the prisma mock and `refund: vi.fn()`, `queryPaymentStatus: vi.fn()` to the paymentProvider mock; add the audit mock if absent):

```js
import { reconcileUnconfirmed } from './service.js';
import * as audit from '../../services/audit/audit.service.js';

describe('payment.reconcileUnconfirmed (F04.03)', () => {
  const NOW = new Date('2099-01-04T12:00:00Z');
  const pendingPayment = {
    id: 'p1',
    appointmentId: 'a1',
    providerRef: 'mock_1',
    amount: 250000,
    refundIdempotencyKey: null,
    createdAt: new Date('2099-01-04T10:00:00Z'), // 2h old: inside [1h, 24h]
  };

  beforeEach(() => {
    prisma.payment.findMany.mockResolvedValue([pendingPayment]);
  });

  it('confirms a gateway-paid payment via the shared atomic commit', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({
      status: 'paid',
      amount: 250000,
      gatewayFee: 6000,
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const tx = {
      payment: { update: vi.fn() },
      user: { findUnique: vi.fn().mockResolvedValue({ email: 'p@t.test', fullName: 'P' }) },
      doctor: { findUnique: vi.fn().mockResolvedValue({ user: { fullName: 'Dr. D' } }) },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await reconcileUnconfirmed(NOW);
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'confirmed' }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciled_confirmed', targetRef: 'a1' }),
    );
  });

  it('edge #6a: slot conflict → full gross refund, no second appointment, admin alert', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await reconcileUnconfirmed(NOW);
    expect(paymentProvider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250000, idempotencyKey: 'rf_a1' }), // FULL amount
    );
    expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'slot_locked' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciliation_refund', targetRef: 'a1' }),
    );
  });

  it('edge #6a variant: locked appointment row already gone → full refund', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await reconcileUnconfirmed(NOW);
    expect(paymentProvider.refund).toHaveBeenCalled();
  });

  it('gateway-failed → same cleanup as the failed-IPN path', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'failed' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    await reconcileUnconfirmed(NOW);
    expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'slot_locked' },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });

  it('gateway-unknown → leaves the payment for the next pass', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'unknown' });
    await reconcileUnconfirmed(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
  });

  it('a provider query error audits a reconciliation mismatch and continues', async () => {
    paymentProvider.queryPaymentStatus.mockRejectedValue(new Error('gateway down'));
    await reconcileUnconfirmed(NOW);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciliation_mismatch' }),
    );
  });
});
```

- [ ] **Step 3: Run to verify they fail**, then **implement** (append to `server/src/modules/payment/service.js`):

```js
import * as audit from '../../services/audit/audit.service.js';
import {
  RECONCILIATION_LOOKBACK_H,
  RECONCILIATION_MIN_AGE_MIN,
} from '../../config/constants.js';

/**
 * Hourly safety net (F04.03): if a payment.success IPN was lost, query the gateway and
 * complete the same atomic commit; if the slot is no longer claimable, edge #6a — refund
 * the paying patient IN FULL (gross: platform fault, not a patient cancellation).
 */
export async function reconcileUnconfirmed(now = new Date()) {
  const newest = new Date(now.getTime() - RECONCILIATION_MIN_AGE_MIN * 60 * 1000);
  const oldest = new Date(now.getTime() - RECONCILIATION_LOOKBACK_H * 60 * 60 * 1000);
  const pending = await prisma.payment.findMany({
    where: {
      status: 'pending',
      providerRef: { not: null },
      createdAt: { lte: newest, gte: oldest },
    },
  });
  for (const p of pending) {
    // Per-row isolation: one bad payment must not stop the sweep.
    try {
      await reconcileOne(p, now);
    } catch (e) {
      logger.error('reconciliation failed for payment', { paymentId: p.id, err: String(e) });
      await audit
        .record({
          eventType: 'payment.reconciliation_mismatch',
          actorType: 'system',
          targetRef: p.appointmentId,
          reason: String(e?.message ?? e),
          meta: { providerRef: p.providerRef },
        })
        .catch(() => {});
    }
  }
}

async function reconcileOne(p, now) {
  const q = await paymentProvider.queryPaymentStatus({ providerRef: p.providerRef });
  if (q.status === 'unknown') return; // next hourly pass

  const appt = await prisma.appointment.findUnique({ where: { id: p.appointmentId } });

  if (q.status === 'failed') {
    // Mirror the failed-IPN path: drop the lock, close the intent.
    await prisma.appointment.deleteMany({ where: { id: p.appointmentId, state: 'slot_locked' } });
    await prisma.payment.update({ where: { id: p.id }, data: { status: 'failed' } });
    return;
  }

  // q.status === 'paid'
  if (appt?.state === 'confirmed') return; // a late IPN beat us — idempotent no-op
  if (appt?.state === 'slot_locked') {
    try {
      await self.confirmPaidAppointment({
        payment: p,
        appointment: appt,
        amount: q.amount ?? p.amount,
        gatewayFee: q.gatewayFee ?? null,
      });
      await audit.record({
        eventType: 'payment.reconciled_confirmed',
        actorType: 'system',
        targetRef: p.appointmentId,
        meta: { providerRef: p.providerRef },
      });
      return;
    } catch {
      // fall through to #6a — the slot was claimed while we held a stale lock
    }
  }
  await refundInFull(p);
}

/** Edge #6a: paid at the gateway but the slot is gone — full refund, no second appointment. */
async function refundInFull(p) {
  const key = p.refundIdempotencyKey ?? `rf_${p.appointmentId}`;
  const result = await paymentProvider.refund({
    providerRef: p.providerRef,
    amount: p.amount,
    idempotencyKey: key,
  });
  await prisma.payment.update({
    where: { id: p.id },
    data: {
      status: 'success', // money WAS captured at the gateway
      refundIdempotencyKey: key,
      refundRef: result.refundRef,
      refundStatus: result.status,
    },
  });
  await prisma.appointment.deleteMany({ where: { id: p.appointmentId, state: 'slot_locked' } });
  await audit.record({
    eventType: 'payment.reconciliation_refund',
    actorType: 'system',
    targetRef: p.appointmentId,
    reason: 'paid at gateway; slot no longer available (edge #6a) — refunded in full',
    meta: { providerRef: p.providerRef, amount: p.amount },
  });
}
```

(Also re-add `logger` import if Task 5 removed it.)

- [ ] **Step 4: Run module tests + full suite**

Run: `npx vitest run server/src/modules/payment/test.js` → PASS. `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/payment
git commit -m "feat(payment): hourly reconciliation — lost-IPN confirm + edge #6a full refund (F04.03)"
```

---

### Task 10: G2 booking half — `lockSlot` active-doctor guard

**Files:**
- Modify: `server/src/modules/appointment/service.js`
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write the failing test** (append to the lockSlot describe block; ensure `prisma.doctor.findFirst` is in the prisma mock):

```js
it('rejects locking a slot of an inactive/unknown doctor with 404 (invariant #9, no leak)', async () => {
  prisma.doctor.findFirst.mockResolvedValue(null); // inactive or missing — same answer
  await expect(
    lockSlot({
      patientUserId: 'u1',
      doctorId: 'd-gone',
      slotStart: '2099-01-06T09:00:00.000Z',
      forSelf: true,
    }),
  ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
});
```

Existing lockSlot tests must also stub the new guard: add `prisma.doctor.findFirst.mockResolvedValue({ id: 'd1' });` to their setup.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/src/modules/appointment/test.js`.

- [ ] **Step 3: Implement.** In `lockSlot` (`appointment/service.js`), insert before step "1." (the `generateSlots` validation):

```js
  // Invariant #9 (F10.03): a deactivated/unknown doctor takes NO new bookings.
  // 404-no-leak — same answer as the public profile route.
  const activeDoctor = await prisma.doctor.findFirst({
    where: { id: doctorId, isActive: true, status: 'active' },
    select: { id: true },
  });
  if (!activeDoctor) throw new AppError('NOT_FOUND', 'Doctor not found.', 404);
```

- [ ] **Step 4: Run module tests + full suite** → green. (If the booking integration test books against a seeded doctor, it already passes the guard.)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment
git commit -m "fix(booking): lockSlot rejects inactive/unknown doctors — closes G2 booking half (invariant #9)"
```

---

### Task 11: G3 — doctor default scope bounded to the Karachi day

**Files:**
- Modify: `server/src/modules/appointment/service.js` (`listForRole`)
- Modify: `server/src/modules/appointment/test.js`

- [ ] **Step 1: Write the failing test:**

```js
import { listForRole } from './service.js';

describe('listForRole doctor scope (F05.02)', () => {
  it("default scope is bounded to today's Karachi day", async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    await listForRole({ role: 'doctor', userId: 'u-doc' });
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.state).toEqual({ in: ['confirmed', 'in_progress'] });
    expect(where.slotStart.gte).toBeInstanceOf(Date);
    expect(where.slotStart.lt).toBeInstanceOf(Date);
    expect(where.slotStart.lt.getTime() - where.slotStart.gte.getTime()).toBe(24 * 3600 * 1000);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.** In `listForRole`, the doctor branch — add the imports `karachiWallTimeToUtc` to the existing `tz.js` import line, then replace the `where` construction:

```js
  // F05.02: the default doctor view is TODAY's appointments (Karachi day); history is separate.
  const todayYMD = formatInTimeZone(new Date(), KARACHI, 'yyyy-MM-dd');
  const dayStart = karachiWallTimeToUtc(todayYMD, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const where =
    scope === 'history'
      ? { doctorId: doctor.id, state: { in: TERMINAL } }
      : {
          doctorId: doctor.id,
          state: { in: UPCOMING },
          slotStart: { gte: dayStart, lt: dayEnd },
        };
```

- [ ] **Step 4: Run module + full suite + client suite** (D-02 consumes this endpoint; `npm --workspace client test` must stay 41 green — the client already treats the default scope as "today").

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/appointment
git commit -m "fix(appointment): doctor default scope bounded to today's Karachi day — closes G3 (F05.02)"
```

---

### Task 12: G4 — forgot-password timing equalization

**Files:**
- Modify: `server/src/modules/auth/service.js` (`requestPasswordReset`)
- Modify: `server/src/modules/auth/controller.js` (`forgotPassword`)
- Modify: `server/src/modules/auth/test.js` (or the module's existing test file — locate the `requestPasswordReset` tests and extend)

- [ ] **Step 1: Write the failing test** (in the auth module test file, mirroring its existing mock setup):

```js
import * as resetToken from '../../lib/resetToken/resetToken.js';

it('unknown email still performs token-shaped work (timing equalization, G4)', async () => {
  const spy = vi.spyOn(resetToken, 'hashResetToken');
  prisma.user.findUnique.mockResolvedValue(null);
  const out = await requestPasswordReset('ghost@t.test');
  expect(out).toBeNull();
  expect(spy).toHaveBeenCalled(); // same CPU shape as the known-email path
});
```

(If `resetToken.js` exports are not spy-able this way, assert instead that `generateResetToken` was called via the same spy technique on that export.)

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement.**

In `auth/service.js` `requestPasswordReset`, replace the early return:

```js
  if (!user) {
    // G4: constant-shape work vs the known-email branch (token gen + hash) so the uniform
    // {ok:true} response is not betrayed by a timing oracle. Mirrors login's DUMMY_HASH.
    hashResetToken(generateResetToken());
    return null;
  }
```

In `auth/controller.js` `forgotPassword`, make the send non-blocking (the remaining known-path delta — `await emailProvider.send` — disappears from the response path; doc 14 §5 already mandates "best-effort, never blocks"):

```js
export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    if (result) {
      const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${result.rawToken}`;
      // Fire-and-forget: the response must not reflect whether a send happened (G4/F01.03).
      emailProvider
        .send({
          template: 'password_reset',
          to: req.body.email,
          vars: { resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MIN },
        })
        .catch(() => {
          logger.warn('password reset email not sent', { email: req.body.email });
          if (env.NODE_ENV !== 'production') logger.info('DEV password reset link', { resetUrl });
        });
    }
    res.json({ ok: true }); // identical response whether or not the account exists
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Run auth module tests + full suite** (the auth integration test asserts the uniform `{ok:true}` — must stay green).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/auth
git commit -m "fix(auth): equalize forgot-password timing + non-blocking reset send — closes G4"
```

---

### Task 13: Real Resend adapter + key-based fallback

**Files:**
- Create: `server/src/integrations/email/resend.js`
- Delete: `server/src/integrations/email/resend.stub.js` (replaced by the real adapter)
- Modify: `server/src/integrations/email/index.js`
- Modify: `server/src/config/env/env.js` (+ `.env.example`)
- Test: `server/src/integrations/email/resend.test.js`
- Check: `server/src/integrations/integrations.test.js` (may assert the old stub default — update deliberately)

- [ ] **Step 1: Write the failing tests** (`server/src/integrations/email/resend.test.js`):

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env/env.js', () => ({
  env: {
    RESEND_API_KEY: 'rk_test',
    RESEND_FROM: 'no-reply@dermestha.example',
    EMAIL_PROVIDER: 'stub',
    NODE_ENV: 'test',
  },
}));

import { resendEmail } from './resend.js';

describe('resendEmail.send', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the Resend API with auth header and returns the provider id', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 're_123' }) });
    const out = await resendEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P' },
    });
    expect(out).toEqual({ providerId: 're_123' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk_test');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('no-reply@dermestha.example');
    expect(body.to).toEqual(['p@t.test']);
    expect(body.subject).toMatch(/confirmed/i);
  });

  it('maps a non-2xx response to EMAIL_SEND_FAILED so the outbox retry machinery engages', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(
      resendEmail.send({ template: 'reminder_1h', to: 'p@t.test', vars: {} }),
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED', status: 502 });
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **implement** `server/src/integrations/email/resend.js`:

```js
// @ts-check
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';

/** Subject lines per template. Final marketing copy is M4 (doc 14 §5); vars are the contract. */
const SUBJECTS = {
  booking_confirmation: 'Your Dermestha appointment is confirmed',
  reminder_24h: 'Reminder: your Dermestha appointment is tomorrow',
  reminder_1h: 'Reminder: your Dermestha appointment starts in 1 hour',
  prescription_ready: 'Your Dermestha prescription is ready',
  refund_confirmation: 'Your Dermestha refund has been initiated',
  cancellation_apology: 'Your Dermestha appointment was cancelled',
  refund_delayed: 'Your Dermestha refund is taking longer than expected',
  password_reset: 'Reset your Dermestha password',
};

const renderText = (vars) =>
  Object.entries(vars ?? {})
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

/** Real Resend adapter. Selected when RESEND_API_KEY is configured. */
/** @type {import('./index.js').EmailProvider} */
export const resendEmail = {
  async send({ template, to, vars }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'onboarding@resend.dev',
        to: [to],
        subject: SUBJECTS[template] ?? 'Dermestha notification',
        text: renderText(vars),
      }),
    });
    if (!res.ok) {
      throw new AppError('EMAIL_SEND_FAILED', `Resend responded ${res.status}`, 502);
    }
    const body = await res.json();
    return { providerId: body.id };
  },
  parseWebhook() {
    throw new AppError('NOT_IMPLEMENTED', 'resend.parseWebhook is M4', 501);
  },
};
```

- [ ] **Step 3: Rewrite the barrel** (`server/src/integrations/email/index.js`):

```js
// @ts-check
import { resendEmail } from './resend.js';
import { consoleEmail } from './console.dev.js';
import { env } from '../../config/env/env.js';
import { logger } from '../../lib/logger/logger.js';

/**
 * @typedef {Object} EmailProvider
 * @property {(args: any) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => any} parseWebhook
 */

/** Key-based fallback: EMAIL_PROVIDER=console forces the dev logger; otherwise a configured
 *  RESEND_API_KEY selects the real adapter, and its absence falls back to console with a
 *  loud warning (no real emails will be delivered). Flip = drop the key in .env + restart. */
function pickProvider() {
  if (env.EMAIL_PROVIDER === 'console') return consoleEmail;
  if (env.RESEND_API_KEY) return resendEmail;
  logger.warn(
    'EMAIL: no RESEND_API_KEY configured — falling back to the console adapter; no real emails will be delivered',
  );
  return consoleEmail;
}

export const emailProvider = pickProvider();
```

Delete `server/src/integrations/email/resend.stub.js` (this barrel change orphans it).

- [ ] **Step 4: Update env schema.** In `server/src/config/env/env.js`, change/add:

```js
  EMAIL_PROVIDER: z.enum(['stub', 'console', 'resend']).default('stub'),
  RESEND_FROM: z.string().optional(),
```

(`'stub'` stays accepted for existing `.env` files; it now routes through the key-based fallback.) Add `RESEND_FROM=` to `.env.example` with a comment: key alone sends only to the account owner's address from `onboarding@resend.dev`; patient inboxes need a verified domain + `RESEND_FROM` on it.

- [ ] **Step 5: Run email tests + full suite.** `npx vitest run server/src/integrations` — if `integrations.test.js` asserted the resend-stub default throws 501, update that assertion to the new fallback behavior (console when no key). Then `npm test` + `npm --workspace client test` → all green.

- [ ] **Step 6: Commit**

```bash
git add server/src/integrations/email server/src/config/env/env.js .env.example
git commit -m "feat(email): real Resend adapter with RESEND_API_KEY-based console fallback"
```

---

### Task 14: Worker registration + dev triggers

**Files:**
- Modify: `server/src/workers/index.js`
- Create: `server/src/dev/devWorkers.js`
- Modify: `server/src/routes.js`

- [ ] **Step 1: Register the three crons.** Replace `server/src/workers/index.js` with:

```js
// @ts-check
import cron from 'node-cron';
import { evaluateDueAppointments, retryDueRefunds } from '../modules/appointment/service.js';
import { dispatchDueNotifications } from '../modules/notification/service.js';
import { reconcileUnconfirmed } from '../modules/payment/service.js';
import { logger } from '../lib/logger/logger.js';

const tick = (name, fn) => async () => {
  try {
    await fn(new Date());
  } catch (e) {
    logger.error(`${name} tick failed`, { err: String(e) });
  }
};

/** Start in-process workers (ADR-08). Single-instance; no leader election (doc 15 §3). */
export function startWorkers() {
  cron.schedule('* * * * *', tick('appointment-evaluation', evaluateDueAppointments));
  cron.schedule('* * * * *', tick('notification-dispatch', dispatchDueNotifications));
  cron.schedule('* * * * *', tick('refund-retry', retryDueRefunds));
  cron.schedule('0 * * * *', tick('payment-reconciliation', reconcileUnconfirmed));
  logger.info(
    'workers started: appointment-evaluation, notification-dispatch, refund-retry (* * * * *); payment-reconciliation (0 * * * *)',
  );
}
```

- [ ] **Step 2: Dev triggers.** Create `server/src/dev/devWorkers.js` (extends the ADR-25 `/dev/worker/*` pattern):

```js
// @ts-check
import { Router } from 'express';
import { dispatchDueNotifications } from '../modules/notification/service.js';
import { retryDueRefunds } from '../modules/appointment/service.js';
import { reconcileUnconfirmed } from '../modules/payment/service.js';

/** Dev-only on-demand worker passes (no waiting for cron). NEVER mounted in production. */
export const devWorkersRouter = Router();

const trigger = (fn) => async (_req, res, next) => {
  try {
    await fn(new Date());
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

devWorkersRouter.post('/worker/notifications', trigger(dispatchDueNotifications));
devWorkersRouter.post('/worker/refund-retry', trigger(retryDueRefunds));
devWorkersRouter.post('/worker/reconcile', trigger(reconcileUnconfirmed));
```

- [ ] **Step 3: Mount it.** In `server/src/routes.js`, after the existing dev mounts:

```js
  if (env.NODE_ENV === 'development') app.use('/dev', devWorkersRouter);
```

with the import `import { devWorkersRouter } from './dev/devWorkers.js';`

- [ ] **Step 4: Verify boot + suite.** Run: `npm test` → green. Then a smoke boot: `node --check server/src/workers/index.js && node --check server/src/dev/devWorkers.js` (syntax) — full app boot is covered by `app.integration.test.js`.

- [ ] **Step 5: Commit**

```bash
git add server/src/workers server/src/dev/devWorkers.js server/src/routes.js
git commit -m "feat(workers): register notification-dispatch, refund-retry, reconciliation crons + dev triggers"
```

---

### Task 15: Integration tests — outbox atomicity + reminder suppression (real DB)

**Files:**
- Create: `server/src/test/notification.integration.test.js` (mirror the setup helpers of `server/src/test/booking.integration.test.js` — same DB bootstrap, seeded doctor, signed-IPN helper from `payfast.mock.js`)

- [ ] **Step 1: Write the test.** Follow `booking.integration.test.js`'s existing arrange helpers (signup/login agent, lock a slot, post a `buildSignedIpn` body to `/api/webhooks/payfast`). Then assert:

```js
// after the signed payment.success IPN for a slot ~49h out:
const jobs = await prisma.notificationJob.findMany({
  where: { appointmentId },
  orderBy: { scheduledFor: 'asc' },
});
expect(jobs.map((j) => j.type)).toEqual(['booking_confirmation', 'reminder_24h', 'reminder_1h']);
expect(jobs[0].status).toBe('pending');

// cancel ≥2h before slot, then run a dispatch pass with a clock after the 24h-reminder time:
await agent.post(`/api/appointments/${appointmentId}/cancel`).send({});
await dispatchDueNotifications(new Date(slotStart.getTime() - 23 * 3600 * 1000));
const after = await prisma.notificationJob.findMany({ where: { appointmentId } });
expect(after.find((j) => j.type === 'reminder_24h').status).toBe('suppressed');
// the cancellation flow itself enqueued the refund_confirmation job:
expect(after.some((j) => j.type === 'refund_confirmation')).toBe(true);
```

Also assert a replayed identical IPN does not duplicate rows (`findMany` count unchanged).

- [ ] **Step 2: Run it against the live dev DB**

Run: `npx vitest run server/src/test/notification.integration.test.js` → PASS.

- [ ] **Step 3: Full verification**

Run: `npm test` → expect ~158+ passed (139 baseline + new). Run: `npm --workspace client test` → 41 passed. Run: `npm run lint` → clean.

- [ ] **Step 4: Commit**

```bash
git add server/src/test/notification.integration.test.js
git commit -m "test(notification): outbox atomicity, replay idempotency, reminder suppression (integration)"
```

---

### Task 16: Canon-doc approval gate + status sweep + wrap-up

**Files (all gated):**
- Modify: `docs/specification/04-DATABASE_DOCUMENT.md`, `05-API_SPECIFICATION_DOCUMENT.md`, `08-SECURITY_COMPLIANCE_DOCUMENT.md`, `11-ARCHITECTURE_DECISION_RECORD.md` (new ADR-27), `12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md`, `14-INTEGRATION_CONTRACTS_DOCUMENT.md`, `15-CONFIGURATION_REFERENCE_DOCUMENT.md`, `13-PRODUCT_STATUS_TRACKER.md`
- Modify: `agentChangeLogs/<session log>` + `agentChangeLogs/index.md`

- [ ] **Step 1: STOP — user approval required (CLAUDE.md).** Present the §11 table of the design doc as the concrete edit list (one bullet per doc with the exact rows/sections to touch, including: doc 14 §5 gains the `refund_delayed` row + the Resend key/domain caveat; doc 15 gains the four new constants + `RESEND_FROM` + fallback semantics + worker cadences; doc 11 gains ADR-27 "Notification outbox + in-process dispatch/retry workers"). **Do not edit any `docs/specification/` file until the user explicitly approves.**

- [ ] **Step 2: Apply approved edits** per doc 00's surgical-edit rule (only changed facts; version minor-bump + revision-footer row per doc).

- [ ] **Step 3: Doc 13 status sweep:** M2 milestone row (reconciliation/reminder workers now built), module rows 8/13 (Refund → retry built; Notification/email → Built for v1 transport), worker table (all three new workers → Built), F06/F07 feature rows, M1/M2 checklists, email adapter row (real Resend + fallback), revision footer (v1.7).

- [ ] **Step 4: Final verification + changelog.** `npm test` + `npm --workspace client test` + `npx prisma migrate status` all green/clean; update the session changelog (files table, verification evidence, decisions) and `agentChangeLogs/index.md`; commit docs separately:

```bash
git add docs/specification agentChangeLogs
git commit -m "docs(spec): Slice E canon sweep — outbox schema, ADR-27, config additions, status v1.7"
```

---

## Post-plan notes for the executor

- **TDD discipline:** every task above runs red before green; do not reorder steps within a task.
- **Surgical-change rule:** do not reformat or "improve" untouched code in the files you modify.
- **No push, no deploy, no new branch without explicit user approval** (CLAUDE.md).
- **Subagent changelog rule:** subagents must NOT create or edit anything under `agentChangeLogs/` — the controller owns the single session log.
- Templates' final copy is M4 (doc 14 §5): the `renderText` key-value body and `SUBJECTS` map are deliberately plain.
- `listUnconfirmed` on the payment adapter remains (pre-existing, unused) — not this slice's mess to delete.
