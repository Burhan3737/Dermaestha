# 2026-06-14-2044 — three-role-flow-audit

**Status:** Completed
**Goal:** Visually walk every navigable flow for patient/doctor/admin against the locally-running app on mock adapters, find breaks/inconsistencies vs. specs, and produce a structured issue report for a separate fix session.
**Skill(s) used:** `verify` (opted in, lead) + `run` (opted in). Parallel-agents skill declined by user — role-streams run sequentially in one browser with data/session isolation.
**Ticket / issue:** devNotes/06_14_2026_2011_three_role_flow_audit_session_prompt.md
**Branch:** main (read-only on app code; no branch created)
**Commits / PR:** None (audit session — only permitted writes: report, this changelog, prisma/scripts/seed-baseline.js)
**Last updated:** 2026-06-14-2134
**Tags:** #audit #verify #qa

## Summary
FIND + REPORT audit session. No app-code edits, no committed Playwright specs. Permitted writes only: the audit report (`docs/superpowers/reports/2026-06-15-three-role-flow-audit.md`), this changelog, and one dev seed script (`prisma/scripts/seed-baseline.js`). Reports running-app vs. spec disagreements rather than reconciling them.

## Context / why
Slice H (S1–S7) complete + merged; v1 launch gate is CONDITIONAL GO. This session visually re-walks every navigable flow across the three roles to surface NEW flow breaks/inconsistencies not already captured by the known launch gates.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-14-2044-three-role-flow-audit.md` | Created | This session changelog |
| `agentChangeLogs/index.md` | Modified | Added this session's index line |
| `prisma/scripts/seed-baseline.js` | Created | The one permitted code write — clean-baseline seed (wipe + seed admin/2 patients/doctor/medicine/4 appts); Settings normalized to defaults |
| `docs/superpowers/reports/2026-06-15-three-role-flow-audit.md` | Created | The audit report — per-role flow inventory, issue log, proposed e2e gaps, doc-impact note, baseline reference |

## Dependencies / config / schema
- Reset the local dev DB twice via `prisma/scripts/seed-baseline.js` (start of audit + final restore). No schema migration; seed script only.
- One in-session settings change (min lead 30→60) via the admin UI; the final reseed normalizes Settings to defaults regardless.
- No package/env changes.

## Decisions
- User approved `verify` + `run` only; declined parallel-agents skill → role-streams run sequentially in one Playwright MCP browser with data/session isolation (results valid either way per prompt).
- User approved resetting the local dev DB for the clean baseline.
- Known Conditional-Go gates (DRAFT legal copy F16, email-domain delivery, real-PayFast wiring, Daily webhook-HMAC smoke, dev-DB clutter) are OUT of scope to re-report; only NEW flow issues reported.

## Notable findings
Findings accumulate here as flows are walked (full detail + repro go in the report).
- **[HIGH] Booking funnel locked to the current Karachi day.** `client/src/modules/doctor/views/DoctorProfile/DoctorProfile.jsx` hardcodes `const [date] = useState(todayKarachiYMD())` (no setter), heading "Available today", and only calls `/slots?date=<today>`. P-06 (`Booking.jsx`) has no picker — it reads a `?slot=` param. No day tabs anywhere (contradicts doc 06 §3 "Slots are grouped under day tabs"). When today has no bookable slots (evening/closed/doctor not available today), the patient dead-ends at "No slots available today." with no way to reach a future day — even though the listing advertises "Next: Mon, 15 Jun". Backend `/slots?date=` serves any date fine → purely a frontend dead-end. Invisible to E2E J1 because the e2e seed always creates a same-day slot.
- **[MED] Desktop patient nav has no Profile/logout.** `PatientLayout.jsx` top nav (logged-in) renders only Browse + Appointments; the Profile tab (which hosts Log out) is in the `tabbar only-mobile` bar only. Desktop patients cannot reach Profile or log out via the UI. doc 06 §2 says Profile should be in the top nav on desktop.
- **[LOW-MED] Landing featured/hero doctor cards dead-end.** P-01 featured + hero cards all link to `/doctors/sample` → "Doctor not found." (static placeholder data is accepted per doc 06 §3, but routing the primary acquisition CTA to a not-found page is a first-visit dead-end).
- **[LOW] Public-page console error.** Every public/anonymous page logs `401 @ /api/auth/me` (SPA auth bootstrap). By design but surfaces as a console error on each load.
- **[LOW] /profile view lacks "basic details".** doc 06 registry note says Profile routes to "a minimal account view (logout + basic details)"; actual shows only "Coming in a later slice." + Log out (no details), and renders with no nav chrome.
- **[INFO/doc] Login form has no role field.** P-05 collects email+password only; doc 05 documents `POST /api/auth/login` body as `{ email, password, role }` — `role` appears vestigial (routing is by stored role). Possible doc drift.

Full issue list (detail + repro in the report):
- [HIGH] ISSUE-1 booking funnel locked to today (no day/date picker; P-03/P-06).
- [MED] ISSUE-2 no logout for desktop-patient/doctor/admin (only mobile patient tab → /profile).
- [MED] ISSUE-3 payment-fail → infinite "Awaiting payment confirmation…" (P-07).
- [MED] ISSUE-4 doctor sidebar "History" link is a dead route (/doctor/history).
- [LOW-MED] ISSUE-5 landing featured/hero cards dead-end to "Doctor not found." (/doctors/sample).
- [LOW-MED] ISSUE-6 add-doctor doesn't enforce the required photo (F10.01).
- [LOW-MED] ISSUE-7 medicine catalogue has no Edit affordance (A-02).
- [LOW] ISSUE-8 no real 404 page (unknown routes → placeholder).
- [LOW] ISSUE-9 doctor history shows raw state enums.
- [LOW] ISSUE-10 cross-tenant Rx 404 renders a blank page (no leak; no message).
- [LOW] ISSUE-11 /profile lacks basic details/chrome; logout no redirect.
- [INFO/doc] ISSUE-12 login form has no role field (doc 05 body lists `role`).
- [INFO] ISSUE-13 public pages log `401 /api/auth/me` console noise.
- Seed self-bug (fixed): seed-baseline didn't normalize Settings (upsert update:{}) → fixed to set defaults.

Positives: evaluation worker drove confirmed→in_progress→doctor_no_show live; net-of-fee refund math correct; slot-lock race guarded; immutable Rx append + confirm gate; full audit trail captured.

Second pass (user-requested completeness check) — both PASS, no new issues:
- D-06 doctor-initiated cancel: required internal reason gates the confirm; → `doctor_cancelled` + `appointment.doctor_cancelled` (doctor actor, reason captured).
- P-19 empty-upcoming state (patient2): "No upcoming appointments." + "Browse doctors" → /browse (F05.01).
- e2e verification (read-only, no specs written): all of j1–j6 + support/global-setup read line-by-line. Verdict added to report §3.A — keep j2/j3/j4/j5; STRENGTHEN j1 fail-path (masks ISSUE-3); UPDATE j1 happy-path selector + global-setup/db seed on ISSUE-1 fix; UPDATE j6 on ISSUE-6 fix (it creates a doctor with no photo and expects success). j5 404-no-leak asserts API only → ISSUE-10 UI uncovered.

PASS (all three streams): patient P-01/P-02/P-03(render)/P-04 consent gate/P-05+routing/forgot+reset/P-06 who-for+someone-else/pay-success→P-07/P-08 join-gating/P-11/P-12 (0 console errors)/P-09/P-13+PDF/cancel ≥2h+<2h/slot-lock race/cross-tenant no-leak/logout; doctor D-01 DA3/D-02 today+history tab/D-05 builder+submit+immutability/D-03 grid; admin A-01 add/edit/activate/deactivate/reactivate/reset-pw, A-02 add+deactivate, A-03 alerts, A-04 records+detail+dispute+audit+search, A-05 settings save.

## Verification
- `node --env-file=.env prisma/scripts/seed-baseline.js` → clean baseline seeded (wiped 439 users/214 doctors/etc.).
- `npm run build:client` → success. Server booted on mocks; `GET /api/health` → 200 `{"status":"ok","db":"up"}`.
- All three streams walked via Playwright MCP (single shared browser, sequential mode per user decision). Evidence snapshots/screenshots under `.playwright-mcp/`.
- Final reseed verified: `Settings(id=1)` normalized to `{minBookingLeadMinutes:60, fallbackFeePctBps:0, fallbackFeeFixed:0}`; clean counts 4 users / 1 doctor / 1 medicine. Seed is idempotent/re-runnable.

## Risk / rollback
Local dev DB will be wiped + reseeded to the baseline (intentional, user-approved). To revert: re-run any prior seed, or re-run `node prisma/scripts/seed-baseline.js` to return to the documented baseline. No app code changes → no code rollback needed.

## Open items / next session
- Output: `docs/superpowers/reports/2026-06-15-three-role-flow-audit.md` + `prisma/scripts/seed-baseline.js` (inputs to the later fix-and-test session).
- Server still running in background on :3000 (mock adapters) — stop it when done.

## Doc-impact check (CLAUDE.md — mandatory)
Ran the doc-impact check against specs 00–15. **No spec updates to apply in this find+report session** — almost all issues are code-vs-spec where the SPEC is correct and the CODE is wrong (ISSUE-1 vs doc 06 §3 day-tabs / F03.01; ISSUE-2 vs doc 06 §2; ISSUE-3 vs doc 06 §3 P-07 states; ISSUE-6 vs F10.01 photo-required) → these are CODE fixes for the next session, not spec edits. Three candidates flagged for the fix session to CONFIRM-then-maybe-edit (not edited now): doc 05 §1 login body `role` (ISSUE-12), doc 06 Profile registry note (ISSUE-11), doc 02 F11.03 medicine edit UI (ISSUE-7). Per the session being read-only on app code + report-only, no spec files were touched.
