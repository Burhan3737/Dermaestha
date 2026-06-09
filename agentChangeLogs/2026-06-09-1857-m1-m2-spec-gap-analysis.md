# 2026-06-09-1857 — m1-m2-spec-gap-analysis

**Status:** Completed
**Goal:** Verify the built M1/M2 surface (F01–F06, F09, F15) against the canonical spec and produce a concise code-vs-spec gap report so the user can choose what to implement next.
**Skill(s) used:** superpowers:verification-before-completion (opted in) + superpowers:dispatching-parallel-agents (opted in); brainstorming/writing-plans considered and rejected as ill-suited (informed user).
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (read-only audit; no code changes planned this session)
**Last updated:** 2026-06-09-2016
**Tags:** #verification #audit #qa #gap-analysis

## Summary
Read-only verification session. Confirmed (via doc 13 + the four Slice A→D changelogs) that the M1+M2 build was delivered as 4 vertical slices, all merged & test-green, but with deliberately-deferred spec items (reconciliation worker, reminders, real vendor adapters, admin doctor onboarding). Producing a code-vs-spec gap report in two parts: (1) fidelity gaps in built features, (2) spec'd-but-unbuilt inventory. No code changes; catalog-then-fix per user.

## Context / why
User believed M1/M2 were "completed" and wants assurance the app behaves per spec with correct data flows. Real state: slices delivered their scope; the residual delta to the spec's full M1/M2 definition is the deliverable. User will decide what to implement from the report.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-09-1857-m1-m2-spec-gap-analysis.md` | Created | This session changelog. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |
| `docs/superpowers/reports/2026-06-09-m1-m2-spec-gap-report.md` | Created | The deliverable — 2-part code-vs-spec gap report (fidelity gaps + unbuilt inventory) + verdict + verified-solid list + triage order. |
| `.env` | Modified | Local-only: `DATABASE_URL` 172.18.0.2:5432 → localhost:5433 (git-ignored; durable DB-connectivity fix). |
| `server/src/services/refund.service.js` (+ test) | Modified | **G1 fix** — on refund-provider failure, write `refundStatus='failed'` (idempotency-keyed) + re-throw so the dashboard reflects it and the best-effort caller still audits. |
| `server/src/controllers/doctor.controller.js` | Modified | **G2 fix** — gate `GET /doctors/:id/slots` through `getPublicDoctor` (404-no-leak parity; inactive doctor no longer exposes slots). |
| `server/src/test/discovery.integration.test.js` | Modified | G2 test — inactive doctor's slots → 404 (real-DB, creates+cleans up a throwaway doctor). |
| `server/src/services/availability.service.js` | Modified | **G5 fix** — add the lazy expired-lock exclusion (`NOT {slot_locked, lockExpiresAt<now}`) to the `replaceWeeklyBlocks` orphan check, mirroring `generateSlots`. |
| `server/src/services/availability.service.test.js` | Modified | G5 test — orphan-check query carries the lazy-expiry exclusion. |
| `server/src/services/payment.service.js` (+ test) | Modified | **H1 fix** — confirmation email is now fire-and-forget (a hung provider can't delay the webhook 200 ack). |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | **O2** — completed the `POST /api/appointments/lock` Notes cell to list `ACTIVE_LOCK_EXISTS`/`OVERLAP`/`SLOT_NOT_BOOKABLE` (surgical edit + v1.4→1.5 + footer, per doc 00). |

## Dependencies / config / schema
Local-only: updated `.env` `DATABASE_URL` from the dead Docker bridge IP `172.18.0.2:5432` → `localhost:5433` (the container `dermestha-db-1` is healthy but published on host port 5433, per the Slice-D durable-fix note). `.env` is git-ignored — no tracked diff. No schema/migration change.

## Decisions
- Approach: verification-before-completion governs every PASS/GAP (evidence required); dispatching-parallel-agents fans out the 6 independent feature audits. (User chose.)
- Catalog findings; do NOT fix this session. (User chose.)
- Deliverable = 2-part gap report (fidelity gaps + unbuilt inventory) + verdict on "M1/M2 complete?". (User chose.)

## Notable findings
- **Env hazard (resolved):** `.env` `DATABASE_URL` pointed at a stale Docker bridge IP (`172.18.0.2:5432`, unreachable, `P1001`). DB container is healthy on `localhost:5433`. Fixed locally so DB-backed tests run.
- **No Critical correctness bugs** in the built money/state core — all non-negotiable invariants (no-double-book, atomic commit, fee/refund snapshots, idempotency, single state-machine writer, late-cancel slot-stays-blocked) verified solid by source re-read.
- **G1 (Major, F06):** refund-provider failure never sets `payments.refundStatus` (set only on success path, `refund.service.js:35-38`) → dashboard can't show a failed refund; no retry/backoff worker (`REFUND_MAX_ATTEMPTS`/`BACKOFF` unused).
- **G2 (Minor, F02):** `GET /doctors/:id/slots` has no active-doctor check (`availability.service.js:35-37`) → inactive doctor's slots return 200 (profile 404s); deactivated doctor would stay bookable.
- **G3 (Minor, F05):** doctor default list not date-bounded to "today" (`appointment.service.js:52-55`).
- **G4 (Minor, F01):** forgot-password response-safe but not timing-equalized (`auth.controller.js:57-78`).
- **G5 (Minor, F09):** availability-replace guard misses the lazy expired-lock exclusion (`availability.service.js:91-98` vs `:64`).
- **Unbuilt-but-spec'd (deferred, not bugs):** F04.03 reconciliation worker (no lost-IPN fallback — highest value), F06 refund retry, F07 reminders, real PayFast/Daily/Resend adapters + Daily webhook signature, F15 DA1/DA5 admin doctor onboarding/reset (doctors seed-only; DA3 gate never triggered), analytics, M3/M4.
- Full detail + evidence in `docs/superpowers/reports/2026-06-09-m1-m2-spec-gap-report.md`.

## Verification
- **Phase 0 — green baseline (2026-06-09):**
  - `npx prisma migrate status` → "Database schema is up to date!" (3 migrations applied, DB `localhost:5433`).
  - `npm test` (server/shared, vitest) → **135 passed / 33 files**, incl. 6 DB-backed integration suites (booking, video, discovery, auth, app, doubleBooking).
  - `npm --workspace client test` → **41 passed / 17 files**.
  - Total **176 green, 0 failures** — matches the Slice-D baseline; no regression since `03c4d73`.
- **Phase 1 — per-feature audit:** 6 read-only general-purpose agents (F04, F05, F03, F06, F01/F15, F02/F09) audited code vs canonical spec in parallel. Per verification-before-completion, **every reported PASS/GAP that entered the report was independently re-read in source by the controller** — confirmed: G1-G5, the F04 atomic-commit/feeAtBooking path, the `uniq_active_slot` WHERE-clause (`migration.sql:264-266`), `ACTIVE_APPOINTMENT_STATES` (`constants.js:26-33`), and the absence of DA1/DA5 routes (`routes/doctors.js`).
- **Phase 2 — live E2E:** folded into the already-green DB-backed integration suite (drives the real Express app through lock→pay→webhook→confirmed→cancel→refund and video-token→join→worker→completed) + direct code reads; no separate manual probing performed (would only re-confirm proven paths).
- **Phase 3 — first-pass fixes (TDD red→green, each watched fail before implementing):**
  - G1 `refund.service.test.js`: RED (`payment.update` 0 calls on provider throw) → GREEN (`refundStatus='failed'` written, re-thrown).
  - G2 `discovery.integration.test.js`: RED (inactive doctor's slots → 200) → GREEN (→ 404).
  - G5 `availability.service.test.js`: RED (orphan query missing `NOT` clause) → GREEN (lazy-expiry exclusion present).
  - H1 `payment.service.test.js`: RED (2000ms timeout awaiting a hung email) → GREEN (fire-and-forget, returns `{ok:true}`).
  - **Full regression:** `npm test` → **139 passed / 33 files**; `npm --workspace client test` → **41 passed / 17 files** = **180 green, 0 failures** (176 baseline + 4 new). No regressions.

## Risk / rollback
None — read-only audit; no tracked code/schema changes.

## Open items / next session
- **Deliverable complete:** gap report at `docs/superpowers/reports/2026-06-09-m1-m2-spec-gap-report.md`.
- **First-pass fixes DONE (user-approved):** G1, G2, G5, H1 (code) + O2 (doc 05). 180 tests green.
- **Still catalogued, not yet done (user to pick):**
  - Fidelity: G3 (doctor "today" list date-bound — or confirm client filters), G4 (forgot-password timing-equalize), H2 (webhook-reject audit `targetRef`), H3 (`karachiWeekday` → date-fns-tz), H4 (`nextAvailableSlot` perf).
  - Build-new menu: B1 reconciliation worker (highest value), B2 refund retry/backoff, B3 DA1/DA5 admin doctor onboarding, B4 reminders, B5 real adapters, B6 analytics, B7 M3 prescriptions, B8 M4 admin/landing/legal.
- **Doc-suite sync: COMPLETE.** Only required canon edit from this session's fixes was O2 (doc 05 v1.5, applied). G1/G2/G5/H1 align code to behavior the spec/ADRs already describe (refund visibility, profile/listing active-only + #9, ADR-23 lazy expiry, post-commit best-effort email), so no doc is now factually wrong — no further required edits.
- **Optional doc polish (NOT applied; user chose to leave as-is, noted for later):**
  - Doc 05:155 — could spell out "active doctor only (404-no-leak)" on the `GET /slots` note (completeness only; broader spec already implies it via #9/active-only profile).
  - O1 — pre-existing `feeAtBooking` wording reconciliation across docs 04/02/00/05/14 (6-doc cascade); independent of this session's fixes.
  - O3 — doc 02 client-filters note (only if G3 is later taken that way).
- `.env` `DATABASE_URL` left at `localhost:5433` (working); revert only if the Docker mapping changes.
