# 2026-07-02-0026 — doctor-appointments-upcoming-past-design

**Status:** Partial
**Goal:** Brainstorm + write the design to switch the doctor appointment view from a calendar-day "Today/History" split to the patient's time-based "Upcoming/Past" split, fixing the ended-today-but-still-cancellable bug.
**Skill(s) used:** superpowers:brainstorming (opted in via /superpowers:brainstorming)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None
**Last updated:** 2026-07-02-0026
**Tags:** #bugfix #design

## Summary
The doctor view splits the default tab by Karachi calendar day, so a `confirmed` appointment that started earlier today and has already ended stays under "Today" and remains cancellable (and is duplicated under "History"). Designed the fix: give the doctor the patient's exact time-based Upcoming/Past split, so ended appointments move to Past (read-only). This also lets both roles share the same `upcomingWhere`/`pastWhere` fragments. Design doc written; no code yet.

## Context / why
User reported doctor appointments "seem a bit off": patient has Upcoming/Past (correct), doctor has Today/Past, and an appointment whose time has passed today still shows under Today with a working Cancel button. Root cause confirmed in `server/src/modules/appointment/service.js:69-79` (day-window `where`) + `DoctorToday.jsx:25,53` (client day-filter + confirmed-row Cancel button).

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-07-02-doctor-appointments-upcoming-past-design.md` | Created | The approved design (problem, semantics, role-separation, changes, tests, spec doc-impact). |
| `agentChangeLogs/2026-07-02-0026-doctor-appointments-upcoming-past-design.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |

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
- `date-fns-tz`/`tz` imports in the appointment service must stay (still used by `lockSlot`), so deleting the doctor day-branch requires no import cleanup.

## Verification
Not verified (design only; no code changes yet).

## Risk / rollback
Design document only — no runtime impact. Revert = delete the spec file + revert the index line.

## Open items / next session
- User to review the written spec, then proceed to superpowers:writing-plans for the implementation plan.
- Spec doc-impact tracked in the design §6 (docs 02/06/11-new-ADR/13); to be applied at the END, after code is committed and with explicit approval.
