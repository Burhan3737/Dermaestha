# Slice C — Booking + Payment — Design

| Field      | Value                                                                            |
| ---------- | -------------------------------------------------------------------------------- |
| Date       | 2026-06-03                                                                       |
| Status     | Approved (design); implementation pending                                        |
| Scope      | M1+M2 Slice C of 4 (C — Booking + Payment)                                       |
| Canon refs | docs/specification 02 (F03, F04, F06), 04, 05 (§5 state machine), 06, 08, 14, 15 |
| Depends on | Slice A (auth/session/roles, apiClient, components, TanStack Query); Slice B (slot generation, `availability.service`, `uniq_active_slot`, seeded doctors, `formatPkr`/`formatKarachi`, `PatientLayout`) |

---

## 1. Scope

**In:**

- **F03 — Slot lock:** `POST /api/appointments/lock` inserts the appointment at `slot_locked` with `lockExpiresAt = now + SLOT_LOCK_TTL_MIN`, captures the "who is this for?" (P8) data, and is guarded by the `uniq_active_slot` partial index. Enforces Single-Lock and No-Overlap. Re-validates the requested slot is a real future bookable slot (reuses `availability.service`).
- **F04 — Payment:** idempotent intent on `(patient, slot)` → hosted-checkout handoff; signature-verified IPN webhook is the source of truth; one `$transaction` moves `slot_locked → confirmed`, snapshots `feeAtBooking` (#6), writes the `payments` row (#2). Simulated by a **dev mock gateway** (see §4).
- **F06 — Cancellation & refund:** `POST /api/appointments/:id/cancel`. Backend supports **patient** (`≥2h → cancelled_refunded`, `<2h → cancelled_no_refund`) and **doctor** (`doctor_cancelled`) roles, fully tested. Net-of-fee refund (reported gateway fee wins; else Settings fallback). **Patient UI only** this slice.
- **Emails:** confirmation (on `→confirmed`), refund confirmation, cancellation/doctor-cancel apology — **post-commit, best-effort**, via a dev logging email adapter.
- **Screens:** **P-06** Booking (slot + who-for), **P-07** Payment handoff & return, **P-08** Dashboard — Upcoming, **P-10** Cancellation modal.

**Out (later slices):**

- Video lifecycle (`confirmed→in_progress→completed`/no-show), `GET .../video-token`, P-11/P-12 → **Slice D**.
- Reminder cadence (24h/1h, F07.02), hourly reconciliation worker (F04.03, edge #6/#6a) → **later slice**.
- Doctor appointment-list UI + **D-06** doctor-cancel modal → **Slice D** (lands with the doctor "today" view + Join Call).
- Admin `POST /api/appointments/:id/dispute`, records/audit/alerts UI → **M4**.

## 2. Decisions (locked with the user)

1. **Scope boundary:** core booking + payment **+** cancellation/refund (F06); video lifecycle, reminder cadence, and the reconciliation worker deferred.
2. **Payment simulation:** a **dev mock gateway** (`payfast.mock`) implementing the `PaymentProvider` typedef for real. `createCheckout` returns a `redirectUrl` to an app-served, env-guarded dev checkout page; "Pay/Fail" causes the server to build a **real HMAC-signed IPN** and run it through the same `verifyWebhook` + atomic-commit path as production. The concrete PayFast network adapter stays a future file-swap behind the typedef. The throwing `payfast.stub` remains the prod default until wired.
3. **Lock expiry — lazy, no worker:** expiry is derived from `lockExpiresAt` at (a) **read** — slot generation treats an expired `slot_locked` as not occupying, so abandoned slots reappear instantly; and (b) **write** — a `uniq_active_slot` collision (`P2002`) triggers reclaim (delete the expired lock + retry once, else `SLOT_TAKEN`). **No `setInterval`/`setTimeout`, no polling.** Durable across restarts; dead rows linger invisibly until rebooked. Recorded as **ADR-23**.
4. **Emails:** add a dev logging email adapter (the existing `resend.stub` throws 501); select it via the provider switch. Sends fire **after** the DB commit, best-effort (failure logged/audited, never blocks the transition).
5. **Doctor-cancel:** the cancel endpoint + `appointmentState.service` + `refund.service` support both patient and doctor roles (fully unit + integration tested); only the patient UI ships this slice.
6. **Single transition module:** `appointmentState.service` is the **only** writer of `Appointment.state` (doc 05 §5); controllers and the webhook call it; side-effects fire post-commit.

## 3. Backend — modules (service → controller → route)

### `services/appointmentState.service.js` (new)

The single state writer. `transition({ appointmentId, to, actor, reason?, tx? })`:

- Validates `from → to` against the doc 05 §5 table for the transitions in scope; rejects illegal pairs (`INVALID_TRANSITION`).
- Writes the state change + an `audit.service` entry (`actorType`: `patient`/`doctor`/`system`).
- Returns the updated appointment; **side-effects (refund, email) are fired by the caller post-commit**, not inside this function's `tx`.

### `services/booking.service.js` (new)

- `lockSlot({ patientUserId, doctorId, slotStart, forSelf, subject? })`:
  - Re-validate the slot: `availability.service` must generate `slotStart` as a bookable slot for that doctor/day (future + lead-time + active-exclusion). Else `422 SLOT_NOT_BOOKABLE`.
  - **Single-Lock:** reject if the patient holds a non-expired `slot_locked` (`409 ACTIVE_LOCK_EXISTS`).
  - **No-Overlap:** reject if the patient has an active appointment overlapping `[slotStart, slotEnd)` (`409 OVERLAP`).
  - Insert `slot_locked` (`lockExpiresAt = now + SLOT_LOCK_TTL_MIN`, `slotEnd = slotStart + SLOT_GRANULARITY_MIN`, who-for fields) via `appointmentState.service`.
  - **Reclaim-on-conflict:** on `P2002`, if the occupying row is an expired `slot_locked`, delete it and retry once; else `409 SLOT_TAKEN`.
- Slot-occupancy check shared with `availability.service`: an appointment occupies a slot iff its state ∈ `ACTIVE_APPOINTMENT_STATES` **and not** (`state === 'slot_locked' && lockExpiresAt < now`). (Refines the Slice-B exclusion to honor lazy expiry — a small, shared predicate.)

### `services/payment.service.js` (new)

- `createIntent({ patientUserId, appointmentId })`:
  - Load appointment; must be `slot_locked` and not expired (`409 LOCK_EXPIRED`), owned by the patient.
  - Idempotent on `(patientUserId, slotStart)` (`Payment.intent_key`): upsert a `pending` payment with `amount = doctor.fee` (the value snapshotted to `feeAtBooking` on confirm).
  - `paymentProvider.createCheckout({ appointmentId, intentKey, amount, returnUrl, cancelUrl, notifyUrl })` → `{ redirectUrl, providerRef }`; store `providerRef`. Return `redirectUrl`.
  - Rate-limited per patient (`PAYMENT_INTENT_MAX_PER_PATIENT_HOUR`).
- `processWebhook(req)`:
  - `paymentProvider.verifyWebhook(req)` → `WebhookResult` or **throws** on bad signature → controller maps to `401` + `audit` alert.
  - `payment.success`: one `$transaction` — `slot_locked → confirmed` (via `appointmentState.service` with `tx`), set `feeAtBooking = payment.amount` (#6), update `payments` row to `success` + `gatewayFee`. **Post-commit:** confirmation email (best-effort). Idempotent — a duplicate success for an already-`confirmed` appointment is a no-op `200`.
  - `payment.failed`: release the lock (remove the `slot_locked` row); payment row → `failed`.

### `services/refund.service.js` (new)

- `initiateRefund({ appointmentId, reason, tx? })` — called by the cancel/doctor-cancel paths:
  - Compute net-of-fee: `refund = amount − gatewayFee` where `gatewayFee` is the payment's reported fee if present, else the Settings fallback (`fallbackFeePctBps`/`fallbackFeeFixed`, policy #5).
  - Set/reuse `refundIdempotencyKey` (per-appointment, #10); call `paymentProvider.refund({ providerRef, amount: refund, idempotencyKey })` → `{ refundRef, status }`; store `refundRef`/`refundStatus`.
  - **Post-commit:** refund-confirmation / apology email (best-effort).
- `quoteRefund(appointmentId)` — pure helper returning `{ amountPaid, gatewayFee, refund }` so the **cancel modal estimate and the dashboard breakdown show the identical number** (policy #5).

### `services/cancellation.service.js` (or folded into booking) (new)

- `cancel({ appointmentId, actor })`:
  - **patient:** if `slotStart − now ≥ 2h` → `cancelled_refunded` + `refund.service` + release slot; else → `cancelled_no_refund` (no refund, slot stays blocked).
  - **doctor:** `reason` required → `doctor_cancelled` + `refund.service` + release slot + apology email.
  - Ownership-checked; only legal from `confirmed`.

### Integrations

- `integrations/payment/payfast.mock.js` (new) — implements `PaymentProvider`: `createCheckout` (dev checkout URL + `providerRef`), `verifyWebhook` (real HMAC over canonical params with the dev passphrase; throw on mismatch), `refund` (returns `{ refundRef, status: 'settled' }`), `listUnconfirmed` (out of scope → returns `[]`).
- `integrations/payment/index.js` — provider switch: `mock` when enabled (dev), else the throwing `payfastStub` (prod-not-yet-wired default).
- `integrations/email/console.dev.js` (new) — `send` logs and returns `{ providerId }`; `parseWebhook` unused this slice. `integrations/email/index.js` switch selects it in dev.

### Routes (doc 05) & authorization

| Method · Path | Auth |
| --- | --- |
| `POST /api/appointments/lock` | `requireRole('patient')` + `mustChangePasswordGate` |
| `POST /api/appointments/:id/pay` | `requireRole('patient')` + rate limit |
| `GET /api/appointments` | `requireRole('patient','doctor')` — role-scoped (patient = own; doctor = assigned) |
| `GET /api/appointments/:id` | `requireRole('patient','doctor')` — ownership-checked; **404 (not 403)** when not visible |
| `POST /api/appointments/:id/cancel` | `requireRole('patient','doctor')` — patient owns it / doctor is assigned |
| `POST /api/webhooks/payfast` | **public**, signature-verified (bad sig → 401 + alert) |
| `GET /dev/checkout`, `POST /dev/payment/complete` | **dev-only**, env-guarded; never mounted in production |

### Shared Zod DTOs (`shared/schemas/booking.js`)

- `lockSchema`: `{ doctorId: cuid, slotStart: ISO, forSelf: bool, subject?: { name, age:int>0, relation } }` — `subject` required iff `forSelf === false`.
- `payParamsSchema` / `cancelSchema` (doctor `reason` required for doctor actor).
- Re-export via `shared/schemas/index.js`.

## 4. Payment simulation — sequence

```
P-06 "Confirm & Pay"
  → POST /api/appointments/lock           → slot_locked (+TTL); returns { appointmentId }
  → POST /api/appointments/:id/pay        → idempotent intent; mock createCheckout()
                                             returns { redirectUrl = /dev/checkout?ref=… }
  browser → GET /dev/checkout?ref=…        (server-rendered "external" page: Pay / Fail; no secret)
       Pay → POST /dev/payment/complete { ref, outcome }   (dev-only)
              server builds a signed IPN and runs the SAME path as a real PayFast IPN:
  → verifyWebhook() verifies HMAC          (bad sig → 401 + audit alert)
  → success → $transaction: slot_locked→confirmed, feeAtBooking, payments row
              post-commit: confirmation email (best-effort)
  → fail    → release lock (row removed); payment row → failed
  browser → P-07 /pay/return?appt=…        polls GET /api/appointments/:id → Confirmed / Failed
```

The dev passphrase is server-side only. This exercises real signature verification, webhook-truth, and atomic commit; only the "bank" is faked.

## 5. Frontend (patient)

- **P-06 Booking** (`/book/:id?slot=…`): stepper (Select slot → Who for → Pay) using the form-section card; pre-selects the `slot` query param (or shows the day's slots via the Slice-B `slots` query); radio "Who is this consultation for?" (P8) expanding to name/age/relation; fee via `formatPkr`; "Confirm & Pay" → `lock` then `pay` mutations → `window.location = redirectUrl`.
- **P-07 Payment return** (`/pay/return`): centered status card; `useQuery` polls `GET /api/appointments/:id` → **Confirmed** (link to dashboard) / **Failed** (retry → back to P-06) / **Pending** (still awaiting webhook).
- **P-08 Dashboard — Upcoming** (`/appointments`): lists `confirmed`/`in_progress` sorted by `slotStart` asc; columns: doctor name + photo, slot date/time (`formatKarachi`), "for: [subject]" when not self, fee paid, **Join Call** (Slice-D stub, disabled), and a **Cancel** link on `confirmed`. Empty state → "Browse doctors". Replaces the Slice-A/B placeholder.
- **P-10 Cancellation modal**: confirmation modal (danger accent). `≥2h` → refund breakdown from `quoteRefund` (`paid − gateway fee = refund` + "Refund excludes the payment-gateway fee charged at booking.") → "Cancel & refund". `<2h` → warning "No refund; the slot stays blocked" → confirm. Refund status (with `refundRef`) then shows in the dashboard using the same number.
- `client/src/lib/apiClient.js`: add `lock`, `pay`, list/detail, `cancel` calls. `routes.jsx`: `/book/:id`, `/pay/return`, `/appointments` (patient `RoleRoute`).

## 6. Error handling

`SLOT_TAKEN` (409), `LOCK_EXPIRED` (409), `SLOT_NOT_BOOKABLE` (422), `ACTIVE_LOCK_EXISTS` (409), `OVERLAP` (409), `INVALID_TRANSITION` (409), bad webhook signature → 401 + audit alert. Reclaim retries once then surfaces `SLOT_TAKEN`. Email and refund-call failures are logged/audited and **never** roll back or block a state transition (post-commit, best-effort).

## 7. Data & schema

**No schema change, no migration.** `Appointment`, `Payment`, `Settings`, and the `uniq_active_slot` partial index already exist (`doubleBooking.test.js` confirms the index). Invariants reused: #1 (partial index → `SLOT_TAKEN`), #2 (`$transaction`), #6 (`feeAtBooking`), #7 (`@@unique([patientUserId, slotStart])`), #10 (`refundIdempotencyKey @unique`). `Settings` row is seeded (id=1).

## 8. Testing (hybrid, matching A/B)

- **Unit (mocked Prisma + fixed clock):** state-machine transition guards (legal/illegal pairs per role); refund net-of-fee (reported-fee-wins **and** Settings fallback); `quoteRefund` parity; reclaim-on-conflict; lazy-expiry occupancy predicate; HMAC signature verify (valid + invalid); Single-Lock / No-Overlap guards; intent idempotency.
- **Integration (real DB):** full `lock → pay (signed webhook) → confirmed → cancel → refund` happy path; double-booking → 409; expired-lock rebook succeeds; idempotent double-success webhook (no second appointment); 401 on bad signature; `<2h` cancel → `cancelled_no_refund` (no refund, slot stays blocked).
- **Client:** Booking flow (lock+pay mutation calls, who-for expand), P-07 status states, P-08 list/empty, P-10 cancel modal refund math.
- **Gate:** keep server + client suites green (extend the A/B baselines); `client run build` clean; Prettier on slice files.

## 9. Config / env + doc-suite impact

**New env/config:** `PAYMENT_PROVIDER` switch (`mock` | default throwing stub); dev mock signing passphrase (e.g. `PAYFAST_MOCK_PASSPHRASE`); `APP_BASE_URL` (return/cancel/notify URLs); `EMAIL_PROVIDER` switch (`console` dev). All read via `config/env.js` + `config/constants.js`; existing `SLOT_LOCK_TTL_MIN`, `PAYMENT_INTENT_MAX_PER_PATIENT_HOUR`, `REFUND_*` reused.

**Recommended canonical-doc updates (apply after user approval, per doc 00 change protocol):**

- **11 (ADR):** ADR-22 — dev mock gateway with real signed IPN (payment simulation strategy); ADR-23 — lazy lock-expiry, no background worker (documents the deviation from the implied lock-release worker).
- **15 (Config):** add the new env vars; cascade to **08** (secret handling for the mock passphrase) and **10** (deploy note: mock/`/dev/*` must be disabled in prod) per the config change-impact row.
- **14 (Integration):** note `payfast.mock` + the dev checkout flow as the dev implementation of `PaymentProvider`.
- **05 (API):** add any new error codes not already listed (`SLOT_NOT_BOOKABLE`, `ACTIVE_LOCK_EXISTS`, `OVERLAP`, `INVALID_TRANSITION`); note `/dev/*` as dev-only, non-canonical.
- **13 (Status):** F03/F04/F06 + module progress.
- **04 / 12:** no schema change; confirm existing F03/F04/F06 test-case IDs cover the new suites.

## 10. Risks

- The mock gateway + `/dev/*` routes must be **impossible to mount in production** — env guard + provider switch defaulting to the throwing stub in prod; integration test asserts `/dev/*` is absent when disabled.
- Lazy expiry leaves dead `slot_locked` rows until the slot is rebooked (accepted; invisible to discovery and booking).
- Doctor-cancel has backend + tests but no UI this slice (intentional; UI in Slice D).
- Email/refund are best-effort with no retry/reconciliation this slice (deferred); a failed send/refund is audited but not auto-retried — acceptable for the slice, closed by the later F07/reconciliation slice.
