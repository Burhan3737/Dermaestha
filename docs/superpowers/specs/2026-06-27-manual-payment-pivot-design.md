# Manual Payment Pivot — Phase-1 Design

| Field        | Value                                                        |
| ------------ | ------------------------------------------------------------ |
| Status       | Approved (design); implementation pending                    |
| Date         | 2026-06-27                                                   |
| Author       | Brainstormed with user (superpowers:brainstorming)           |
| Supersedes   | Slice C payment (PayFast), refund subsystem, no-show lifecycle |
| Spec impact  | Tracked below (§14); applied at END of implementation per doc `00` governance |

---

## 1. Context & goal

Client decision (phase 1): **remove all in-app payment integration and the entire refund
subsystem.** Payment moves fully offline (bank transfer), verified manually by the admin. The aim
is to drastically simplify the appointment lifecycle, remove the PayFast/refund/no-show complexity,
and shed the paid Daily.co plan dependency. If real online payments are wanted later, they will be
re-introduced as a separate effort (§13).

## 2. Decisions (locked in)

1. **Lock on click** — booking a slot immediately creates a `pending` appointment with the slot
   locked (existing `uniq_active_slot` invariant), preventing contention. No 10-minute auto-expiry;
   the slot frees only when a human acts.
2. **No proof image** — the patient does NOT upload a screenshot. Verification is the admin reading
   the real bank account.
3. **Bank instructions** come from an **admin-editable global setting** (existing admin Settings),
   shown to the patient with the amount due.
4. **Transaction matching** — after paying, the patient enters their **bank transaction reference**
   into the app; the admin matches it against the bank.
5. **No refunds anywhere** — paid is paid; cancelling forfeits. All money movement (including
   doctor-cancel goodwill) is handled offline by the admin.
6. **Cancellation** — patient, doctor, and admin can all cancel/free a slot.
7. **Four states only:** `pending → confirmed → completed`, plus `cancelled` (from `pending` or
   `confirmed`).
8. **Time-based completion** — a cron flips `confirmed → completed` at `slotEnd + VIDEO_TOKEN_POST_MIN`
   (default 5 min). No join tracking, no doctor button.
9. **Prescriptions** stay gated on `completed` (unchanged), but `prescription_issued` state is
   dropped — prescriptions are child records that do not change appointment state.
10. **Daily.co stays on the free tier** — create room + issue token + join only. No participant
    webhook, no join columns, no paid plan.
11. **Admin notification** — when the patient submits a payment reference, the admin gets an in-app
    alert AND an email (admin is not always logged in).
12. **Design conformance** — all new UI follows doc `06` tokens/components; no new aesthetics (§12).

## 3. Out of scope / deferred

- Real online payment gateway (PayFast or other) — deferred; revival insurance in §13.
- Any in-app refund, dispute, or chargeback handling.
- Attendance-verified completion (would require paid Daily webhooks).

## 4. Scope — deletions ("payment slop")

- **PayFast integration:** `server/src/integrations/payment/*`, the `Payment` model/table,
  `POST /api/webhooks/payfast`, `POST /api/payments/verify-return`, the gateway redirect half of
  `POST /:id/pay`, and the `/dev/checkout` simulator (`server/src/dev/devCheckout.js`).
- **Refund subsystem:** `safeRefund`, `retryDueRefunds`, `quoteRefund`/`refundQuote`, refund
  idempotency key, admin `record-refund`, the `dispute` action + `disputed` flag.
- **No-show / evaluation lifecycle:** the activation + no-show + refund logic in
  `evaluateDueAppointments`; the Daily participant webhook (`POST /api/webhooks/daily`,
  `video/controller.js#daily`, `recordJoinFromDailyEvent`) and the `register-daily-webhook.mjs`
  go-live path.
- **Cron jobs:** `refund-retry` and `payment-reconciliation` removed.
- **Dev simulators/workers:** `server/src/dev/devCheckout.js` removed; `devVideo.js` join-sim
  (`/dev/video/event`, `/dev/video/join`) + `recordJoin` client path removed (no join tracking);
  `devVideo.js#/worker/evaluate` repointed to the new completion pass; `devWorkers.js`
  `/worker/refund-retry` + `/worker/reconcile` removed (keep `/worker/notifications`). The Vite
  `/dev` proxy entry stays only if any `/dev` route remains, else removed.

## 5. Data model changes (`prisma/schema.prisma`)

- **`AppointmentState` enum → 4 values:** `pending` (renamed from `slot_locked`), `confirmed`,
  `completed`, `cancelled`. Removed: `slot_locked` (renamed), `in_progress`, `prescription_issued`,
  `cancelled_refunded`, `cancelled_no_refund`, `doctor_cancelled`, `patient_no_show`,
  `doctor_no_show`. Migration must map any existing rows.
