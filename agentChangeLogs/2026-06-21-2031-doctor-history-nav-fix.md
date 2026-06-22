# 2026-06-21-2031 — doctor-history-nav-fix

**Status:** Completed
**Goal:** Fix the doctor's broken History navigation, then (after a design pivot) rebuild the doctor
appointments page as an in-page Today/History tab page mirroring the patient Upcoming/Past page.
**Skill(s) used:** superpowers:systematic-debugging (user-invoked), superpowers:test-driven-development
**Ticket / issue:** None (user-reported bug)
**Branch:** main
**Commits / PR:** None
**Last updated:** 2026-06-22-2105
**Tags:** #bugfix #frontend

## Summary
The doctor's sidebar "History" link did nothing: `/doctor/history` rendered the same `DoctorToday`
component as `/doctor`, and the component's active tab came from `useState(initialTab)`, which only
reads the prop on first mount — so navigating between the two routes never changed the visible tab.
Root cause fixed by deriving the active view from the route. The page layout went through two
user-chosen designs: first sidebar-only (in-page tabs removed, ADR-41), then — after the user reviewed
the patient page — a pivot to mirror it: in-page Today/History tabs as route `<Link>`s, with the
doctor sidebar simplified to Appointments · Availability (ADR-42, supersedes ADR-41). The History tab
is retained because it is the only place a doctor can write prescriptions for completed appointments.

## Context / why
User report: "On the today page there are two tabs today and appointment but these two tabs are also
in the side bar as well. Clicking history on the side bar does nothing." Investigation (systematic
debugging) found two competing sources of truth for the active tab: the URL (route `/doctor/history`,
added by the prior ISSUE-4 fix) and local `useState`. They were never connected, so the route changed
but the content didn't. Spec doc 06 §2 and doc 02 F05.02 describe a "History tab", so the user
confirmed the sidebar-only direction, which requires tracked spec wording updates.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified | Active tab derived from route (`useLocation`); FINAL: in-page Today/History tabs as route `<Link>`s (patient-style); removed the old `initialTab` prop + local-state tab buttons. |
| `client/src/modules/doctor/doctor.routes.jsx` | Modified | Both `/doctor` and `/doctor/history` render `<DoctorToday />`; drop `initialTab` prop. |
| `client/src/layouts/SidebarLayout/SidebarLayout.jsx` | Modified | Doctor sidebar: removed the `History` link (now an in-page tab) and renamed `Today`→`Appointments`; sidebar is Appointments · Availability. |
| `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx` | Modified | History driven via route; FINAL: assert Today/History tabs render as route links with the active one marked. |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-41 (sidebar-only); v1.18→1.19. PENDING re-edit: ADR-42 (in-page tabs, supersedes ADR-41). |
| `docs/specification/02-SCOPE_FEATURE_DOCUMENT.md` | Modified | F05.02 reworded (v1.6→1.7). PENDING re-edit back to in-page tabs. |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified | §2 reworded (v1.7→1.8). PENDING re-edit back to in-page tabs. |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | §6 D-02 note (v1.23→1.24). PENDING re-edit back to in-page tabs. |

## Dependencies / config / schema
None.

## Decisions
- Root cause was `useState(initialTab)` ignoring prop changes on route navigation (no remount because
  both routes render the same component at the same tree position). Fixed by deriving the active view
  from the route — kept across both designs below.
- DESIGN PIVOT (mid-session): the first approved direction was sidebar-only (in-page tabs removed,
  ADR-41). After the user reviewed the patient appointments page, they chose instead to mirror it:
  bring the in-page tabs back as route-driven `<Link>`s, keep labels Today/History, and simplify the
  doctor sidebar to a single `Appointments` item (History becomes an in-page tab). This supersedes
  ADR-41 with ADR-42.
- The `History` tab is KEPT (the user asked whether it was needed): it is load-bearing — see findings.

## Notable findings
- The prior ISSUE-4 fix (commit f6dbe8b) added the `/doctor/history` route and a test asserting every
  sidebar link has a route — but the route never actually switched the tab, so the bug persisted
  behind a green test (symptom fix, not root cause).
- The Explore sub-agent initially mis-stated the in-page tab label as "Appointment" and claimed a
  `DoctorToday.test.jsx` that did not exist at the reported path — verified against ground truth.
- HISTORY IS LOAD-BEARING (verified in `server/src/modules/appointment/service.js:88-95`): the doctor
  default scope returns `state IN (confirmed,in_progress)` for TODAY only; history returns `state IN
  TERMINAL` (completed, prescription_issued, no-shows, cancelled). A `completed` appointment is
  terminal, so it leaves the today view immediately and only appears under history. "Write
  prescription" renders only on completed/prescription_issued rows → the History view is the SOLE
  entry point to the prescription-writing flow (spec F08.02 completed-gate + edge case #26). Removing
  it would break prescriptions. Hence it is kept as the second tab.

## Verification
- TDD (sidebar-only phase): 3 new-contract tests went red→green.
- TDD (in-page tabs pivot): 2 tab tests went red (tabs as route links + active state) then green.
- Final: `npx vitest run` (client) — 40 files / 141 tests all pass, incl. DoctorToday, doctor.routes,
  and SidebarLayout suites.
- Not yet verified in a running browser (unit tests render the real component through a router and
  assert tabs → route hrefs → active state → history scope → content).

## Risk / rollback
Low blast radius: doctor module only. Revert the three files to restore prior behavior. No schema,
API, or config changes.

## Open items / next session
- Spec updates: ADR-41 + the 02/06/13 sidebar-only wording were committed (commit 6e15d27). The pivot
  to in-page tabs now needs a follow-up spec pass (PENDING user approval): add ADR-42 (in-page tabs,
  supersedes ADR-41; mark ADR-41 Superseded), and re-update doc 02 F05.02 / doc 06 §2 / doc 13 §6 to
  describe the in-page Today/History tabs + the Appointments·Availability sidebar.
- Nothing pushed (per project rules); commits are local on `main`.
