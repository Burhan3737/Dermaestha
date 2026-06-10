# 2026-06-10-0020 — frontend-ux-dataflow-audit

**Status:** Completed (deliverables done; two human-approval decisions open — see Open items)
**Goal:** Adversarially re-verify prior frontend findings (G1–G4) + confirmed-good claims, discover new frontend UX/UI/data-flow gaps, draft doc-12-format test cases into a staging file, and produce a prioritized gap list. STRICTLY NON-DEV (no app code changes).
**Skill(s) used:** find-skills (opted in — evaluated external skills, none beat built-in); verify (opted in — for live behavioral checks)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (no code changes intended this session)
**Last updated:** 2026-06-10-0048
**Tags:** #audit #frontend #testing #non-dev

## Summary
Non-development frontend audit of Dermestha against the canonical spec suite (docs/specification 00–15). Three deliverables: (1) independently falsify prior claims G1–G4 and the "confirmed-good" list, plus find new gaps; (2) author frontend/E2E test cases in doc-12 format into a staging file (NOT into canon yet — pending approval); (3) a consolidated, prioritized gap list for scheduling. Method: read cited code (file:line), drive the running agent instance on :3001 via Playwright, query the agent DB. User opted into a multi-agent Workflow for the parallelizable read-only work; live app-driving stays serial in the controller (single shared browser + shared mutable DB).

## Context / why
Follows session 2026-06-09-2323 (run-app-two-instances), which asserted G1–G4 as confirmed and verified many spec flows live. This session re-verifies those as CLAIMS TO DISPROVE and extends coverage to untested areas (P-07 payment-return states, lock expiry, identity snapshot, late-cancel, password recovery, doctor-side video, routing/guards, validation/empty/loading states).

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-10-0020-frontend-ux-dataflow-audit.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |
| `docs/specification/_drafts/12-frontend-additions-DRAFT.md` | Created | Staging file: 13 proposed doc-12 test cases (next-free IDs) + 14 existing-TC re-grades + canon-insertion plan — NOT canon until approved. |
| `docs/specification/_drafts/GAP-LIST-2026-06-10-frontend-audit.md` | Created | Consolidated prioritized gap list (G1–G8 + deferred) + recommended dev schedule. |

## Dependencies / config / schema
None. Read-only audit. Runtime only: drives the already-running agent instance (:3001, DB `dermestha_agent`, mock payment/video) and queries the `dermestha-db-1` container (host port 5433).

## Decisions
- Skill choice: evaluated external skills via find-skills; `pedronauck/qa-report` imposes its own non-doc-12 templates, `orchestkit/testing-e2e` pushes writing Playwright test *code* (violates non-dev). Built-in `verify` is the best fit (run app, observe, no format/code imposition). Recorded unbiased.
- Workflow design: parallelize ONLY read-only work (static code+spec falsification, test-case drafting). Serialize live app-driving in the controller — the Playwright MCP browser is a single shared instance and the agent DB is shared mutable state (the G2 orphan-lock bug, once triggered, blocks ALL bookings via Single-Lock, which would corrupt concurrent agents).

## Notable findings
- (in progress — populated as each claim is falsified/confirmed and new gaps are found)
- Agent-DB grounding snapshot (read-only, 2026-06-09 19:24 UTC = 2026-06-10 00:24 Karachi, a Wednesday/availability day):
  - Real schema: `appointments.fee_at_booking`, `payments.amount/gateway_fee`, `doctors.fee/is_active/status`. Partial UNIQUE `uniq_active_slot` on (doctor_id, slot_start) covers active states (slot_locked…cancelled_no_refund) but EXCLUDES `cancelled_refunded` (so a refunded slot is correctly freed; an orphan `slot_locked` would re-occupy it). `payments_patient_user_id_slot_start_key` UNIQUE(patient_user_id, slot_start) — corroborates G2's claimed idempotency anchor (mechanism still to be confirmed in payment.service).
  - Seeded: ayesha (fee 250000=Rs2,500) & bilal (300000=Rs3,000), both active; Mon/Wed/Fri 18:00–21:00 Karachi = 13:00–16:00 UTC.
  - G2 pre-condition already primed: patient1@test.dev has a `success`+`settled` payment on (slot_start 2026-06-10 13:00Z) linked to a `cancelled_refunded` appt; that slot is currently free. Will run a FRESH book→refund→rebook cycle (owned credentials) for a clean repro.
  - Net-of-fee refund: 250000 − 6250 = 243750 paisa = Rs 2,437.50 (prior log "2,438"). Corroborates the F06 net-of-fee good-claim arithmetic.
