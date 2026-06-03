# 2026-06-03-1905 — slice-c-booking-payment

**Status:** COMPLETE & MERGED to `main` (`8159437`, no-ff). 24 plan tasks + review fixes; canon doc updates applied (user-approved full set); 109 server + 32 client tests green pre- and post-merge; build clean. Not pushed (local merge per user choice).
**Goal:** Brainstorm + spec + plan + build Slice C (Booking + Payment) — the third vertical slice of the M1+M2 patient journey.
**Skill(s) used:** superpowers:brainstorming (user-invoked); will hand off to superpowers:writing-plans
**Ticket / issue:** None
**Branch:** main (code work will move to a feature branch before any commit)
**Commits / PR:** `078e0b0`…`924cde4` on `feat/slice-c-booking-payment`; merged to `main` via `8159437` (no-ff). Not pushed.
**Last updated:** 2026-06-04-0033
**Tags:** #feature #booking #payment #refund #frontend

## Summary
Third slice of the 4-slice M1+M2 decomposition (A + B merged). Brainstormed and got approval on the Slice C design: slot lock (F03), payment via a dev mock gateway with a real signed IPN (F04), and cancellation + net-of-fee refund (F06), plus the P-06/P-07/P-08/P-10 patient screens. Spec written; implementation plan + build pending.

## Context / why
Slices A (identity/access) and B (discovery/availability) are merged to `main`. Slice C consumes B's generated slots and the `uniq_active_slot` index to deliver the booking↔payment interlock (F03 spans M1→M2). No real PayFast merchant account exists in this environment, so the central design decision was how to simulate the hosted-checkout + signed-webhook loop offline.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-03-1905-slice-c-booking-payment.md` | Created | This session changelog. |
| `agentChangeLogs/index.md` | Modified | Added Slice C index line. |
| `docs/superpowers/specs/2026-06-03-slice-c-booking-payment-design.md` | Created | Slice C design doc (brainstorming output). |
| `docs/superpowers/plans/2026-06-03-slice-c-booking-payment.md` | Created | Slice C implementation plan (writing-plans output) — 4 phases, ~20 TDD tasks. |
| `server/src/config/env.js` (+ test) | Modified | `PAYMENT_PROVIDER`/`EMAIL_PROVIDER` switches (default `stub`) + `PAYFAST_PASSPHRASE`. `078e0b0` |
| `.env.example` | Modified | Documented the two provider switches. `078e0b0` |
| `server/src/integrations/email/console.dev.js` (+ test), `email/index.js` | Created/Modified | Dev logging email adapter + `EMAIL_PROVIDER` switch (the resend stub throws). `36a7ed6` |
| `server/src/integrations/payment/payfast.mock.js` (+ test), `payment/index.js` | Created/Modified | Dev mock gateway: HMAC-signed IPN (`signParams`/`buildSignedIpn`), `verifyWebhook`, `refund`; `PAYMENT_PROVIDER` switch. `33a482b`, `336d0fd` (sig clarity) |
| `shared/schemas/booking.js` (+ test), `schemas/index.js`, `vitest.config.js` | Created/Modified | `lockSchema`+`cancelSchema`; added `shared/**/*.test.js` to vitest include (latent gap). `f3dd38b` |
| `server/src/services/audit.service.js` (+ test) | Modified | `record(e, client=prisma)` — optional tx client for atomic audit. `b0a6fd5` |
| `server/src/services/appointmentState.service.js` (+ test) | Created | Single state-transition writer (legal-pair validation + audit). `7922fb2` |
| `server/src/services/availability.service.js` (+ expiry test) | Modified | Lazy-expiry `NOT` clause excludes expired `slot_locked` from slot-gen (ADR-23). `e1c3824` |
| `server/src/services/booking.service.js` (+ test) | Created | `lockSlot`: validate + single-lock + no-overlap + reclaim-on-conflict. `5b1692d` |
| `server/src/services/refund.service.js` (+ test) | Created | `quoteRefund` (net-of-fee, reported-wins/fallback) + idempotent `initiateRefund`. `0abad29` |
| `server/src/services/payment.service.js` (+ test) | Created/Modified | `createIntent` (idempotent) + `processWebhook` (atomic commit); `payment.failed` status guard (review). `610fbcc`, `336d0fd` |
| `server/src/services/cancellation.service.js` (+ test) | Created/Modified | Patient ≥2h/<2h + doctor cancel; best-effort `safeRefund` wrapper (review). `cd60cc2`, `336d0fd` |
| `server/src/services/appointment.service.js` (+ test) | Created | Role-scoped `listForRole` + `getForRole` (404 no-leak, refundQuote on confirmed). `14b38eb` |
| `server/src/controllers/appointment.controller.js`, `routes/appointments.js` | Created | lock/pay/list/detail/cancel; pay rate-limited. `971e08a` |
| `server/src/controllers/webhook.controller.js`, `routes/webhooks.js` | Created | `POST /api/webhooks/payfast` — signature-verified, 401+audit on bad sig. `7735252` |
| `server/src/routes/devCheckout.js` | Created | Dev-only mock hosted page + `/dev/payment/complete` (real signed IPN). `9598c30` |
| `server/src/index.js` | Modified | Wire appointments+webhooks routers; env-guarded `/dev` mount (mock only). `1c87c6f` |
| `server/src/test/booking.integration.test.js` | Created | Real-DB lock→pay→confirm→cancel→refund + bad-sig 401 + double-book guard. `61796a7` |
| `client/src/components/CancelModal.jsx` (+ test) | Created/Modified | P-10 modal (refund breakdown / no-refund warning). `8f3064d`, `e824eee` |
| `client/src/views/Booking.jsx` (+ test) | Created | P-06 slot + who-for + confirm/pay → redirect. `3a14c6b` |
| `client/src/views/PaymentReturn.jsx` (+ test) | Created | P-07 polls appointment state → confirmed/failed. `2097f34` |
| `client/src/views/Upcoming.jsx` (+ test) | Created/Modified | P-08 upcoming + cancel flow; `<2h` lateNoRefund signal (review). `e824eee`, `336d0fd` |
| `client/src/routes.jsx`, `client/src/App.jsx` | Modified | `/book/:id` + `/pay/return` patient-gated (review I3); `/appointments` patient RoleRoute. `6847956`, `336d0fd` |
| ~22 Slice-C files | Modified | Prettier normalization (slice files only). `b70d5b5` |
| `docs/specification/11-…md` | Modified | ADR-22 (mock gateway signed-IPN) + ADR-23 (lazy lock-expiry); v1.3. `77ffa7b` |
| `docs/specification/15-…md` | Modified | `PAYMENT_PROVIDER`/`EMAIL_PROVIDER` switches + `PAYFAST_PASSPHRASE` dual-use; v1.1. `77ffa7b` |
| `docs/specification/14-…md` | Modified | Dev `payfast.mock` + `/dev/checkout` simulation note (§2); v1.2. `77ffa7b` |
| `docs/specification/05-…md` | Modified | New 409/422 error codes + `/dev/*` dev-only note; v1.3. `77ffa7b` |
| `docs/specification/08-…md` | Modified | Dev provider switches must stay safe in prod; mock passphrase dev-only; v1.2. `77ffa7b` |
| `docs/specification/10-…md` | Modified | Pre-deploy check: dev switches OFF in prod; v1.1. `77ffa7b` |
| `docs/specification/13-…md` | Modified | Status sweep — M1 ~85%/M2 ~40%, modules 5/6/7/8/12 Built, F03/F04/F06 Built; v1.4. `77ffa7b` |

