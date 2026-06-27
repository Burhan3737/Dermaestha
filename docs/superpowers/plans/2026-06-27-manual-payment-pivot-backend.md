# Manual Payment Pivot — Backend Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-app PayFast gateway + refund + no-show machinery with a fully-manual offline-payment backend: book → `pending` (slot locked) → patient submits a bank transaction reference → admin accepts (`confirmed`) or rejects (`cancelled`); appointments auto-complete by time; prescriptions stay gated on `completed`.

**Architecture:** Reuse the existing booking/state spine (Approach A). The `AppointmentState` enum collapses to `pending → confirmed → completed` + `cancelled`. `transition()` stays the sole state writer. Money is fully offline (no `Payment` table, no refunds). A slimmed in-process node-cron keeps two jobs (time-based completion + the email outbox).

**Tech Stack:** Node 20 (ESM), Express, Prisma 6 + Postgres 16, node-cron, Zod (shared schemas), Vitest + Supertest (server), Playwright (e2e). `@ts-check` JSDoc throughout.

**Source design:** `docs/superpowers/specs/2026-06-27-manual-payment-pivot-design.md` (committed c140a68). Frontend is Plan 2.

## Global Constraints

- Money is stored as integer **PKR paisa**; all timestamps `timestamptz` UTC, rendered `Asia/Karachi`. (doc 04)
- `transition()` in `appointment/service.js` is the ONLY writer of `Appointment.state`. (doc 05 §5)
- Notifications go through the outbox (`notification.enqueue`) — never sent inline. (F07)
- No spec (`00`–`15`) edits during the build; doc-impact is tracked in the design §14 and applied at the END with user approval.
- Subagents MUST NOT touch `agentChangeLogs/`; the controller owns the single session changelog.
- New code follows existing house patterns (`AppError`, `requireRole`, Zod `validate`, `@ts-check`).
- Run from project root `C:\workProjects\dermestha`. Tests: `npm test` (Vitest). Lint: `npm run lint`.

---

## File Structure

**Modify**
- `prisma/schema.prisma` — enum → 4 states; add `paymentReference`/`paymentSubmittedAt`; drop `Payment`, `doctorJoinedAt`, `patientJoinedAt`, `disputed`, `lockExpiresAt`; settings bank fields.
- `server/src/modules/appointment/service.js` — `LEGAL` map; `lockSlot` (pending + fee snapshot); `cancel` (no refund); add `submitPaymentReference`, `adminDecision`, `completeDueAppointments`; delete refund/no-show/reconcile bodies.
- `server/src/modules/appointment/controller.js` — `pay` → reference submit; add `adminAccept`/`adminReject`; drop `dispute`.
- `server/src/modules/appointment/index.js` — drop `/dispute`; admin accept/reject under admin router (see admin/index.js).
- `server/src/modules/prescription/service.js` — keep `completed` gate; drop the `completed → prescription_issued` transition.
- `server/src/modules/notification/service.js` — add `enqueuePaymentSubmittedAdmin`, `enqueueBookingConfirmation`, `enqueuePaymentNotReceived`; `SENDABLE_STATES` → `['confirmed']`.
- `server/src/workers/index.js` — 2 jobs only.
- `server/src/modules/admin/index.js` + `controller.js` — add accept/reject; drop `record-refund`.
- `server/src/routes.js` — drop payment webhook/return routers + dev checkout/video-sim mounts.
- `server/src/config/constants.js` / `env.js` — drop refund/reconcile/no-show/payfast/daily-webhook constants.
- `client/vite.config.js` — drop `/dev` proxy if no `/dev` route remains.

**Delete**
- `server/src/integrations/payment/` (index.js, payfast*.js)
- `server/src/modules/payment/` (service.js, controller.js, index.js)
- `server/src/dev/devCheckout.js`; the join-sim + `/worker/evaluate` parts of `server/src/dev/devVideo.js`; refund-retry/reconcile triggers in `server/src/dev/devWorkers.js`
- `server/src/integrations/video/` participant-webhook code paths; `server/scripts/register-daily-webhook.mjs`
- Tests for deleted code (see Task 15).

**Create**
- `docs/specification/_pending/ADR-manual-payment.md` — ADR draft (applied to doc 11 at end).
- `prisma/migrations/<ts>_manual_payment_pivot/migration.sql` — generated.

---

## Task 1: Safety net + ADR draft

**Files:**
- Create: `docs/specification/_pending/ADR-manual-payment.md`

- [ ] **Step 1: Tag the pre-deletion commit**

Run:
```bash
git tag pre-manual-payment-pivot
git tag --list | grep pre-manual-payment-pivot
```
Expected: prints `pre-manual-payment-pivot`.

- [ ] **Step 2: Write the ADR draft** (applied into doc 11 at end-of-task, with approval)

