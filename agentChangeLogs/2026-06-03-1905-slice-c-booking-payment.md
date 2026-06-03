# 2026-06-03-1905 — slice-c-booking-payment

**Status:** Partial (brainstorming + spec + plan complete; implementation pending)
**Goal:** Brainstorm + spec + plan + build Slice C (Booking + Payment) — the third vertical slice of the M1+M2 patient journey.
**Skill(s) used:** superpowers:brainstorming (user-invoked); will hand off to superpowers:writing-plans
**Ticket / issue:** None
**Branch:** main (code work will move to a feature branch before any commit)
**Commits / PR:** None yet
**Last updated:** 2026-06-03-1910
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

## Verification
Not verified (no code written yet — design/spec stage).

## Risk / rollback
No schema/migration. Main risk to guard at build time: the dev mock gateway + `/dev/*` checkout routes must be impossible to mount in production (env guard + provider switch defaulting to the throwing stub in prod). Lazy expiry leaves dead lock rows until rebook (accepted, invisible). Revert = delete created docs/files; no DB impact at this stage.

## Open items / next session
- Recommended canonical-doc updates (pending user approval, then apply): 11 (ADR-22 mock gateway, ADR-23 lazy-expiry-no-worker), 15 (env vars) + 08/10 cascade, 14 (mock adapter + dev checkout), 05 (any new error codes; `/dev/*` dev-only note), 13 (F03/F04/F06 + module status).
- After user reviews the written spec → invoke superpowers:writing-plans for the implementation plan.
- Then build (subagent-driven, per-task TDD + review), branch `feat/slice-c-booking-payment` off `main`.
