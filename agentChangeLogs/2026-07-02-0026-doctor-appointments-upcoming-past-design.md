# 2026-07-02-0026 — doctor-appointments-upcoming-past-design

**Status:** Completed (implemented, verified, committed + pushed; spec updates applied)
**Goal:** Brainstorm + spec + implement the switch of the doctor appointment view from a calendar-day "Today/History" split to the patient's time-based "Upcoming/Past" split, fixing the ended-today-but-still-cancellable bug.
**Skill(s) used:** superpowers:brainstorming → writing-plans → subagent-driven-development (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** 4f39a82 (design) · 9eff65a (code fix + plan + changelog) · spec-updates commit (docs 00-index-adjacent set). Pushed to origin/main.
**Last updated:** 2026-07-02-0026
**Tags:** #bugfix #design #frontend #backend

## Summary
The doctor view splits the default tab by Karachi calendar day, so a `confirmed` appointment that started earlier today and has already ended stays under "Today" and remains cancellable (and is duplicated under "History"). Fix: give the doctor the patient's exact time-based Upcoming/Past split, so ended appointments move to Past (read-only). Both roles now share the same `upcomingWhere`/`pastWhere` fragments (role separation kept via ownership filter + include); `pending` rows become visible-but-inert for doctors. Designed, spec'd, planned, and implemented subagent-driven (2 tasks, per-task review + clean final whole-branch review). Server 30/30 + client 152 tests green; lint no new errors. Code not yet committed.

## Context / why
User reported doctor appointments "seem a bit off": patient has Upcoming/Past (correct), doctor has Today/Past, and an appointment whose time has passed today still shows under Today with a working Cancel button. Root cause confirmed in `server/src/modules/appointment/service.js:69-79` (day-window `where`) + `DoctorToday.jsx:25,53` (client day-filter + confirmed-row Cancel button).

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-07-02-doctor-appointments-upcoming-past-design.md` | Created (committed 4f39a82) | The approved design (problem, semantics, role-separation, changes, tests, spec doc-impact). |
| `docs/superpowers/plans/2026-07-02-doctor-appointments-upcoming-past.md` | Created (UNCOMMITTED) | TDD implementation plan (2 tasks) + review-phase verification scenarios. |
| `server/src/modules/appointment/service.js` | Modified (UNCOMMITTED) | Doctor branch of `listForRole` now reuses the shared `upcomingWhere`/`pastWhere` fragments instead of the Karachi calendar-day window; deleted `todayYMD`/`dayStart`/`dayEnd` + the day ternary; removed the orphaned `karachiWallTimeToUtc` import. |
| `server/test/unit/modules/appointment/service.test.js` | Modified (UNCOMMITTED) | Rewrote the doctor `listForRole` describe block for the time-based split: upcoming/history `where` shape + the ended-confirmed regression + not-a-doctor `[]`. |
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified (UNCOMMITTED) | Removed client-side `karachiDay` filter; relabeled tabs Today→Upcoming/History→Past (routes unchanged); show full `formatKarachi` date+time on every row (dropped time-only column + `formatKarachiTime` import); added inert `pending` row branch (badge + "Awaiting payment confirmation", no actions). |
| `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx` | Modified (UNCOMMITTED) | Updated tab/heading assertions to Upcoming/Past; added the inert-pending-row test; retitled the upcoming-list test. |
| `agentChangeLogs/2026-07-02-0026-doctor-appointments-upcoming-past-design.md` | Created 4f39a82 / updated | This session log. |
| `agentChangeLogs/index.md` | Modified (committed 4f39a82) | Added this session's index line. |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified (spec update) | Added ADR-45 (doctor time-based Upcoming/Past); marked ADR-42 partially superseded; v1.23. |
| `docs/specification/02-SCOPE_FEATURE_DOCUMENT.md` | Modified (spec update) | Rewrote F05.02 to the time-based Upcoming/Past split + inert pending rows; v1.11. |
| `docs/specification/05-API_SPECIFICATION_DOCUMENT.md` | Modified (spec update) | `GET /api/appointments` doctor scope = same time-based split as patient; §6.1 D2 row relabeled; v1.20. |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified (spec update) | D-02 relabeled Upcoming/Past (diagram + inventory); appt-row `.appt-time` column removed note; doctor inert-pending-row note; v1.18. |
| `docs/specification/12-SCOPE_FEATURE_TEST_CASES_DOCUMENT.md` | Modified (spec update) | Rewrote TC-F05-016 to the Upcoming/Past split rule; added TC-F05-020 (inert pending); v1.12. |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified (spec update) | §6 D-02 line → time-based Upcoming/Past + inert pending; v1.28. |
| `docs/specification/01-PRD_DOCUMENT.md` | Modified (spec update) | Core-features wording "today's" → "upcoming" appointments; v1.2. |

## Dependencies / config / schema
None.

## Decisions
- **Include `pending` in the doctor's Upcoming** (not confirmed-only): user chose to surface pending bookings so the doctor knows a slot is booked but awaiting admin payment confirmation. Pending rows are inert (badge + "Awaiting payment confirmation" note; no Join/Rx/Cancel). This newly exposes pending to doctors, who previously never saw them.
- **Reuse the patient's `upcomingWhere`/`pastWhere` for both roles** — the doctor's new rule is byte-for-byte the patient's, so the calendar-day branch is deleted. Role separation preserved via the ownership filter (`doctorId` vs `patientUserId`) + role-specific `include`.
- **Relabel tabs, keep routes** — `Today→Upcoming`, `History→Past`; routes stay `/doctor` and `/doctor/history` (mirrors patient's `/appointments/history` labelled "Past"). Minimal churn.
- **Call window confirmed**: Join activates 10 min before slot start through slot-end + 5 min (doc 02 F05.03, doc 15 §3.4); already implemented correctly.

## Notable findings
- The ended-today appointment currently appears in BOTH Today and History (duplication), and only the Today instance is wrongly actionable.
- Sidebar nav is already just "Appointments" → `/doctor` (`SidebarLayout.jsx:7`), so no sidebar change is needed — only the in-page tabs.
- **Correction to the design's import note:** `karachiWallTimeToUtc` was in fact used ONLY by the deleted day-window block (not `lockSlot`, which uses `formatInTimeZone` + `KARACHI`). The Task 1 review caught this; the now-orphaned import was removed (CLAUDE.md surgical-change rule). `formatInTimeZone`/`KARACHI` remain and are still used by `lockSlot`.
- Server workspace has no `test` npm script — focused server runs use `npx vitest run <path>`.

## Verification
- Server: `npx vitest run server/test/unit/modules/appointment/service.test.js` → 30/30 pass; `npx eslint server/src/modules/appointment/service.js` → clean.
- Client: DoctorToday suite 9/9 pass; full client suite 152 pass; `npm run lint` → same 14 pre-existing errors as clean `main` (verified via stash/pop), none new.
- Per-task reviews: Task 1 clean after the import fix; Task 2 Approved/spec-compliant.
- Final whole-branch review (opus): CLEAN — "Ready for user review: YES"; no Critical/Important; 2 Minors (no action).

## Risk / rollback
Behavior change (bugfix) but low blast radius — 4 files, no schema/route/sidebar change. `pending` appointments newly visible to doctors (inert). Revert = `git checkout -- <the 4 code files>` (currently uncommitted).

## Open items / next session
- Optional Minor (final-review triage): add a "no Write prescription" absence assertion to the client pending-row test (belt-and-suspenders; leak is structurally unreachable).
- DONE: code committed (9eff65a) + pushed; spec updates applied across 7 docs (01/02/05/06/11/12/13) after approval and committed/pushed.
- Root `npm test` surfaces pre-existing integration failures (shared dev DB not seeded for the integration suite; `discovery` expects ≥2 doctors) — proven identical with the change stashed, i.e. unrelated to this work. Not addressed here.