```markdown
# ADR-XX: Manual offline payment (phase 1)

**Status:** Accepted — supersedes ADR-32 (PayFast PK), ADR-33 (Daily webhook),
ADR-12 (no-show precedence), parts of ADR-23/ADR-39 (lock-expiry/refund).

**Context:** Client deferred online payments for phase 1; refunds add complexity and
Daily webhooks (no-show signal) require a paid plan.

**Decision:** Remove the PayFast gateway, the refund subsystem, and the no-show lifecycle.
Payment is offline bank transfer, verified manually by the admin. Appointment states collapse
to pending/confirmed/completed/cancelled; completion is time-based (slotEnd + VIDEO_TOKEN_POST_MIN);
prescriptions stay gated on completed. Daily.co runs on the free tier (room + token only).

**Consequences:** No in-app money movement; admin reconciles by bank txn reference. Future online
payments are a revive-and-adapt effort from tag `pre-manual-payment-pivot`.
```

- [ ] **Step 3: Commit**
```bash
git add docs/specification/_pending/ADR-manual-payment.md
git commit -m "chore: tag pre-manual-payment-pivot + ADR draft"
```

---

## Task 2: Schema migration — 4-state model, drop Payment

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_manual_payment_pivot/migration.sql`

**Interfaces:**
- Produces: `AppointmentState ∈ {pending, confirmed, completed, cancelled}`; `Appointment.paymentReference String?`, `Appointment.paymentSubmittedAt DateTime?`; `Settings.bankName/bankAccountName/bankAccountNumber/bankInstructions String?`; no `Payment` model.

> NOTE: Tasks 2–10 are the coordinated core. The migration transiently breaks references that Tasks 3–10 repair; run the **full suite at the end of Task 10** to confirm green. Deletions (Tasks 11–14) follow once consumers no longer reference the removed code.

- [ ] **Step 1: Edit `schema.prisma` — enum**

```prisma
enum AppointmentState {
  pending
  confirmed
  completed
  cancelled
}
```

- [ ] **Step 2: Edit `Appointment` model** — add the two columns, drop `doctorJoinedAt`, `patientJoinedAt`, `disputed`, `lockExpiresAt`; `state` default `pending`:

```prisma
  state             AppointmentState @default(pending)
  feeAtBooking      Int?             @map("fee_at_booking")   // snapshotted at lock time now
  paymentReference  String?          @map("payment_reference")
  paymentSubmittedAt DateTime?       @map("payment_submitted_at") @db.Timestamptz(6)
```
Remove the `Payment` relation field and the `doctorJoinedAt`/`patientJoinedAt`/`disputed`/`lockExpiresAt` lines.

- [ ] **Step 3: Delete the entire `Payment` model and `PaymentStatus` enum** from `schema.prisma`.

- [ ] **Step 4: Add bank fields to `Settings`**:
```prisma
  bankName          String? @map("bank_name")
  bankAccountName   String? @map("bank_account_name")
  bankAccountNumber String? @map("bank_account_number")
  bankInstructions  String? @map("bank_instructions")
```

- [ ] **Step 5: Author the migration SQL** (Postgres can't drop enum values in place — recreate the type). Create `prisma/migrations/<ts>_manual_payment_pivot/migration.sql`:

```sql
-- New enum, mapped from old values
ALTER TYPE "AppointmentState" RENAME TO "AppointmentState_old";
CREATE TYPE "AppointmentState" AS ENUM ('pending','confirmed','completed','cancelled');
ALTER TABLE "appointments" ALTER COLUMN "state" DROP DEFAULT;
ALTER TABLE "appointments"
  ALTER COLUMN "state" TYPE "AppointmentState"
  USING (CASE "state"::text
    WHEN 'slot_locked' THEN 'pending'
    WHEN 'in_progress' THEN 'confirmed'
    WHEN 'prescription_issued' THEN 'completed'
    WHEN 'cancelled_refunded' THEN 'cancelled'
    WHEN 'cancelled_no_refund' THEN 'cancelled'
    WHEN 'doctor_cancelled' THEN 'cancelled'
    WHEN 'patient_no_show' THEN 'cancelled'
    WHEN 'doctor_no_show' THEN 'cancelled'
    ELSE "state"::text END)::"AppointmentState";
ALTER TABLE "appointments" ALTER COLUMN "state" SET DEFAULT 'pending';
DROP TYPE "AppointmentState_old";

ALTER TABLE "appointments"
  ADD COLUMN "payment_reference" TEXT,
  ADD COLUMN "payment_submitted_at" TIMESTAMPTZ(6),
  DROP COLUMN "doctor_joined_at",
  DROP COLUMN "patient_joined_at",
  DROP COLUMN "disputed",
  DROP COLUMN "lock_expires_at";

ALTER TABLE "settings"
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "bank_account_name" TEXT,
  ADD COLUMN "bank_account_number" TEXT,
  ADD COLUMN "bank_instructions" TEXT;