## Dependencies / config / schema
No schema change / no migration planned — `Appointment`, `Payment`, `Settings`, and the `uniq_active_slot` partial index already exist. Planned new config/env (pending approval): payment-provider switch (mock vs throwing stub), dev mock signing passphrase, `APP_BASE_URL`, email-provider switch.

## Decisions
- **Scope:** Core booking+payment + cancellation/refund (F06). Deferred: video lifecycle, reminder cadence (24h/1h), hourly reconciliation worker, admin dispute/records, doctor appointment-list UI + D-06 modal. (User chose.)
- **Payment sim:** dev mock gateway whose `createCheckout` redirects to an app-served dev checkout page; "Pay/Fail" posts a REAL HMAC-signed IPN through the same `verifyWebhook` + atomic-commit path as production. Concrete PayFast network adapter stays a future swap. (User chose.)
- **Lock expiry:** lazy expiry (derive from `lockExpiresAt` at read + reclaim-on-conflict at write) — NO `setInterval`/`setTimeout`, no per-minute DB poll. Durable across restarts. (User chose, after rejecting both a polling worker and an in-memory per-lock timer.)
- **Emails:** add a dev logging email adapter (replaces the 501-throwing stub via provider switch); fire confirmation/refund/cancellation sends post-commit, best-effort. (User chose.)
- **Doctor-cancel:** backend cancel endpoint + state machine + refund support both patient and doctor roles (fully tested); patient UI only this slice; doctor D-06 modal + appointment list deferred to Slice D. (User chose.)
- **Single transition module:** `appointmentState.service` is the only writer of `Appointment.state` (doc 05 §5).

