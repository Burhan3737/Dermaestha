# Slice E — M1/M2 Closure (Workers, Outbox, Fidelity Fixes) — Design

| Field      | Value                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date       | 2026-06-11                                                                                                                                                     |
| Status     | Approved (brainstorming output); plan + build pending                                                                                                          |
| Slice      | E of 8 planned (first of the four v1-completion slices E→F→G→H)                                                                                                |
| Depends on | Slices A–D — all merged to `main` (180 tests green)                                                                                                            |
| Canon refs | F04.03, F06.03, F07, doc 02 edges #6/#6a/#30/#31, doc 05 §4/§5, doc 14 §2/§4 (PaymentProvider/EmailProvider), doc 15 §3 (worker cadence), ADR-08/22/23/25; gap report `docs/superpowers/reports/2026-06-09-m1-m2-spec-gap-report.md` (G1–G5, Part 2) |

---

## 1. Scope & goals

**Goal:** M1 and M2 are complete against the spec — every F01–F09/F15 data flow that does not require a real vendor account is built, tested, and green.

**In scope**

1. **Notification outbox + dispatch worker (F07):** all six §3.4 trigger types routed through one persistent `NotificationJob` queue with retry/backoff (F07.03), reminder cadence + short-lead skip (F07.02), and the invalidation re-check rule; plus the edge-#30 refund-delay email.
2. **Refund-retry worker (F06.03, fixes gap G1):** refund failures become visible (`refundStatus` set on the failure path), auto-retried with exponential backoff, audit-alerted on exhaustion (edge #30; No-Manual-Refund rule).
3. **Reconciliation worker (F04.03):** hourly safety net for lost PayFast IPNs, completing the same atomic commit as the webhook path; edge #6a (slot already taken → full auto-refund to the paying patient).
4. **Fidelity fixes G2–G5** (gap report Part 1): active-doctor check on slots/booking (#9), date-bounded doctor "today" scope (F05.02), forgot-password timing equalization (hardening), expired-lock exclusion in the availability-replace guard (edge #14 / ADR-23).
5. **Real Resend email adapter** with boot-time key-based fallback: `RESEND_API_KEY` present → real sends; absent → console adapter + loud warning. No code change needed when the key arrives.

**Out of scope (lands in later slices — see §13 roadmap)**

- Real PayFast network adapter + real Daily.co adapter/webhook signature (Slice H).
- Admin alert-feed UI (Slice G) — Slice E only **produces** the alert audit rows it will read.
- Analytics/KPI events (Slice H).
- F08 prescriptions (Slice F), admin panel (Slice G), landing/legal (Slice H).
- SMS/WhatsApp and all doc 13 v1.1/v1.2+ deferrals.

**Success criteria**

1. Existing 180 tests stay green; every new behavior lands test-first.
2. A `payment.success` IPN that is never delivered no longer strands a paid appointment: the hourly reconciliation pass confirms it (or refunds per #6a) within `RECONCILIATION_LOOKBACK_H`.
3. A failed refund is never silent: `refundStatus` reflects `retrying`/`failed`, retries follow backoff, exhaustion produces an audit alert row + patient delay email.
4. Reminders dispatch at slot−24h / slot−1h Karachi-correct, skip when short-lead, and are suppressed when the appointment leaves `confirmed` before send time.
5. Doc 13's M1/M2 checklists contain no unchecked item that is not explicitly a vendor-credential item.

---

## 2. Architecture & components

```
event paths (in-transaction enqueue — the outbox guarantee)
  payment webhook $transaction ──► notification.enqueue(tx, booking_confirmation, now)
                                ├► notification.enqueue(tx, reminder_24h, slot−24h)   [skip if <24h lead]
                                └► notification.enqueue(tx, reminder_1h,  slot−1h)    [skip if <1h lead]
  cancellation flows ───────────► enqueue(refund_confirmation | cancellation_apology, now)
  refund-retry exhaustion ──────► enqueue(refund_delayed, now)

node-cron (single-instance, in-process — ADR-08)
  * * * * *  dispatch worker ──► due pending jobs ──► invalidation re-check ──► emailProvider.send()
                                   └ fail: attempts++, backoff; at EMAIL_MAX_ATTEMPTS → failed + audit alert
  * * * * *  refund-retry ─────► payments(refundStatus=retrying, nextRefundRetryAt≤now) ──► initiateRefund (idempotent)
                                   └ at REFUND_MAX_ATTEMPTS → failed + audit alert + refund_delayed email
  0 * * * *  reconciliation ───► pending payments (1h<age<24h) ──► paymentProvider.queryPaymentStatus()
                                   ├ paid → same atomic confirm path as webhook (idempotent)
                                   ├ paid + slot taken (#6a) → full refund + audit alert
                                   └ mismatch → audit alert

emailProvider barrel: RESEND_API_KEY ? resend.js : console.dev.js (+ warning)
```

**Design principles.** (1) The outbox row and the state change that promises it commit in the same `$transaction` — a crash between commit and send can never lose an email, and the PayFast webhook ack no longer waits on an email send. (2) Workers are thin drivers over pure, clock-injected service functions (`dispatchDueNotifications(now)`, `retryDueRefunds(now)`, `reconcileUnconfirmed(now)`) — the pattern ADR-25 established. (3) `appointmentState.service.transition` stays the only `Appointment.state` writer; reconciliation calls the existing webhook-confirm service, never writes state itself.

---

## 3. Schema change (one migration)

**New enum + model** (doc 04 cascade):

```prisma
enum NotificationType {
  booking_confirmation
  reminder_24h
  reminder_1h
  prescription_ready
  refund_confirmation
  cancellation_apology
  refund_delayed        // edge #30 patient delay notice
}

enum NotificationStatus {
  pending
  sent
  failed      // retry-exhausted; audit alert row written
  suppressed  // invalidation rule outcome (F07.03)
}

model NotificationJob {
  id             String             @id @default(cuid())
  type           NotificationType
  appointmentId  String             @map("appointment_id")
  appointment    Appointment        @relation(fields: [appointmentId], references: [id])
  recipientEmail String             @map("recipient_email")
  scheduledFor   DateTime           @map("scheduled_for") @db.Timestamptz(6)
  status         NotificationStatus @default(pending)
  attempts       Int                @default(0)
  nextAttemptAt  DateTime?          @map("next_attempt_at") @db.Timestamptz(6)
  lastError      String?            @map("last_error")
  sentAt         DateTime?          @map("sent_at") @db.Timestamptz(6)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)

  /// Idempotent enqueue: webhook replay / re-confirmation cannot duplicate a job.
  /// prescription_ready (Slice F) may need this relaxed to per-prescription — migrate then (YAGNI now).
  @@unique([appointmentId, type])
  @@index([status, scheduledFor])
  @@map("notification_jobs")
}
```

**`Payment` additions** (retry bookkeeping; `RefundStatus` already has `retrying`/`failed`):

```prisma
refundAttempts    Int       @default(0)  @map("refund_attempts")
nextRefundRetryAt DateTime? @map("next_refund_retry_at") @db.Timestamptz(6)
```

`recipientEmail` is a snapshot at enqueue time (no PHI beyond what `appointments`/`users` already hold). No other model changes.

---

## 4. Notification service & outbox — `server/src/modules/notification/`

- `enqueue(type, appointment, { tx, scheduledFor })` — creates the job row; accepts an optional transaction client so event emails join the caller's `$transaction`. Upsert-shaped against `@@unique([appointmentId, type])` so replays are no-ops.
- **Short-lead skip rule (F07.02)** lives at enqueue: `slotStart − now < 24h` → no `reminder_24h` row; `< 1h` → no `reminder_1h` row.
- **Callers (migration of existing sends):** payment webhook commit (confirmation + both reminders, in-transaction), patient/doctor cancellation (refund_confirmation / cancellation_apology), refund-retry exhaustion (refund_delayed), forgot-password is **not** outboxed (auth reset has its own token-lifetime semantics; see G4 in §6). Slice C's direct post-commit `emailProvider.send()` calls are removed — one send path remains.
- Template rendering uses the doc 14 merge-vars per trigger type; all times formatted `Asia/Karachi` (F07.02 timezone rule).

### Dispatch worker (minute cron)

Per tick, `dispatchDueNotifications(now)`:

1. Claim batch: `status=pending AND scheduledFor≤now AND (nextAttemptAt IS NULL OR nextAttemptAt≤now)` — claimed via an atomic status flip so an accidental double-start cannot double-send.
2. **Invalidation re-check (F07.03):** for `reminder_24h`/`reminder_1h`, reload the appointment; state ∉ {`confirmed`,`in_progress`} → mark `suppressed`, never send.
3. Render → `emailProvider.send()`. Success → `sent`+`sentAt`. Failure → `attempts++`, `nextAttemptAt = now + EMAIL_BACKOFF_BASE_SEC × 2^attempts`; at `EMAIL_MAX_ATTEMPTS` (3, F07.03) → `failed` + audit row `email.send_failed_final` (targetRef = appointment; the Slice G alert feed's data source).
4. Per-job try/catch — one poisoned row cannot starve the batch or kill the tick.

---

## 5. Money workers

### 5a. Refund-retry worker (minute cron) + G1 fix

- **G1 fix in the refund side-effect path:** on provider error, set `refundStatus='retrying'`, `refundAttempts++`, `nextRefundRetryAt = now + REFUND_BACKOFF_BASE_SEC × 2^attempts` (the existing constants finally gain consumers). The dashboard refund-status view (edge #31) now reflects reality.
- `retryDueRefunds(now)`: poll `refundStatus='retrying' AND nextRefundRetryAt≤now`, re-call `initiateRefund` — already idempotency-keyed (#10), so a double-settle is impossible even against the reconciliation path or an admin's out-of-band action.
- At `REFUND_MAX_ATTEMPTS` (5): `refundStatus='failed'`, audit row `payment.refund_exhausted`, enqueue `refund_delayed`. Per the No-Manual-Refund rule (F12.02) recovery is admin-out-of-band; idempotency makes that safe.

### 5b. Reconciliation worker (hourly cron) — F04.03

- **Adapter contract change (doc 14):** `PaymentProvider` gains `queryPaymentStatus(intentRef) → { status: 'paid'|'failed'|'unknown', providerRef?, gatewayFee? }`. `payfast.mock` implements it against its own records; `payfast.stub` documents it (throws) for the Slice H real adapter.
- `reconcileUnconfirmed(now)`: for `status='pending'` payments aged between `RECONCILIATION_MIN_AGE_MIN` (don't race a webhook still in flight) and `RECONCILIATION_LOOKBACK_H`:
  - gateway **paid** → run the same atomic confirm service the webhook uses (idempotent on a late-arriving IPN replay);
  - **paid but slot meanwhile confirmed to another patient (edge #6a)** → no second appointment; full refund (gross, not net-of-fee — the platform failed, not the patient) via the existing idempotent refund path + audit alert `payment.reconciliation_refund`;
  - **failed/unknown** → leave for lock expiry; any inconsistency → audit alert `payment.reconciliation_mismatch`.

---

## 6. Fidelity fixes (gap report Part 1)

| Gap | Fix |
| --- | --- |
| **G2** | Slots endpoint + booking re-validation require doctor exists **and** `active`; otherwise **404** (parity with profile route; closes invariant #9 before Slice G ships deactivation) |
| **G3** | Doctor default appointment scope bounded to the current Karachi day (F05.02); history stays the separate scope |
| **G4** | Forgot-password: equalize known/unknown paths with a constant-shape dummy operation on the unknown branch (mirrors login's dummy-hash discipline). Spec-wise hardening, not a violation fix |
| **G5** | `replaceWeeklyBlocks` booking-count query gains the same expired-`slot_locked` exclusion `generateSlots` already has (ADR-23 lazy expiry, edge #14) |

---

## 7. Resend adapter — `server/src/integrations/email/resend.js`

- Implements the `EmailProvider` typedef via Resend's HTTP send API (~30 lines; no SDK dependency needed).
- **Barrel fallback:** at boot, `RESEND_API_KEY` set → `resend.js`; unset → `console.dev.js` + a loud structured warning (`email provider: console fallback — no real emails will be delivered`). `EMAIL_PROVIDER` can still force a provider explicitly; the fallback governs the default.
- **Production caveat (recorded so launch isn't surprised):** an API key alone sends only to the account owner's email from `onboarding@resend.dev` — sufficient to verify the integration. Sending to arbitrary patient inboxes requires a verified domain (DNS records) + `RESEND_FROM` on that domain. Key = testable; key + domain = production-ready.

---

## 8. Configuration & constants (doc 15 cascade)

| Constant / env | Default | Purpose |
| --- | --- | --- |
| `EMAIL_MAX_ATTEMPTS` | 3 | F07.03 retry rule |
| `EMAIL_BACKOFF_BASE_SEC` | 60 | dispatch backoff base |
| `RECONCILIATION_LOOKBACK_H` | 24 | F04.03 window |
| `RECONCILIATION_MIN_AGE_MIN` | 60 | don't reconcile payments the webhook may still deliver |
| Cron cadences | `* * * * *` (dispatch, refund-retry), `0 * * * *` (reconciliation) | doc 15 §3 |

Existing `REFUND_MAX_ATTEMPTS` (5) / `REFUND_BACKOFF_BASE_SEC` (30) gain their first consumers. Dev triggers extend the ADR-25 pattern: env-guarded `POST /dev/worker/notifications`, `/dev/worker/refund-retry`, `/dev/worker/reconcile`.

---

## 9. Error handling

- Every worker tick wraps in try/catch + structured log (existing evaluation-worker discipline); per-job failures isolated inside the tick.
- Send/refund/reconcile side-effects never block committed state transitions (Slice C discipline preserved).
- Audit alert rows (`email.send_failed_final`, `payment.refund_exhausted`, `payment.reconciliation_refund`, `payment.reconciliation_mismatch`) carry `targetRef`/`providerRef` so the Slice G alert feed can correlate (closes the gap-report observation about bare audit rows).
- Workers remain single-instance in-process (ADR-08); the atomic claim flip is defense-in-depth, not leader election.

---

## 10. Testing strategy

Hybrid, matching prior slices (mocked-Prisma unit + targeted real-DB integration); TDD red→green per behavior.

- **Notification:** enqueue-in-transaction atomicity (rolled-back webhook ⇒ no job row); short-lead skip (both bounds); idempotent enqueue on webhook replay; dispatch success / failure / backoff schedule / exhaustion+audit; invalidation (cancelled ⇒ `suppressed`); Karachi formatting of slot times.
- **Refund retry:** G1 regression (provider error ⇒ visible `retrying`); backoff; exhaustion ⇒ `failed` + audit + `refund_delayed` job; idempotency-key reuse across retries.
- **Reconciliation:** gateway-paid ⇒ same commit as webhook + idempotent against a late IPN; edge #6a ⇒ full refund + no second appointment; mismatch ⇒ audit alert; min-age window respected.
- **Fixes:** one regression test each for G2 (slots 404 on inactive + booking blocked), G3 (today-bounded scope), G5 (expired lock doesn't trigger `BLOCK_HAS_BOOKINGS`); G4 structural test (both paths same operation shape).
- **Resend adapter:** unit test with mocked fetch (payload shape, error mapping); barrel fallback test (no key ⇒ console + warning).
- **Integration:** lock→pay→confirm produces confirmation + 2 reminder rows atomically; cancel before slot−24h suppresses both reminders.
- Existing 180 tests stay green throughout.

---

## 11. Canon documentation impact

Per doc 00 change protocol + change-impact matrix (apply only after explicit user approval at the doc-update step):

| Doc | Change | Matrix driver |
| --- | ------ | ------------- |
| 04  | `NotificationJob` model + enums + `Payment` retry fields + migration note; v-bump | Schema change (first) |
| 05  | New dev-worker routes; note reconciliation reuses the webhook confirm transition; v-bump | Schema/feature cascade |
| 08  | G4 hardening note; outbox data-handling note; dev switches stay off in prod; v-bump | Schema/config cascade |
| 12  | New TCs: F04.03 reconciliation, F06.03 retry, F07 cadence/retry/invalidation, G2/G3/G5 regressions | Feature → test cases |
| 14  | `PaymentProvider.queryPaymentStatus` contract; Resend adapter + key fallback + domain caveat; v-bump | Integration |
| 15  | §8 config table additions + Resend fallback semantics + worker cadences; v-bump | New tunable/config |
| 11  | New ADR: "Notification outbox + in-process dispatch/retry workers" (extends ADR-08/25; contrasts the rejected sent-flags option); v-bump | New architectural decision |
| 13  | Status sweep after merge (M1/M2 %, modules 13/14, F04/F06/F07 rows, worker table, checklists) | Build progress |

---

## 12. Decisions log (this slice)

| # | Decision | Choice |
| - | -------- | ------ |
| 1 | Notification persistence | Unified `NotificationJob` outbox table (rejected: sent-flags — fails F07.03 retry; rejected: AdminAlert table now — M4 surface too early) |
| 2 | Outbox atomicity | Event emails enqueued inside the caller's `$transaction`; webhook ack no longer awaits a send |
| 3 | Enqueue idempotency | `@@unique([appointmentId, type])`; Slice F relaxes for per-prescription if needed (YAGNI) |
| 4 | Refund retry state | Fields on `Payment` (`refundAttempts`, `nextRefundRetryAt`), not job rows — refunds aren't notifications |
| 5 | Alert representation | Audit rows with `targetRef`/`providerRef` now; dedicated feed storage decided in Slice G |
| 6 | Reconciliation adapter seam | `queryPaymentStatus(intentRef)` on `PaymentProvider`; mock implements, stub documents for Slice H |
| 7 | Edge #6a refund amount | Full (gross) refund — platform-fault, not patient cancellation |
| 8 | Resend | Real adapter now + boot-time key fallback to console (user decision); domain caveat recorded |
| 9 | Email for v1 launch | Console fallback acceptable absent a key; real delivery = drop `RESEND_API_KEY` (+ verified domain for patient inboxes) |
| 10 | G4 approach | Constant-shape dummy op on unknown path (smallest fix closing the timing oracle) |

---

## 13. Roadmap — remaining slices to v1 (agreed 2026-06-11)

Order locked: **E → F → G → H**. Each slice gets its own brainstorm → design → plan → build cycle; the scope boundaries below are agreed, the detailed designs are not yet.

| Slice | Milestone | Scope boundary |
| ----- | --------- | -------------- |
| **F** | M3 Prescriptions | Prescription service (immutable submit, price/patient-ID snapshots, corrections = new linked row) + medicine service (admin CRUD) + routes; `completed→prescription_issued` transition; `prescription_ready` via the E outbox; client PDF renderer; D-04, P-10, P-11 views. Schema models already exist |
| **G** | M4 Admin | Admin doctor onboarding/edit/deactivate (DA1/DA5 — fixes "no in-app way to create a doctor"); settings service; audit-log query API; alert feed reading E's audit rows; medicine admin routes; views A-01–A-07, D-05/D-06, P-12 (shows E's `refundStatus`), P-13 |
| **H** | M4 Launch | Real PayFast adapter (config-driven; sandbox-verified when merchant keys arrive) incl. `queryPaymentStatus`; real Daily.co adapter + signed webhook + client video SDK (needs user's Daily API key + domain); landing page P-01; `/legal/terms` + `/legal/privacy`; analytics/KPI events; error-tracking DSN; full E2E QA |

**Vendor-credential decisions (user, 2026-06-11):** Resend — built in E with key fallback; key (and domain for patient inboxes) whenever ready. PayFast — build real adapter in H so launch is keys-only. Daily.co — user will create an account and provide `DAILY_API_KEY` + `DAILY_DOMAIN` via `.env` at Slice H.