- **Appointment — add:** `paymentReference String?`, `paymentSubmittedAt DateTime?`.
- **Appointment — drop:** `doctorJoinedAt`, `patientJoinedAt`, `disputed`, `lockExpiresAt`.
- **`feeAtBooking`** — kept; now snapshotted at booking/lock time (needed for the instructions),
  instead of on transition to `confirmed`.
- **Drop the `Payment` model** entirely.
- **Admin settings** — add bank-instruction fields (account name, account number, bank name,
  free-text note) to the existing settings store.

## 6. State machine (sole writer remains `transition()`)

```
pending   → confirmed    (admin accepts / verifies payment)
pending   → cancelled    (patient | doctor | admin "reject")
confirmed → completed    (cron: now ≥ slotEnd + 5min)   [time-only, automatic]
confirmed → cancelled    (patient | doctor | admin)
```

- `completed` is terminal and is the prescription gate (`prescription/service.js:35` unchanged).
- `cancelled` is terminal; who/why is captured in the audit log via `transition(actorType, reason)`,
  which is why collapsing three cancel states into one loses nothing for records.
- A `pending` appointment whose slot time passes does **not** auto-complete; it waits for an admin
  to cancel it (a past slot is not rebookable, so it is harmless).

## 7. Flows

### 7.1 Patient — book → pay → submit reference
1. Pick slot → `POST /api/appointments/lock` → creates `pending`, locks slot, snapshots
   `feeAtBooking`.
2. App shows bank instructions (from settings) + amount due + the appointment summary.
3. Patient pays offline, returns and enters their bank transaction reference →
   `POST /api/appointments/:id/pay` **repurposed** (no gateway): sets `paymentReference` +
   `paymentSubmittedAt`, stays `pending`, enqueues the admin alert + admin email.

### 7.2 Admin — review → accept / reject
- Review queue: `pending` appointments with a `paymentReference` (patient/doctor/time/amount +
  reference). Extend `GET /api/admin/records` rather than build a new list.
- **Accept** → `POST /api/admin/appointments/:id/accept` → `pending → confirmed`, enqueues the
  patient confirmation email.
- **Reject** → `POST /api/admin/appointments/:id/reject` → `pending → cancelled` (frees slot),
  enqueues the patient "payment not received" email.

### 7.3 Doctor — consult → (auto-complete) → prescribe
- During `confirmed`, doctor/patient may optionally join the Daily room (free tier).
- Cron flips `confirmed → completed` at `slotEnd + 5min`.
- Doctor writes the prescription on the `completed` appointment (existing flow, unchanged);
  enqueues the existing prescription-ready email.

### 7.4 Cancellation
- `POST /api/appointments/:id/cancel` (patient or doctor) → `cancelled` from `pending`/`confirmed`,
  frees the slot, enqueues a cancellation email. No refund; money handled offline.

## 8. Endpoints

- **Repurposed:** `POST /api/appointments/:id/pay` → "submit my bank transaction reference".
- **Added:** `POST /api/admin/appointments/:id/accept`, `POST /api/admin/appointments/:id/reject`.
- **Kept:** `POST /api/appointments/lock`, `POST /api/appointments/:id/cancel`,
  `GET /api/appointments/:id`, `GET /api/appointments/:id/video-token` (now `confirmed`-only).
- **Removed:** `POST /api/webhooks/payfast`, `POST /api/payments/verify-return`,
  `POST /api/appointments/:id/dispute`, `POST /api/admin/payments/:appointmentId/record-refund`.

## 9. Notifications (outbox producers after the change)

| Trigger                          | Recipient | Email                         |
| -------------------------------- | --------- | ----------------------------- |
| Patient submits payment ref      | Admin     | "payment submitted — review" (new) + in-app alert |
| Admin accepts                    | Patient   | booking confirmed             |
| Admin rejects / cancellation     | Patient   | payment not received / cancelled |
| Doctor issues prescription       | Patient   | prescription ready (existing) |

All payment/refund emails removed.

## 10. Cron (in-process node-cron) — before → after

Before: `appointment-evaluation`, `notification-dispatch`, `refund-retry` (every min),
`payment-reconciliation` (hourly).

After (2 jobs, both every minute):
```js
cron.schedule('* * * * *', tick('appointment-completion', completeDueAppointments)); // confirmed & ≥ slotEnd+5m → completed
cron.schedule('* * * * *', tick('notification-dispatch',  dispatchDueNotifications)); // drain outbox
```

Jobs remain **independent ticks**; the only coupling is the producer→outbox→dispatch pattern for
emails. No new infrastructure.

## 11. Acceptance / success criteria

- Booking a slot creates `pending` and locks the slot; no double-booking possible.
- Submitting a reference sets the two columns and produces the admin alert + email.
- Admin accept → `confirmed` + patient email; reject → `cancelled` (slot freed) + patient email.
- A `confirmed` appointment auto-completes at `slotEnd + 5min`; a `pending` one does not.
- A `completed` appointment can have prescriptions; `confirmed`/`pending` cannot.
- No PayFast/refund/dispute/Daily-webhook code paths remain reachable.
- Daily video works on the free tier (room + token + join).

