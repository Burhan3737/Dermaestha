# 2026-06-14-2336 — flow-audit-fix-and-test

**Status:** Completed — all 13 fixes done, verified in-app, committed (f6dbe8b on `fix/flow-audit-issues`); spec edits applied (docs 05/06/12/13). Not pushed (CLAUDE.md).
**Goal:** Fix the 13 flow issues from the 2026-06-15 three-role visual audit, each locked test-first (red→green) with a committed Playwright/unit spec, without disrupting the green j1–j6 suite.
**Skill(s) used:** `find-skills` (opted in, for recommendation), `superpowers:test-driven-development` (lead, opted in)
**Ticket / issue:** docs/superpowers/reports/2026-06-15-three-role-flow-audit.md
**Branch:** main (no new branch — awaiting approval per CLAUDE.md)
**Commits / PR:** None yet
**Last updated:** 2026-06-15-0115
**Tags:** #bugfix #qa #tdd #frontend

## Summary
Fix session acting on the read-only three-role flow audit. Scope = ALL 13 issues (user decision), hard no-regression constraint. Each fix authored test-first. Class-B (spec-silent) directions approved up front as a batch. Spec edits tracked in a running list, applied only at end with approval (CLAUDE.md change protocol).

## Context / why
Slice H · S7 complete; v1 gate Conditional-Go. The 2026-06-15 audit (find+report) surfaced 1 HIGH + 3 MED + several LOW flow issues not covered by the known launch gates. This session fixes them and extends e2e coverage.