- Workflow A (static, read-only, 7 agents) verdicts — adversarial falsification:
  - G1 CONFIRMED (client): DoctorProfile.jsx:22 `useState(todayKarachiYMD())` no setter; Booking.jsx slot via query param (no picker); shared/schemas/availability.js:24 + doctor.controller.js:22-31 accept any ?date=. Contradicts F03.01 (doc02:97), doc06 §3 day-tabs (06:155), TC-F03-001.
  - G2 CONFIRMED (server): schema.prisma `@@unique([patientUserId,slotStart], name:"intent_key")`; payment.service.js:29-33 upsert `update:{}` reuses stale row; appointmentState LEGAL (6-16) has no `cancelled_refunded` key; processWebhook (66-76) guards only `state==='confirmed'`, not `slot_locked`; Single-Lock booking.service.js:32-37.
  - G3 CONFIRMED: VideoRoom.jsx:36 → apiClient.js:11 prepends /api → /api/dev/video/join → index.js:42 /api catch-all 404 (dev router at /dev, index.js:45-46). Daily webhook /api/webhooks/daily separate. FIX-SCOPE nuance: prior log said client-only; equally a 1-line server fix (mount /api/dev). Bug confirmed; fix approach = choice.
  - G4 CONFIRMED (client): logout() session.jsx:35-38 wired ONLY in Placeholder (App.jsx:15-26); PatientLayout/SidebarLayout no logout; /profile + /doctor/history unrouted (dead). NEW: /doctor/change-password has NO client RoleRoute guard (routes.jsx mapped raw) — Medium (server guard exists). RoleRoute: no session→/login, role mismatch→/.
  - P-07 PARTIAL: only SUCCESS state built. NEW Critical — payment.failed DELETES the slot_locked appt (payment.service.js:57-63) → "retry within lock window" (edge #7) structurally impossible. Lock-expired checked only at intent creation, not on return (High). "Couldn't secure slot" (edge #6a) has no trigger because F04.03 reconciliation is milestone-deferred → DEFERRED, not a bug.
  - Good-cluster A: ALL 6 CONFIRMED (consent gate SignUp.jsx:77; formatPkr 250000→'Rs 2,500'; Asia/Karachi TZ; join window Upcoming.jsx:50-53; generic login error auth.service.js:46/49; RoleRoute redirect). fixScope none.
  - Cluster B PARTIAL: net-of-fee modal CancelModal.jsx:11-18 + refund.service quoteRefund CONFIRMED; identity snapshot Booking.jsx:47-80 + booking.service.js:59-62 CONFIRMED; password recovery ForgotPassword.jsx/ResetPassword.jsx BUILT; doctor video DoctorToday.jsx + DoctorCancelModal.jsx BUILT. NEW small gap: late-cancel modal wording "the slot stays blocked" vs spec F06.01:157 "proceed anyway?" (Medium UX). Past-appointments (P-09)/prescriptions (P-13/F08)/doctor Rx builder (D-05) NOT built = milestone-deferred per scope.
- LIVE verification on :3001 (Playwright + agent-DB), serial controller phase — ALL FOUR prior gap claims CONFIRMED (none refuted):
  - G1 CONFIRMED live: profile heading "Available today", 6 slots Wed 6:00–8:30pm, ZERO day-nav control. API GET /doctors/:id/slots?date= returns slots for 2026-06-12/06-17 (future avail days) and [] for 2026-06-11 (Thu, non-avail) → server supports any date (fix client-only); a Thursday visitor dead-ends with no way to reach Friday.
  - G2 CONFIRMED live (full chain): audit-p1 book 13:00Z → pay SUCCESS (confirmed, atomic) → cancel/refund (cancelled_refunded, slot freed) → REBOOK same 13:00Z → /pay REUSED the stale payment row (intent_key unique), appointment_id still = old cancelled A1, provider_ref updated to new ref, status already success → click Pay → live error page `{"error":{"code":"INVALID_TRANSITION","message":"Cannot move cancelled_refunded → confirmed."}}`. New appt A2 orphaned in slot_locked; Single-Lock proven: locking a different slot → 409 ACTIVE_LOCK_EXISTS. Severity worse than prior log: (a) temp ~10-min total-booking freeze (self-heals via lazy expiry ADR-23); (b) PERMANENT inability to ever rebook that slot (payment unique on (patient,slotStart) stays success-linked to A1). Patient dumped on raw JSON. Root cause SERVER (payment.service.js createIntent reuse + processWebhook missing slot_locked guard).
  - G3 CONFIRMED live via direct probe: POST /api/dev/video/join → HTTP 404 NOT_FOUND (what VideoRoom.jsx posts); POST /dev/video/join → HTTP 200 {"ok":true} (real mount); POST /api/webhooks/daily → 200 (prod path unaffected). Join never recorded in mock mode.
  - G4 CONFIRMED live: logged-in patient top-nav has NO logout; /profile (dead route) → Placeholder "Coming in a later slice." with the only "Log out" button. (Did not click logout — preserved session.)
  - Good-claims live-confirmed: P-04 consent gate (Create account [disabled] until ToS checked) + auto-login + /legal/* links; fee Rs 2,500/3,000; next-slot "Wed,10 Jun,6:00pm"; P-07 success "Booking confirmed" + atomic DB commit (fee_at_booking 250000, pay success, gateway_fee 6250); Join Call [disabled] for future slot; Cancel shown for confirmed; F06 net-of-fee modal "Paid Rs 2,500 / Gateway fee −Rs 63 / Refund Rs 2,438" + excludes-fee line; cancelled_refunded frees slot; lazy lock-expiry re-shows freed slot (TC-F03-005).
- NEW CRITICAL GAP **G5** (found live; prior session + static + unit tests all missed it): payment-FAILURE webhook path is broken against real Postgres. Drove mock "Fail" → HTTP 500 `{"error":{"code":"INTERNAL"}}`; appointment stays slot_locked, payment stuck `pending`. Root cause: payment.service.js:59-61 `appointment.deleteMany({state:'slot_locked'})` violates FK `payments_appointment_id_fkey` (ON DELETE RESTRICT) because the payment row still references the appt → throws; the following `payment.update(status:'failed')` is unreachable dead code. Proved via rolled-back DELETE (FK violation error). Mock-vs-real gap: unit tests mock Prisma so FK isn't enforced. Effect: every failed/aborted payment → raw 500, slot held locked 10 min (Single-Lock blocks patient; uniq_active_slot blocks slot), payment never marked failed. Breaks P-07 "Failure → retry within lock window" (doc 06 §3) + edge #7. Root cause SERVER, surfaces in P-07 frontend.
- Other confirmed gaps (static, not yet live-driven): /doctor/change-password lacks client RoleRoute guard (Medium; server guard exists); P-07 lock-expired has no dedicated return card (High); late-cancel modal wording divergence (Low/Med).
- NOTE: dev /dev/payment/complete renders raw JSON on any processWebhook exception — but this is a DEV-MOCK artifact (real PayFast redirects the browser to returnUrl independently of the server-to-server IPN), so NOT reported as a prod UX defect. The underlying G2/G5 server bugs are the real defects.
- Milestone-deferred (NOT bugs): past-appointments (P-09), prescriptions builder/download (D-05/P-13/F08), admin (A-01..A-05), F04.03 reconciliation ("couldn't secure slot" return state has no trigger), F07 reminders. Login lockout (SEC) NOT driven (would lock a shared account 15 min — needs user OK + throwaway acct).

## Verification
- Both instances healthy: `GET :3000/api/health` and `:3001/api/health` → `{"status":"ok","db":"up"}`.
- Static falsification: Workflow A (7 read-only subagents) cited file:line + spec IDs for every claim (full verdicts under Notable findings).
- Live on :3001 (Playwright + agent-DB psql), all evidence captured:
  - G1: profile "Available today" + 6 slots, no day-nav; API ?date= → slots for 06-12/06-17, [] for 06-11.
  - G2: full book→pay→refund→rebook cycle → live `INVALID_TRANSITION` error page; orphan slot_locked; Single-Lock `409 ACTIVE_LOCK_EXISTS`. DB rows captured at each step.
  - G3: `POST /api/dev/video/join → 404`, `/dev/video/join → 200`, `/api/webhooks/daily → 200`.
  - G4: patient nav no logout; /profile → Placeholder logout.
  - G5: "Fail" → `500 INTERNAL`; appt stays slot_locked, payment pending; FK-violation root cause proven via rolled-back DELETE (`payments_appointment_id_fkey` ON DELETE RESTRICT).
  - Good-claims: consent gate disabled, fee/TZ/next-slot, atomic confirm (DB), net-of-fee modal (Rs 2,438), Join disabled/Cancel shown, slot freed on refund, lazy lock-expiry.
- Deliverables produced: `_drafts/12-frontend-additions-DRAFT.md` (test cases) + `_drafts/GAP-LIST-2026-06-10-frontend-audit.md` (gap list).
- NOT executed: login lockout (TC-SEC-003) — locks shared account; G3/doctor-video full room UI + password-recovery E2E (static-confirmed built, low marginal value).

## Risk / rollback
Low. No application code changed. Deliverables are two staging drafts (not canon) + this log.
Agent-DB test data created this session (DB `dermestha_agent` only; user's `:3000/dermestha` untouched):
user `audit-p1@test.dev`; appts at 2026-06-10 13:00Z (A1 cancelled_refunded; A2 slot_locked w/ EXPIRED lock → lazy-freed) and 13:30Z (A3 slot_locked, lock expires ~19:49Z → lazy-freed); a stale `success` payment on (audit-p1, 13:00Z) + a `pending` payment on (audit-p1, 13:30Z). Slots self-heal via lazy expiry (ADR-23). LEFT IN PLACE intentionally so the user can reproduce G2/G5. Purge if desired: delete payments then appointments then user for `audit-p1`, OR re-seed the agent DB. Rollback of deliverables = delete the two `_drafts/` files + revert log/index entries.

## Open items / next session
- DECISION NEEDED: approve inserting the 13 drafted TCs into canonical doc 12 (per the §D plan), then bump doc 12 version + footer (+ optional doc 13 status note). Not edited yet (awaiting approval per CLAUDE.md).
- DECISION NEEDED: OK to run the login-lockout test (TC-SEC-003)? It locks an account 15 min — needs a throwaway account.
- Optional: purge the agent-DB audit test data (commands above) or leave for repro.
- Scheduling: see `_drafts/GAP-LIST-2026-06-10-frontend-audit.md` §3 — recommended order G2+G5 → G1 → G3 → G4 → G6/G7/G8 → milestone-deferred.