## Notable findings
- The email stub (`resend.stub`) THROWS `NOT_IMPLEMENTED` (501) — it is not a silent logger; hence the dev logging adapter decision. Email sends must be post-commit + best-effort regardless (never inside the booking `$transaction`).
- `Settings` row IS seeded (id=1; defaults `minBookingLeadMinutes=60`, fallback fees 0) — refund fallback-fee model + lead-time filter have a row to read.
- The `uniq_active_slot` partial index counts `slot_locked` as occupying AND slot generation excludes `slot_locked`, so an expired-but-present lock row would keep a slot both hidden and unbookable — which is why lazy read-time filtering + reclaim-on-conflict are required for correctness, not polish.
- `DoctorProfile` already navigates to `/book/:id?slot=…` — the placeholder route Slice C fills.
- **Integration-test catch (Task 2.5):** a *second* sequential lock on a held slot returns **422 `SLOT_NOT_BOOKABLE`** (validation gate via `generateSlots`, which already excludes the locked slot), not 409 `SLOT_TAKEN`. The 409 path is only reachable under a true concurrent race (covered by the `booking.service` unit test + DB-level `doubleBooking.test.js`). Double-booking is prevented with defense-in-depth; the plan's test expectation was corrected to match reality.
- **Final-review catches (all traced to plan gaps, not implementer error):** (C1) `cancellation.service` awaited `initiateRefund` with no try/catch → a provider error would 500 a request whose state transition had already committed; fixed with a best-effort `safeRefund` (log + `payment.refund_failed` audit). (C2) the `payment.failed` webhook branch unconditionally set the payment row to `failed`, so a replayed/late failure after a success would corrupt the `success` row and break refund lookup; fixed with a `status !== 'pending'` guard. (I1) `Upcoming.jsx` never passed `lateNoRefund`, so a `<2h` cancel showed a false refund estimate; fixed by computing the window client-side. (I3) `/book/:id` + `/pay/return` were public routes → now patient-gated.
- Known low-risk items deferred (documented, not fixed): the `payment.failed` two-write path is not wrapped in a `$transaction` (I2); the integration test signs a placeholder `intentKey` (M2) — `processWebhook` looks up by `providerRef`, so harmless.

## Verification
**Verified.** Built subagent-driven (fresh implementer per task; controller independently inspected every committed diff; dedicated final whole-implementation reviewer subagent → 3 must-fix issues found + fixed → re-verified).
- **Server suite:** 109/109 green (28 files) — incl. appointmentState (3), booking.service (5), refund.service (4), payment.service (6), cancellation.service (7), appointment.service (3), payfast.mock (5), availability.expiry (1), and the real-DB `booking.integration` (6: lock, double-book guard, pay→signed-webhook→confirmed, bad-sig 401, upcoming list, ≥2h cancel→refund settled).
- **Client suite:** 32/32 green (15 files) — incl. CancelModal (3), Booking (2), PaymentReturn (2), Upcoming (4: empty, list, cancel-confirm, <2h no-refund).
- **Build:** `npm --workspace client run build` clean (111 modules).
- **Prettier:** slice files normalized.
- **No schema change / no migration.**
- Root `npm run lint` still PRE-EXISTING broken (ESLint 9 flat-config missing) — not Slice C scope.

## Risk / rollback
No schema/migration. Main risk to guard at build time: the dev mock gateway + `/dev/*` checkout routes must be impossible to mount in production (env guard + provider switch defaulting to the throwing stub in prod). Lazy expiry leaves dead lock rows until rebook (accepted, invisible). Revert = delete created docs/files; no DB impact at this stage.

## Open items / next session
- **MERGED to `main`** (`8159437`, no-ff; 109+32 tests green post-merge). Not pushed (local-only per user). Next slice branches off this.
- **Next: Slice D — Video** (consumes confirmed appointments): Daily.co room/token, `video-token` route, `confirmed→in_progress→completed`/no-show transitions (extend `appointmentState.service`), P-11/P-12 + doctor today-view (D-02) + D-06 doctor-cancel UI. Then F07 reminders + reconciliation/evaluation workers; admin module (M4).
- **Task 4.1 canon doc updates — APPLIED** (user-approved full set; `77ffa7b`): 11 (ADR-22/ADR-23; v1.3), 15 (provider switches; v1.1) + 08 (v1.2)/10 (v1.1) cascade, 14 (mock adapter; v1.2), 05 (error codes + `/dev/*`; v1.3), 13 (status sweep; v1.4). Surgical edits + version bumps + revision footers per doc 00.
- **Branch disposition — user chose: merge to main locally** (no push).
- Deferred (later slices): video lifecycle + `video-token` (Slice D), reminder cadence + reconciliation worker (F07/F04.03), doctor appointment-list UI + D-06 modal (Slice D), admin dispute/records (M4).
- Low-risk follow-ups noted in Findings (I2 failed-path atomicity; M2 test intentKey) — optional.