DROP TABLE IF EXISTS "payments";
DROP TYPE IF EXISTS "PaymentStatus";
```

- [ ] **Step 6: Apply + regenerate**
```bash
npx prisma migrate dev --name manual_payment_pivot
npx prisma generate
```
Expected: migration applies; client regenerates. (Build will be red until Task 10 — expected.)

- [ ] **Step 7: Commit**
```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): collapse appointment states to 4; drop Payment; bank settings"
```

---

## Task 3: State machine — 4-state transition map

**Files:**
- Modify: `server/src/modules/appointment/service.js:280-290` (`LEGAL`)
- Test: `server/test/unit/modules/appointment/transition.test.js`

**Interfaces:**
- Produces: legal transitions `pending→{confirmed,cancelled}`, `confirmed→{completed,cancelled}`.

- [ ] **Step 1: Write failing test**
```js
import { describe, it, expect } from 'vitest';
import { LEGAL } from '#src/modules/appointment/service.js';
// (export LEGAL for testability)
describe('LEGAL transitions (manual-payment)', () => {
  it('pending → confirmed and cancelled only', () => {
    expect([...LEGAL.pending]).toEqual(expect.arrayContaining(['confirmed', 'cancelled']));
    expect(LEGAL.pending.has('completed')).toBe(false);
  });
  it('confirmed → completed and cancelled only', () => {
    expect([...LEGAL.confirmed].sort()).toEqual(['cancelled', 'completed']);
  });
  it('completed and cancelled are terminal', () => {
    expect(LEGAL.completed).toBeUndefined();
    expect(LEGAL.cancelled).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`LEGAL` not exported / old map). `npm test -- transition`

- [ ] **Step 3: Replace the `LEGAL` map and export it**
```js
export const LEGAL = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
};
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit** `git commit -am "feat(appointments): 4-state transition map"`

---

## Task 4: lockSlot → `pending` + snapshot fee at lock; simplify reclaim

**Files:**
- Modify: `server/src/modules/appointment/service.js:172-277`
- Test: `server/test/integration/booking.test.js` (rewrite)

**Interfaces:**
- Consumes: `LEGAL` (Task 3).
- Produces: `lockSlot()` returns an appointment in state `pending` with `feeAtBooking` set; no `lockExpiresAt`.

- [ ] **Step 1: Write/rewrite the failing test** (booking creates `pending` + fee, no gateway):
```js
it('lock creates a pending appointment with feeAtBooking and no payment redirect', async () => {
  const r = await agent.post('/api/appointments/lock').send(lockBody).expect(201);
  const appt = await prisma.appointment.findUnique({ where: { id: r.body.id } });
  expect(appt.state).toBe('pending');
  expect(appt.feeAtBooking).toBe(doctorFee);
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Edit `lockSlot`** — set `state: 'pending'`, snapshot the fee, drop `lockExpiresAt`. Replace the `data` block + the Single-Lock/overlap queries' `'slot_locked'` references with `'pending'`:
```js
  const doctorFee = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { fee: true } });
  const data = {
    doctorId, patientUserId, slotStart: slotStartDate, slotEnd,
    state: 'pending',
    feeAtBooking: doctorFee.fee,
    forSelf,
    subjectName: subject?.name ?? null,
    subjectAge: subject?.age ?? null,
    subjectRelation: subject?.relation ?? null,
  };
```
Update the Single-Lock query to `state: 'pending'` (no `lockExpiresAt`); update No-Overlap to drop the `NOT lockExpiresAt` clause.

- [ ] **Step 4: Simplify `createWithReclaim`** — with no auto-expiry, a unique-index `P2002` is simply `SLOT_TAKEN` (no expired-lock reclaim, no Payment inspection):
```js
async function createWithReclaim(data) {
  try {
    return await prisma.appointment.create({ data });
  } catch (e) {
    if (e?.code === 'P2002') throw new AppError('SLOT_TAKEN', 'That slot was just taken.', 409);
    throw e;
  }
}
```
Update the call site to `createWithReclaim(data)`.

- [ ] **Step 5: Update `ACTIVE_APPOINTMENT_STATES`** (top of file) to `['pending','confirmed','completed']` (drop the removed states).

- [ ] **Step 6: Run → PASS** `npm test -- booking`

- [ ] **Step 7: Commit** `git commit -am "feat(booking): pending lock + fee snapshot at lock; drop auto-expiry reclaim"`

---

## Task 5: Repurpose `POST /:id/pay` → submit bank reference + notify admin

**Files:**
- Modify: `server/src/modules/appointment/service.js` (add `submitPaymentReference`)
- Modify: `server/src/modules/appointment/controller.js:17-28` (`pay`)
- Modify: `server/src/modules/notification/service.js` (add `enqueuePaymentSubmittedAdmin`)
- Modify: shared schemas — add `payRefSchema` (`{ reference: string min 3 }`)
- Test: `server/test/integration/booking.test.js`

**Interfaces:**
- Produces: `submitPaymentReference({ patientUserId, appointmentId, reference })` → `{ ok: true }`; sets `paymentReference` + `paymentSubmittedAt`; enqueues admin email + writes a `payment.submitted` audit row (alert source).

- [ ] **Step 1: Failing test**
```js
it('pay submits a bank reference, stays pending, and enqueues an admin email', async () => {
  const { id } = (await agent.post('/api/appointments/lock').send(lockBody).expect(201)).body;
  await agent.post(`/api/appointments/${id}/pay`).send({ reference: 'TXN-12345' }).expect(200);
  const appt = await prisma.appointment.findUnique({ where: { id } });
  expect(appt.state).toBe('pending');
  expect(appt.paymentReference).toBe('TXN-12345');
  const jobs = await prisma.notificationJob.findMany({ where: { appointmentId: id, type: 'payment_submitted_admin' } });
  expect(jobs).toHaveLength(1);
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Add `submitPaymentReference` to `appointment/service.js`**
```js
export async function submitPaymentReference({ patientUserId, appointmentId, reference }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.patientUserId !== patientUserId) {
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'pending') {
    throw new AppError('INVALID_STATE', 'This booking is no longer awaiting payment.', 409);
  }
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { paymentReference: reference, paymentSubmittedAt: new Date() },
  });
  await audit.record({
    eventType: 'payment.submitted', actorType: 'patient', actorId: patientUserId,
    targetRef: appointmentId, meta: { reference },
  });
  await notification.enqueuePaymentSubmittedAdmin({ appointment: appt, reference }).catch(() => {});
  return { ok: true };
}
```

- [ ] **Step 4: Add `enqueuePaymentSubmittedAdmin` to `notification/service.js`**
```js
export async function enqueuePaymentSubmittedAdmin({ appointment, reference, now = new Date(), client = prisma }) {
  const admin = await client.user.findFirst({ where: { role: 'admin' }, select: { email: true } });
  if (!admin) return;
  await enqueue({
    type: 'payment_submitted_admin',
    appointmentId: appointment.id,
    recipientEmail: admin.email,
    scheduledFor: now,
    vars: { appointmentRef: appointment.id, reference, reviewUrl: `${env.APP_BASE_URL}/admin/records` },
    client,
  });
}
```

- [ ] **Step 5: Rewrite controller `pay`**
```js
export async function pay(req, res, next) {
  try {
    res.json(await appointmentService.submitPaymentReference({
      patientUserId: req.session.userId,
      appointmentId: req.params.id,
      reference: req.body.reference,
    }));
  } catch (e) { next(e); }
}
```
Remove the `paymentService` import. Add `validate(payRefSchema)` to the `/:id/pay` route in `appointment/index.js`.

- [ ] **Step 6: Add `payRefSchema`** to the shared schemas (mirror existing schema style): `z.object({ reference: z.string().trim().min(3).max(120) })`.

- [ ] **Step 7: Run → PASS** ; **Commit** `git commit -am "feat(payment): manual bank-reference submit + admin notify"`

---

## Task 6: Admin accept / reject endpoints

**Files:**
- Modify: `server/src/modules/appointment/service.js` (add `adminDecision`)
- Modify: `server/src/modules/admin/controller.js` (add `acceptAppointment`, `rejectAppointment`)
- Modify: `server/src/modules/admin/index.js` (routes)
- Modify: `server/src/modules/notification/service.js` (`enqueueBookingConfirmation`, `enqueuePaymentNotReceived`)
- Test: `server/test/integration/admin.test.js`

**Interfaces:**
- Produces: `adminDecision({ appointmentId, accept, actorId })`; accept → `transition(pending→confirmed)` + booking-confirmation email; reject → `transition(pending→cancelled)` + payment-not-received email.

- [ ] **Step 1: Failing tests**
```js
it('admin accept moves pending → confirmed + enqueues booking confirmation', async () => {
  await adminAgent.post(`/api/admin/appointments/${id}/accept`).expect(200);
  expect((await prisma.appointment.findUnique({ where: { id } })).state).toBe('confirmed');
  expect(await prisma.notificationJob.count({ where: { appointmentId: id, type: 'booking_confirmation' } })).toBe(1);
});
it('admin reject moves pending → cancelled (frees slot) + payment_not_received email', async () => {
  await adminAgent.post(`/api/admin/appointments/${id}/reject`).expect(200);
  expect((await prisma.appointment.findUnique({ where: { id } })).state).toBe('cancelled');
  expect(await prisma.notificationJob.count({ where: { appointmentId: id, type: 'payment_not_received' } })).toBe(1);
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Add `adminDecision`** to `appointment/service.js`
```js
export async function adminDecision({ appointmentId, accept, actorId }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (appt.state !== 'pending') throw new AppError('INVALID_TRANSITION', 'Only pending appointments can be reviewed.', 409);
  if (accept) {
    await self.transition({ appointmentId, to: 'confirmed', actorType: 'admin', actorId });
    const [patient, doctor] = await Promise.all([
      prisma.user.findUnique({ where: { id: appt.patientUserId }, select: { email: true, fullName: true } }),
      prisma.doctor.findUnique({ where: { id: appt.doctorId }, select: { user: { select: { fullName: true } } } }),
    ]);
    await notification.enqueueBookingConfirmation({ appointment: appt, patient, doctorName: doctor.user.fullName, fee: appt.feeAtBooking }).catch(() => {});
    // KPI #1 conversion event — moved here from the deleted confirmPaidAppointment. Best-effort.
    await analytics.record({ type: 'booking_confirmed', meta: { doctorId: appt.doctorId, fee: appt.feeAtBooking } }).catch(() => {});
    return { state: 'confirmed' };
  }
  await self.transition({ appointmentId, to: 'cancelled', actorType: 'admin', actorId, reason: 'payment not received' });
  await notification.enqueuePaymentNotReceived({ appointment: appt }).catch(() => {});
  return { state: 'cancelled' };
}
```

- [ ] **Step 4: Add notification producers** (`enqueueBookingConfirmation` = the booking_confirmation + reminder cadence, reusing the existing `enqueueBookingEmails` body renamed; `enqueuePaymentNotReceived` = single `payment_not_received` row). Reuse `slotStartLocal`.

- [ ] **Step 5: Add controller + routes**
```js
// admin/controller.js
export async function acceptAppointment(req, res, next) {
  try { res.json(await appointmentService.adminDecision({ appointmentId: req.params.id, accept: true, actorId: req.session.userId })); }
  catch (e) { next(e); }
}
export async function rejectAppointment(req, res, next) {
  try { res.json(await appointmentService.adminDecision({ appointmentId: req.params.id, accept: false, actorId: req.session.userId })); }
  catch (e) { next(e); }
}
```
```js
// admin/index.js
adminRouter.post('/appointments/:id/accept', requireRole('admin'), adminWriteLimiter, c.acceptAppointment);
adminRouter.post('/appointments/:id/reject', requireRole('admin'), adminWriteLimiter, c.rejectAppointment);
```

- [ ] **Step 6: Run → PASS** ; **Commit** `git commit -am "feat(admin): accept/reject pending appointments"`

---

## Task 7: Cancellation without refund

**Files:**
- Modify: `server/src/modules/appointment/service.js:468-525` (`cancel`)
- Test: `server/test/integration/booking.test.js`

**Interfaces:**
- Produces: `cancel({ appointmentId, actorType, actorId, reason })` → `{ state: 'cancelled' }` from `pending` or `confirmed`; no refund; enqueues a cancellation email.

- [ ] **Step 1: Failing test**
```js
it('patient cancels a confirmed appointment → cancelled, no refund logic', async () => {
  const r = await agent.post(`/api/appointments/${id}/cancel`).send({ reason: 'changed mind' }).expect(200);
  expect(r.body.state).toBe('cancelled');
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Replace `cancel` body** (drop `FREE_CANCEL_MS`, refund, doctor/patient split into one `cancelled`):
```js
export async function cancel({ appointmentId, actorType, actorId, reason }) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (actorType === 'patient' && appt.patientUserId !== actorId)
    throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  if (actorType === 'doctor') {
    const doctor = await prisma.doctor.findUnique({ where: { userId: actorId }, select: { id: true } });
    if (!doctor || doctor.id !== appt.doctorId) throw new AppError('NOT_FOUND', 'Appointment not found.', 404);
  }
  if (appt.state !== 'pending' && appt.state !== 'confirmed')
    throw new AppError('INVALID_TRANSITION', 'This appointment cannot be cancelled.', 409);
  await self.transition({ appointmentId, to: 'cancelled', actorType, actorId, reason: reason ?? null });
  await enqueueCancellationEmail(appt, 'cancellation').catch(() => {});
  return { state: 'cancelled' };
}
```

- [ ] **Step 4: Simplify `enqueueCancellationEmail`** — drop the `payment`/`refund*` vars (no Payment table); keep patient/doctor/slot vars.

- [ ] **Step 5: Run → PASS** ; **Commit** `git commit -am "feat(cancel): single cancelled state, no refund"`

---

## Task 8: Prescription gate — keep `completed`, drop `prescription_issued`

**Files:**
- Modify: `server/src/modules/prescription/service.js:35,92-95`
- Test: `server/test/integration/prescription.test.js`

**Interfaces:**
- Produces: prescriptions allowed only when `appt.state === 'completed'`; issuing does NOT change appointment state.

- [ ] **Step 1: Failing test** — issuing a prescription on a `completed` appointment succeeds and leaves state `completed`:
```js
it('prescription allowed on completed; state stays completed', async () => {
  await prisma.appointment.update({ where: { id }, data: { state: 'completed' } });
  await doctorAgent.post(`/api/appointments/${id}/prescriptions`).send(rxBody).expect(201);
  expect((await prisma.appointment.findUnique({ where: { id } })).state).toBe('completed');
});
```

- [ ] **Step 2: Run → FAIL** (old code transitions to `prescription_issued`)

- [ ] **Step 3: Edit `prescription/service.js`** — line 35 gate becomes `if (appt.state !== 'completed')`; delete the `if (appt.state === 'completed') { transition → prescription_issued }` block (lines ~92-95) so issuing leaves state unchanged.

- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(prescription): gate on completed, drop prescription_issued"`

---

## Task 9: Slim cron — time-based completion + email outbox only

**Files:**
- Modify: `server/src/modules/appointment/service.js` (replace `evaluateDueAppointments` with `completeDueAppointments`)
- Modify: `server/src/workers/index.js`
- Test: `server/test/unit/modules/appointment/completion.test.js`

**Interfaces:**
- Produces: `completeDueAppointments(now)` → transitions `confirmed` rows with `now ≥ slotEnd + VIDEO_TOKEN_POST_MIN` to `completed`; leaves `pending` untouched.

- [ ] **Step 1: Failing tests**
```js
it('completes a confirmed appointment past slotEnd+POST_MIN', async () => {
  await completeDueAppointments(new Date(slotEnd.getTime() + 6 * 60000));
  expect((await prisma.appointment.findUnique({ where: { id: confirmedId } })).state).toBe('completed');
});
it('does NOT complete a pending appointment past its slot', async () => {
  await completeDueAppointments(new Date(slotEnd.getTime() + 6 * 60000));
  expect((await prisma.appointment.findUnique({ where: { id: pendingId } })).state).toBe('pending');
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Replace `evaluateDueAppointments`/`activateDue`/`resolveInProgress`/`resolveNoShow`** with:
```js
export async function completeDueAppointments(now = new Date()) {
  const cutoffMs = VIDEO_TOKEN_POST_MIN * 60000;
  const due = await prisma.appointment.findMany({ where: { state: 'confirmed' } });
  for (const a of due) {
    if (now.getTime() < a.slotEnd.getTime() + cutoffMs) continue;
    try {
      await self.transition({ appointmentId: a.id, to: 'completed', actorType: 'system' });
    } catch (e) {
      logger.error('completion failed; retry next tick', { appointmentId: a.id, err: String(e) });
    }
  }
}
```
(Import `VIDEO_TOKEN_POST_MIN` from constants if not already.)

- [ ] **Step 4: Rewrite `workers/index.js`**
```js
import cron from 'node-cron';
import { completeDueAppointments } from '../modules/appointment/service.js';
import { dispatchDueNotifications } from '../modules/notification/service.js';
import { logger } from '../lib/logger/logger.js';
const tick = (name, fn) => async () => { try { await fn(new Date()); } catch (e) { logger.error(`${name} tick failed`, { err: String(e) }); } };
export function startWorkers() {
  cron.schedule('* * * * *', tick('appointment-completion', completeDueAppointments));
  cron.schedule('* * * * *', tick('notification-dispatch', dispatchDueNotifications));
  logger.info('workers started: appointment-completion, notification-dispatch (* * * * *)');
}
```

- [ ] **Step 5: Set `SENDABLE_STATES`** in `notification/service.js` to `new Set(['confirmed'])`.

- [ ] **Step 6: Run → PASS**, then **run the full suite** (`npm test`) — Tasks 2–9 should now be green except code still importing deleted-but-not-yet-removed payment symbols (handled next). Fix any stragglers. **Commit** `git commit -am "feat(workers): time-based completion; 2-job cron"`

---

## Task 10: Notification templates + merge-vars

**Files:**
- Modify: `server/src/integrations/email/templates.js`
- Test: `server/test/integration/notification.test.js`

**Interfaces:**
- Produces: templates for `payment_submitted_admin`, `payment_not_received`; `booking_confirmation` retained; refund/dispute templates removed.

- [ ] **Step 1: Failing test** — `emailProvider.send({ template: 'payment_submitted_admin', ... })` renders subject/body with `reference` + `reviewUrl`; `payment_not_received` renders.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Add the two templates** (follow the existing `templates.js` shape — subject + html using `vars`). Remove `refund_confirmation`, `refund_delayed`, `cancellation_apology` if now unused (keep `cancellation`).
- [ ] **Step 4: Run → PASS** ; **Commit** `git commit -am "feat(email): payment_submitted_admin + payment_not_received templates"`

---

## Task 11: Delete the payment module + gateway routes

**Files:**
- Delete: `server/src/modules/payment/{service,controller,index}.js`, `server/src/integrations/payment/`
- Modify: `server/src/routes.js` (drop `paymentWebhookRouter`, `paymentReturnRouter`, `devCheckoutRouter` mounts + imports)
- Delete: `server/src/dev/devCheckout.js`
- Delete tests: `server/test/unit/modules/payment/service.test.js`, `server/test/unit/integrations/payment/payfast.mock.test.js`

- [ ] **Step 1: Remove the route mounts + imports** in `routes.js` (lines mounting payfast webhook, verify-return, `/dev` checkout).
- [ ] **Step 2: Delete the files** above.
- [ ] **Step 3: Grep for stragglers** `grep -rn "modules/payment\|integrations/payment\|paymentProvider\|verifyReturn" server/src` → fix/remove each.
- [ ] **Step 4: Run full suite → PASS** `npm test`
- [ ] **Step 5: Commit** `git commit -am "chore: delete PayFast gateway + payment module"`

---

## Task 12: Delete refund / dispute / reconcile code

**Files:**
- Modify: `server/src/modules/appointment/service.js` — delete `quoteRefund`, `initiateRefund`, `safeRefund`, `enqueueRefundDelayed`, `retryDueRefunds`, `fallbackFee`, `setDisputed`.
- Modify: `server/src/modules/appointment/controller.js` — delete `dispute`.
- Modify: `server/src/modules/appointment/index.js` — delete `/:id/dispute` route + `disputeSchema` import.
- Modify: `server/src/modules/admin/{controller,index}.js` — delete `recordRefund` + `/payments/:appointmentId/record-refund` route + `recordManualRefund` in admin service.
- Modify: `server/src/config/constants.js` — drop `REFUND_*`, `RECONCILIATION_*`.

- [ ] **Step 1: Delete the symbols/routes above.**
- [ ] **Step 2: Grep stragglers** `grep -rn "safeRefund\|initiateRefund\|quoteRefund\|setDisputed\|disputed\|recordRefund\|retryDueRefunds" server/src` → resolve.
- [ ] **Step 3: Run full suite → PASS**
- [ ] **Step 4: Commit** `git commit -am "chore: delete refund + dispute + reconcile code"`

---

## Task 13: Delete no-show / Daily-webhook / join tracking

**Files:**
- Modify: `server/src/modules/video/service.js` — delete `recordJoinFromDailyEvent`; `issueAppointmentToken` ACTIVE → `['confirmed']`; `joinSimUrl` always `null`.
- Modify: `server/src/modules/video/{controller,index}.js` — delete the `daily` webhook handler + `videoWebhookRouter`.
- Modify: `server/src/routes.js` — drop `videoWebhookRouter` mount.
- Modify: `server/src/integrations/video/daily.js` — delete `verifyWebhook`.
- Delete: `server/scripts/register-daily-webhook.mjs`.
- Modify: `server/src/config/env/env.js` — drop `DAILY_WEBHOOK_SECRET`.
- Delete/rewrite tests: webhook tests in `server/test/integration/video.test.js`, `daily.mock.test.js`.

- [ ] **Step 1: Remove the symbols/routes/files above.**
- [ ] **Step 2: Grep** `grep -rn "recordJoin\|webhooks/daily\|verifyWebhook\|DAILY_WEBHOOK_SECRET\|JoinedAt" server/src` → resolve.
- [ ] **Step 3: Run full suite → PASS**
- [ ] **Step 4: Commit** `git commit -am "chore: delete no-show lifecycle + Daily participant webhook"`

---

## Task 14: Dev simulators + Vite proxy cleanup

**Files:**
- Modify: `server/src/dev/devVideo.js` — delete `/video/event`, `/video/join` (join-sim); repoint `/worker/evaluate` to `completeDueAppointments`.
- Modify: `server/src/dev/devWorkers.js` — delete `/worker/refund-retry`, `/worker/reconcile` (keep `/worker/notifications`).
- Modify: `server/src/routes.js` — keep the `/dev` mounts only for surviving routes.
- Modify: `client/vite.config.js` — keep `/dev` proxy only if a `/dev` route remains; else remove.
- Modify: `client/src/modules/video/useVideo.js` / `VideoRoom.jsx` — `recordJoin` becomes a no-op path (joinSimUrl always null) — Plan 2 covers UI, but remove the dead fetch here if trivial.

- [ ] **Step 1: Apply the edits.**
- [ ] **Step 2: Run full suite → PASS** ; lint `npm run lint`
- [ ] **Step 3: Commit** `git commit -am "chore: trim dev simulators + dev proxy"`

---

## Task 15: Full green sweep + e2e

**Files:**
- Rewrite: `e2e/tests/j1-book-pay-confirm.spec.js` (manual flow → admin accept), `e2e/tests/j2-video-lifecycle.spec.js` (no no-show/join).
- Delete e2e: `e2e/tests/j10-pending-hold-recovery.spec.js` (lock auto-expiry gone).
- **Delete server integration tests** (their subjects are deleted): `server/test/integration/reconcileRefund.test.js`, `server/test/integration/paymentFailed.test.js`, `server/test/integration/reclaimSafety.test.js` (Payment-based reclaim is obsolete — Task 4 simplified reclaim).
- **Update** `server/test/integration/doubleBooking.test.js` — replace `slot_locked` literals with `pending`; keep the unique-active-slot assertions.
- **Update** `server/test/integration/admin.test.js` — accept/reject (Task 6), records without refund/dispute (Plan 2 F1); drop dispute/record-refund cases.

- [ ] **Step 1: Rewrite j1** — book → submit reference → admin accept → confirmed; assert no `/dev/checkout`.
- [ ] **Step 2: Rewrite j2** — confirmed → join room (free tier) → time-complete → prescribe.
- [ ] **Step 3: Delete j10.**
- [ ] **Step 4: Run** `npm test` (server+client) and `npm run test:e2e` → all green; `npm run lint` clean; `npm run build:client` clean.
- [ ] **Step 5: Commit** `git commit -am "test: rewrite e2e for manual-payment flow"`

---

## Self-Review

**Spec coverage (design §): ** deletions (§4) → T11–T14; data model (§5) → T2; state machine (§6) → T3; flows (§7) → T4 (book), T5 (pay), T6 (admin), T7 (cancel), prescribe (T8); endpoints (§8) → T5/T6/T12/T13; notifications (§9) → T5/T6/T10; cron (§10) → T9; testing (§15) → folded per task + T15. **Gap check:** the §9 "prescription ready" email is unchanged (existing) — no task needed. Bank-settings *write* UI is Plan 2; the columns + read are in T2/T6. ✅

**Placeholder scan:** no TBD/TODO; deletion tasks name exact symbols + a grep gate. ✅

**Type consistency:** `submitPaymentReference`, `adminDecision`, `completeDueAppointments`, `enqueuePaymentSubmittedAdmin`, `enqueueBookingConfirmation`, `enqueuePaymentNotReceived`, `LEGAL` used consistently across tasks. `transition()` signature matches `appointment/service.js:299`. ✅

## Notes / risks

- **Coordinated core (T2–T10):** the schema migration transiently reds the build; green is restored by T10. Run the full suite at T10 and after each deletion task.
- The `enqueueBookingConfirmation` reuses the existing `enqueueBookingEmails` body (confirmation + reminder cadence) — rename or wrap rather than duplicating (DRY).
- Shared-schema file location: schemas live under `shared/schemas/` (per-domain). Add `payRefSchema` next to the appointment schemas; confirm the export barrel.
- Dev-DB rows in removed states are remapped by the Task 2 migration `CASE`. Verify on a seeded DB before relying on it.

---

## Addendum (review-pass additions)

### Task 16: Rewrite the baseline seed

**Files:** `prisma/scripts/seed-baseline.js` (`prisma/seed.js` needs NO change — it seeds only admin + doctors, no payments/appointments).

- [ ] **Step 1:** Remove `prisma.payment.deleteMany()` and every `prisma.payment.create(...)`.
- [ ] **Step 2:** Rewrite the four appointment fixtures for the 4-state model:
  - keep **1 confirmed in the join window** (`state: 'confirmed'`, fee via `feeAtBooking`);
  - change the prescription fixture from `prescription_issued` → **`completed`** (`feeAtBooking` set) + its linked prescription;
  - replace the two cancel-refund/cancel-no-refund Payment fixtures with **1 `pending` with a `paymentReference`** (for the admin review queue) and **1 `cancelled`**;
  - set `feeAtBooking` on each (snapshot-at-lock); drop all `lockExpiresAt`.
- [ ] **Step 3:** Update the file header comment block (it documents the old states/Payments).
- [ ] **Step 4: Run** `node --env-file=.env.example.dev prisma/scripts/seed-baseline.js` against a migrated dev DB → succeeds; verify the seeded states.
- [ ] **Step 5: Commit** `git commit -am "chore(seed): baseline fixture for 4-state manual-payment model"`

### Task 17: Env + config cleanup (explicit)

**Files:** `server/src/config/env/env.js`, `server/src/config/constants.js`

- [ ] **Step 1:** Remove from `env.js`: `PAYMENT_PROVIDER`, `PAYFAST_MERCHANT_ID`, `PAYFAST_SECURED_KEY`, `PAYFAST_MERCHANT_NAME`, `PAYFAST_STORE_ID`, `PAYFAST_PASSPHRASE`, `PAYFAST_MODE`, `DAILY_WEBHOOK_SECRET`. Keep `VIDEO_PROVIDER` (room/token only) + `DAILY_API_KEY`/`DAILY_DOMAIN`.
- [ ] **Step 2:** In `routes.js`, the `env.PAYMENT_PROVIDER === 'mock'` dev-checkout mount is already removed (Task 11/14); confirm no other `env.PAYMENT_PROVIDER` reader remains (`grep -rn "PAYMENT_PROVIDER\|PAYFAST_" server/src`).
- [ ] **Step 3:** Update `.env.example`, `.env.example.dev` to drop the same keys.
- [ ] **Step 4: Commit** `git commit -am "chore(config): drop PayFast/payment-provider/daily-webhook env"`

### Task 18: Drop orphaned Settings fallback-fee columns (optional but clean)

**Files:** `prisma/schema.prisma` (Settings), migration, `prisma/scripts/seed-baseline.js`/`prisma/seed.js` (if they set these)

- [ ] **Step 1:** Remove `fallbackFeePctBps` + `fallbackFeeFixed` from the `Settings` model (only the deleted `quoteRefund`/`fallbackFee` used them). Add `DROP COLUMN` to the Task 2 migration (or a follow-up migration).
- [ ] **Step 2:** Remove these keys from any seed that sets them.
- [ ] **Step 3: Run** `npx prisma migrate dev` + full suite → green. **Commit.**

### Note for Task 6 (adminDecision)

Ensure `appointment/service.js` imports the analytics module (`import * as analytics from '../analytics/service.js';`) — the `booking_confirmed` event moved here from the deleted `confirmPaidAppointment`.