## Files changed
| File | Action | What & why |
|---|---|---|
| `agentChangeLogs/2026-06-14-2336-flow-audit-fix-and-test.md` | Created | This session changelog |
| `agentChangeLogs/index.md` | Modified | Added this session's index line |
| `client/src/modules/doctor/views/DoctorProfile/DoctorProfile.jsx` | Modified | ISSUE-1: added day-tab navigation (next 7 Karachi days) + `setDate`; removed orphaned `todayKarachiYMD` |
| `client/src/modules/doctor/views/DoctorProfile/DoctorProfile.test.jsx` | Modified | ISSUE-1: RED→GREEN test — P-03 exposes day nav + fetches a future day's slots |
| `e2e/support/db.js` | Modified | ISSUE-1: primary doctor → full-week availability (kills midnight fragility); added `Dr E2E Future` (future-only weekday); removed brittle `todayWindow()` |
| `e2e/global-setup.js` | Modified | ISSUE-1: updated stale "same-day slot" comment on the lead-time line |
| `e2e/tests/j1-book-pay-confirm.spec.js` | Modified | ISSUE-1 (§3.A): book via day picker (future day tab) — time-independent happy + fail + re-book |
| `e2e/tests/j7-future-day-booking.spec.js` | Created | ISSUE-1 (§3.B): future-day booking journey (today empty → future day books) |
| `server/src/modules/appointment/service.js` | Modified | ISSUE-3: `getForRole` detail now returns `lockExpiresAt` so P-07 can detect a released/expired lock |
| `client/src/modules/booking/useBooking.js` | Modified | ISSUE-3: `isLockReleased`/`isTerminalBooking` helpers; poll stops on terminal outcome |
| `client/src/modules/booking/views/PaymentReturn/PaymentReturn.jsx` | Modified | ISSUE-3: terminal "Payment not completed" card on a released lock; no infinite poll |
| `client/src/modules/booking/views/PaymentReturn/PaymentReturn.test.jsx` | Modified | ISSUE-3: RED→GREEN test for the terminal failure state |
| `e2e/tests/j1-book-pay-confirm.spec.js` | Modified | ISSUE-3 (§3.A): fail-path asserts the positive "Payment not completed" card |
| `client/src/layouts/PatientLayout/PatientLayout.jsx` | Modified | ISSUE-2: Profile link in the desktop top nav when signed in |
| `client/src/layouts/PatientLayout/PatientLayout.test.jsx` | Created | ISSUE-2: RED→GREEN — desktop top nav exposes Profile |
| `client/src/layouts/SidebarLayout/SidebarLayout.jsx` | Modified | ISSUE-2: Log out control (doctor + admin chrome) → `api.post('/auth/logout')` + full-reload to `/login` (context-free to avoid breaking the 7 admin view tests); ISSUE-4: `export DOCTOR_LINKS` |
| `client/src/layouts/SidebarLayout/SidebarLayout.test.jsx` | Created | ISSUE-2: RED→GREEN — sidebar Log out posts `/auth/logout` |
| `e2e/tests/j8-logout-reachability.spec.js` | Created | ISSUE-2 (§3.B): logout reachable from doctor/admin sidebar + patient-desktop Profile |
| `client/src/modules/doctor/doctor.routes.jsx` | Modified | ISSUE-4: register `/doctor/history` → DoctorToday(initialTab=history) so the sidebar link resolves |
| `client/src/modules/doctor/doctor.routes.test.jsx` | Modified | ISSUE-4: RED→GREEN — every DOCTOR_LINKS path has a route |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified | ISSUE-4: `initialTab` prop; ISSUE-9: history uses `stateLabel()` friendly labels |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.test.jsx` | Modified | ISSUE-9: RED→GREEN — history renders friendly labels, not raw enums |
| `client/src/modules/marketing/views/Landing/Landing.jsx` | Modified | ISSUE-5: static hero/featured cards are display-only (removed dead `/doctors/sample` links) |
| `client/src/modules/marketing/views/Landing/Landing.test.jsx` | Modified | ISSUE-5: RED→GREEN — no card links to `/doctors/sample` |
| `client/src/shared/NotFound/NotFound.jsx` | Created | ISSUE-8: dedicated 404 page (empty-state pattern) |
| `client/src/shared/NotFound/NotFound.test.jsx` | Created | ISSUE-8: RED→GREEN — 404 renders not-found + Browse CTA |
| `client/src/App.jsx` | Modified | ISSUE-8: catch-all → `<NotFound/>`; removed orphaned `Placeholder` + `useAuth` import |
| `e2e/tests/j9-ui-states.spec.js` | Created | ISSUE-8 (§3.B): unknown route → 404 page (Rx state added in ISSUE-10) |
| `client/src/modules/profile/views/Profile/Profile.jsx` | Created | ISSUE-11: `/profile` minimal account view (basic details + logout + redirect) |
| `client/src/modules/profile/views/Profile/Profile.test.jsx` | Created | ISSUE-11: RED→GREEN — details + working logout |
| `client/src/modules/profile/profile.routes.jsx` | Created | ISSUE-11: `/profile` route (any authenticated user) |
| `client/src/routes.jsx` | Modified | ISSUE-11: register profileRoutes in the aggregator |
| `e2e/tests/j8-logout-reachability.spec.js` | Modified | ISSUE-11: patient logs out via Profile page (full journey) |
| `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.jsx` | Modified | ISSUE-10: error/404 path renders "This prescription is not available." (no blank page) |
| `client/src/modules/prescription/views/PrescriptionView/PrescriptionView.test.jsx` | Modified | ISSUE-10: RED→GREEN — not-found message on cross-tenant/404 |
| `e2e/tests/j9-ui-states.spec.js` | Modified | ISSUE-10 (§3.B): cross-tenant Rx shows the not-available message |
| `client/src/modules/admin/components/DoctorForm/DoctorForm.jsx` | Modified | ISSUE-6: add-mode requires a profile photo (F10.01) before submit |
| `client/src/modules/admin/components/DoctorForm/DoctorForm.test.jsx` | Modified | ISSUE-6: RED→GREEN new test + lockstep updates (#1/#3 now attach a photo) |
| `client/src/modules/admin/views/AdminDoctors/AdminDoctors.test.jsx` | Modified | ISSUE-6: photo label query → regex (label gained "— required") |
| `e2e/tests/j6-admin-onboarding.spec.js` | Modified | ISSUE-6 (§3.A): onboard attaches a PNG photo (required) |
| `client/src/modules/admin/views/AdminMedicines/AdminMedicines.jsx` | Modified | ISSUE-7: Edit affordance — prefill form + PATCH (F11.03) |
| `client/src/modules/admin/views/AdminMedicines/AdminMedicines.test.jsx` | Modified | ISSUE-7: RED→GREEN — Edit prefills + PATCHes changed fields |
| `server/src/test/auth.integration.test.js` | Modified | ISSUE-12: lock login ignores body `role`; ISSUE-13: anon `/auth/me` → 200 null |
| `server/src/modules/auth/controller.js` | Modified | ISSUE-13: `me` returns 200 `null` for anonymous (no 401 console noise on public pages) |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified | Spec edit (v1.16): login `role` ignored; `/auth/me` anon-200; appointment detail `lockExpiresAt` |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified | Spec edit (v1.6): sidebar logout, P-03 day picker, photo-required, A-02 edit, P-07 terminal, 404/cross-tenant, display-only cards |
| `docs/specification/12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Modified | Spec edit (v1.7): TC-F03-010/F04-009/F08-015/F10-007/F11-007 + flow-audit fix-cycle §6 record |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | Spec edit (v1.20): M4 snapshot flow-audit fix cycle + suite counts 322/135/17 |

