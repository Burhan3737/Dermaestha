# 2026-07-02-0026 — doctor-appointments-upcoming-past-design

**Status:** Partial (implemented + verified; UNCOMMITTED — awaiting user review, then commit + spec updates)
**Goal:** Brainstorm + spec + implement the switch of the doctor appointment view from a calendar-day "Today/History" split to the patient's time-based "Upcoming/Past" split, fixing the ended-today-but-still-cancellable bug.
**Skill(s) used:** superpowers:brainstorming → writing-plans → subagent-driven-development (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** 4f39a82 (design doc only). Code changes UNCOMMITTED (held for user review).
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
| `agentChangeLogs/2026-07-02-0026-doctor-appointments-upcoming-past-design.md` | Created (committed 4f39a82) | This session log. |
| `agentChangeLogs/index.md` | Modified (committed 4f39a82) | Added this session's index line. |

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
- **Commits are HELD** — awaiting user review before committing the 4 code files.
- Optional Minor (final-review triage): add a "no Write prescription" absence assertion to the client pending-row test (belt-and-suspenders; leak is structurally unreachable).
- Spec doc-impact tracked in the design §6 (docs 02 F05.02 / 06 D-02 / 11 new-ADR / 13); to be applied at the END, after code is committed and with explicit approval.