## 12. Design & theming conformance (SOP)

- Doc `06` (Design System) is the source of truth. New screens use the established
  color/typography/spacing **tokens** and documented **component behavior**, and fit existing
  screen-flow/navigation conventions.
- **Reuse existing components:** same inputs/buttons/form patterns; the admin review queue inherits
  the current admin records-view styling; the patient pay screen matches the booking-flow styling
  (consistent with the D-05 / appointments redesigns).
- **No bespoke aesthetics** — follow the project design system per CLAUDE.md "match existing style",
  not the generic frontend-design skill. Doc `06` is updated to *document* the new screens, which
  *conform to* existing tokens rather than introducing new ones.

## 13. Future-payment revival insurance

- `git tag pre-manual-payment-pivot` on the commit immediately before deletion → future revival is a
  diff, not archaeology.
- New ADR records why payments were removed + the manual model; old payment/refund/no-show ADRs are
  marked **superseded, not deleted**.
- Deprecated `docs/engineering/*` (PayFast/refund contracts) remain for history per doc `00 §7`.
- The booking → `pending` → `confirmed` spine is unchanged; future gateway payments re-add a second
  confirmation trigger (webhook) to a transition that already exists.

## 14. Spec doc-impact (tracked; applied at END per doc `00` governance)

| Doc | Change |
| --- | ------ |
| `01` PRD | Note the manual-payment model (high level) |
| `02` Scope/Feature | Retire payment-gateway + refund + no-show features; add manual-payment, admin-review, time-based-completion |
| `03` Architecture | Remove PayFast/refund/no-show data flows; update worker/cron diagram; video simplification |
| `04` Database | Enum → 4 states; add `paymentReference`/`paymentSubmittedAt`; drop `Payment`, join cols, `disputed`, `lockExpiresAt`; settings fields |
| `05` API + state machine | Remove payfast/return/dispute/record-refund; repurpose `/pay`; add admin accept/reject; rewrite transition table |
| `06` Design system | New patient pay screen + admin review view; remove gateway redirect screens (conform to existing tokens) |
| `07` Risk/Assumptions | Drop refund + Daily-paid-plan risks; add admin manual-reconciliation risk + trust-doctor/time completion assumption |
| `08` Security | Payment data now low-sensitivity text; remove payfast webhook signature controls |
| `09` Testing strategy | Update test scope (remove payment/refund/no-show; add manual-payment) |
| `11` ADR | New ADR; mark PayFast/refund/no-show ADRs (incl. ADR-12, ADR-24, ADR-39) superseded |
| `12` Test cases | Retire payment/refund/no-show TCs; add manual-payment + admin-review + auto-complete TCs |
| `13` Status | Update build state |
| `14` Integrations | Remove PayFast + Daily-webhook contracts (Daily → room+token); update email merge-var catalog |
| `15` Config | Remove `PAYFAST_*`, `PAYMENT_PROVIDER`, `REFUND_*`, `DAILY_WEBHOOK_SECRET`, `NO_SHOW_GRACE_MIN`; bank details move to DB settings |
| `10` Deployment | Drop the Daily webhook registration step; env-var changes |

## 15. Testing plan (remove / rewrite / add — test-first during implementation)

**Remove** (code deleted): `test/unit/modules/payment/service.test.js`,
`test/unit/integrations/payment/payfast.mock.test.js`, Daily-webhook verification tests in
`test/unit/integrations/video/daily.mock.test.js`, refund/no-show/reconcile blocks in the
appointment + payment suites, E2E `j10-pending-hold-recovery.spec.js`, refund/no-show journeys.

**Rewrite** (flow changed): `test/integration/booking.test.js` (manual flow, no `/dev/checkout`),
`test/integration/video.test.js` (`joinSimUrl: null`, no join recording),
`test/integration/prescription.test.js` (reach `completed` via the time rule),
`test/integration/notification.test.js` (new admin email; drop refund emails), E2E
`j1-book-pay-confirm.spec.js` + `j2-video-lifecycle.spec.js`, client `Booking.test.jsx`,
`Upcoming.test.jsx`, `VideoRoom.test.jsx`.

**Add** (new behavior): `POST /:id/pay` sets reference + enqueues admin email; admin accept/reject
transitions (incl. slot freed on reject); cron completion rule (`confirmed` past cutoff → `completed`;
`pending` past slot does NOT complete); cancellation without refund; new E2E journey
(book → submit reference → admin accepts → auto-complete → prescribe).

**Approach:** test-driven (superpowers:test-driven-development) — adjust/write the failing test, then
change code. Retire/add doc `12` test-case IDs per governance.

## 16. Open / minor items

- Exact field labels/copy on the patient pay screen and admin review view (design-time, doc `06`).
- Whether `video-token` issuance restricts to `confirmed` only (recommended) — confirm in build.
- Migration strategy for any existing non-`pending`/`confirmed`/`completed`/`cancelled` rows in dev DB.