## Dependencies / config / schema
None yet.

## Decisions
- Skill: TDD is lead (red→green per fix). `find-skills` used only to confirm relevant skills are already installed (no marketplace install).
- Scope: ALL 13 issues, with a hard no-regression constraint (keep j1–j6 green).
- Class-B (spec-silent) direction batch approved up front:
  - ISSUE-2 logout: CODE (patient desktop Profile in top nav + doctor/admin sidebar logout) + DOC (doc 06 §2).
  - ISSUE-5 landing cards: CODE (make static featured/hero cards display-only; drop dead `/doctors/sample` links).
  - ISSUE-6 photo: CODE (client-side required in A-01 add flow; edit stays optional).
  - ISSUE-7 medicine edit: CODE (reuse add-form for edit + PATCH) + DOC (doc 06 A-02).
  - ISSUE-8 404: CODE (NotFound page reusing empty-state).
  - ISSUE-10 cross-tenant Rx: CODE (empty/not-found message on error path).
  - ISSUE-12 login role: DOC only (doc 05 §36) — code intentionally ignores body `role` (enumeration-safety); lock with a server test.
  - ISSUE-13 console noise: CODE (suppress expected 401 from /api/auth/me bootstrap).
- ISSUE-1: add day-navigation on the existing slot surface (P-03 DoctorProfile), do NOT relocate slot selection to P-06 (smallest change satisfying F03.01 + doc 06 day-tabs; avoids disrupting j1 profile→?slot→booking flow).

## Notable findings
- `useAuth().logout()` exists but is wired to nothing in the UI (App.jsx Placeholder only).
- `stateLabel()` exists (`client/src/modules/appointment/stateLabel.js`), used by patient Past view, NOT by doctor history.
- Login schema (`shared/schemas/auth/auth.js`) accepts `role` optional with an explicit comment that it is NON-authoritative; handler never reads it → ISSUE-12 is doc-drift, not a code bug.
- `PATCH /api/admin/medicines/:id` exists; A-02 has only Deactivate/Reactivate; inline add-form reusable for edit.
- Doctor photo uploaded via a SEPARATE `POST /api/doctors/:id/photo` after create; not required anywhere → ISSUE-6 enforced client-side in add flow.
- `/profile` route does not exist; falls through to catch-all Placeholder ("Coming in a later slice.").

## Verification
**Baseline (before any code change), 2026-06-14 ~23:48 Asia/Karachi:**
- Server+shared unit/integration: initially 3 files red (booking/notification/prescription) because the audit's `seed-baseline.js` had wiped the dev-seed doctor `dr.ayesha@dermestha.dev`. Restored via `npm run db:seed` → **320/320 passed (45 files), 0 skipped**.
- Client unit/component: **123/123 passed (36 files)**.
- e2e Playwright: **9/11 passed; j1 (happy + fail) red** — NOT a regression. Root cause = time-of-day exposing ISSUE-1: `todayWindow()` produces a past same-day slot (23:00–23:30) near midnight, and with no day-picker (ISSUE-1) `button.slot` never renders. ISSUE-1 fix (day-nav + future-only-availability seed doctor + j1 books a future day) will make j1 time-independent.
- Ordering rule for this session: server integration tests need `npm run db:seed` first; e2e self-seeds (global-setup wipes). Keep port :3000 free so Playwright rebuilds fresh.

**Final (all 13 issues fixed), 2026-06-15 ~00:42 Asia/Karachi:**
- Server+shared: **322/322 passed (45 files)** — baseline 320 + 2 new auth tests (ISSUE-12 role-ignored, ISSUE-13 anon `/me` 200). (One transient cross-file Postgres-contention flake in `notification.integration` under parallel workers — passed in isolation + on rerun; not touched by this work.)
- Client: **135/135 passed (40 files)** — baseline 123 + 12 new/strengthened (DoctorProfile day-nav, PaymentReturn terminal, PatientLayout/SidebarLayout/NotFound/Profile, DoctorToday labels, Landing, PrescriptionView, DoctorForm photo, AdminMedicines edit).
- e2e: **17/17 passed** — baseline 11 + j7 (future-day) + j8×3 (logout) + j9×2 (404, cross-tenant Rx); j1 strengthened/time-independent; j6 attaches a photo.
- Verdict: no regressions; every audit issue fixed test-first (red→green) and locked.

**In-app verify pass (`verify` skill), 2026-06-15 ~01:12 Asia/Karachi** — drove the running app (mock adapters, baseline accounts) in a real browser; all 13 confirmed: landing 0 console errors + 0 `/doctors/sample` links; anon `/auth/me`→200 null; P-03 7 day tabs + future-day slots; P-07 "Payment not completed" terminal (no poll); `/profile` details+logout→/login; doctor+admin sidebar logout→/login; `/doctor/history` resolves with friendly "Completed"; add-doctor "photo is required" blocks save; medicine Edit→Rs 350; 404 "Page not found"; cross-tenant Rx "not available" (0 leaked rows). Screenshots: `verify-issue1-day-tabs.png`, `verify-issue3-payment-fail.png`, `verify-issue10-cross-tenant-rx.png` (repo root).

## Doc-impact verdict (CLAUDE.md — mandatory)
Spec updates WERE required and have been applied (user-approved "apply all incl. confirm items"), AFTER code commit, per the doc-00 change protocol: docs **05, 06, 12, 13** edited surgically with version bumps + revision-footer rows. See the applied list above. Remaining specs (00–04, 07–11, 14, 15) unaffected.

## Risk / rollback
Frontend-heavy changes; risk = regressing the green j1–j6 e2e suite. Mitigation: run `npm run test:e2e` + `npm test` green before/after; surgical edits only. No schema changes planned. Revert = git restore the touched files.

## Spec doc-impact list — APPLIED 2026-06-15 (code committed f6dbe8b, user approved "apply all incl. confirm items")
- [x] doc 05 (v1.15→1.16): `GET /api/appointments/:id` detail adds `lockExpiresAt` [ISSUE-3]; `POST /api/auth/login` body `role` documented accepted-but-ignored/non-authoritative [ISSUE-12]; `GET /api/auth/me` anon → 200 `null` not 401 [ISSUE-13].
- [x] doc 06 (v1.5→1.6): §2 doctor/admin sidebar Log out + History-resolves note [ISSUE-2/4]; §3 day-tabbed picker on P-03 [ISSUE-1]; A-01 photo required on add [ISSUE-6]; new A-02 medicine Edit note [ISSUE-7]; P-07 single terminal "Payment not completed" + no-poll [ISSUE-3]; Not-found & cross-tenant states (404 + Rx message) [ISSUE-8/10]; Landing featured cards display-only [ISSUE-5].
- [x] doc 12 (v1.6→1.7): added TC-F03-010, TC-F04-009, TC-F08-015, TC-F10-007, TC-F11-007 + §6 flow-audit fix-cycle execution record (j7/j8/j9; logout+404 covered there).
- [x] doc 13 (v1.19→1.20): §2 M4 snapshot records the flow-audit fix cycle + updated suite counts (322/135/17).
- No edit required (code caught up to a correct spec): ISSUE-1 core (F03.01), ISSUE-2 patient-desktop (doc 06 §2), ISSUE-4 route (doc 06 §2), ISSUE-9 (doc 06 §3 badge map), ISSUE-11 (doc 06 §2 registry note).

## Open items / next session
- DONE: fixes + tests + in-app verify + spec edits, all committed on `fix/flow-audit-issues`.
- **Awaiting user:** push `fix/flow-audit-issues` and/or open a PR (CLAUDE.md forbids push without approval); merge decision.
- Untracked pre-existing artifacts left for the human to decide on (NOT part of this branch's commits): `CLAUDE.md` mod, the audit changelog/report/screenshots, `prisma/scripts/seed-baseline.js`, and a runtime `uploads/` dir (consider gitignoring).
- The mock server on :3000 was stopped at the end of the verify pass.
