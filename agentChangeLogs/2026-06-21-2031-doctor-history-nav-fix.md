# 2026-06-21-2031 — doctor-history-nav-fix

**Status:** Completed
**Goal:** Fix the doctor's broken History sidebar navigation and remove the duplicate in-page Today/History tabs (sidebar-only navigation).
**Skill(s) used:** superpowers:systematic-debugging (user-invoked), superpowers:test-driven-development
**Ticket / issue:** None (user-reported bug)
**Branch:** main
**Commits / PR:** None
**Last updated:** 2026-06-21-2031
**Tags:** #bugfix #frontend

## Summary
The doctor's sidebar "History" link did nothing: `/doctor/history` rendered the same `DoctorToday`
component as `/doctor`, and the component's active tab came from `useState(initialTab)`, which only
reads the prop on first mount — so navigating between the two routes never changed the visible tab.
The page also carried in-page Today/History tabs that duplicated the sidebar links with a separate,
unsynced state source. Fix (user-approved direction "Sidebar-only"): remove the in-page tabs and
derive the view purely from the route, leaving the sidebar links as the single navigation mechanism.

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
| `client/src/modules/doctor/views/DoctorToday/DoctorToday.jsx` | Modified | Derive active tab from route (`useLocation`); remove in-page tab buttons + `initialTab` prop. |
| `client/src/modules/doctor/doctor.routes.jsx` | Modified | Both `/doctor` and `/doctor/history` render `<DoctorToday />`; drop `initialTab` prop. |
| `client/test/unit/modules/doctor/views/DoctorToday/DoctorToday.test.jsx` | Modified | Drive history via route, not button click; assert no in-page tab buttons. |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-41 (sidebar-only doctor nav, route-derived view); v1.18→1.19. |
| `docs/specification/02-SCOPE_FEATURE_DOCUMENT.md` | Modified | F05.02 "History tab" → sidebar History view at `/doctor/history`; v1.6→1.7. |
| `docs/specification/06-DESIGN_SYSTEM_THEME_DOCUMENT.md` | Modified | §2 History-link note → route-derived, no in-page tabs; v1.7→1.8. |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | §6 D-02 note → Today/History sidebar-only; v1.23→1.24. |

## Dependencies / config / schema
None.

## Decisions
- Sidebar-only navigation (user-approved): in-page Today/History tabs removed; URL is the single
  source of truth for which view shows. Resolves both the dead-link bug and the duplication.
- Root cause was `useState(initialTab)` ignoring prop changes on route navigation (no remount because
  both routes render the same component at the same tree position).

## Notable findings
- The prior ISSUE-4 fix (commit f6dbe8b) added the `/doctor/history` route and a test asserting every
  sidebar link has a route — but the route never actually switched the tab, so the bug persisted
  behind a green test (symptom fix, not root cause).
- The Explore sub-agent initially mis-stated the in-page tab label as "Appointment" and claimed a
  `DoctorToday.test.jsx` that did not exist at the reported path — verified against ground truth.

## Verification
- TDD red: 3 new-contract tests failed before the fix (no-tabs, /doctor/history scope, ISSUE-9
  labels) — confirming the component ignored the route.
- TDD green: `npx vitest run` (client) — 40 files / 141 tests all pass after the fix, incl. the
  DoctorToday, doctor.routes, and SidebarLayout suites.
- Confirmed `.tabs`/`.tab` CSS is NOT orphaned (still used by AdminRecords + patient Upcoming/Past).
- Not yet verified in a running browser (unit tests render the real component through a router and
  assert route → history scope → content, which covers the root cause).

## Risk / rollback
Low blast radius: doctor module only. Revert the three files to restore prior behavior. No schema,
API, or config changes.

## Open items / next session
- Spec updates DONE (user-approved): ADR-41 added (doc 11); doc 02 F05.02, doc 06 §2, doc 13 §6
  reworded from "History tab" to the sidebar-driven route-derived History view. Version footers bumped.
- Optional future consideration: the patient Upcoming/Past views still use in-page route-tabs while
  the doctor side is now sidebar-only — a deliberate divergence, revisit only if cross-role
  consistency is wanted.
- Nothing pushed (per project rules); commits are local on `main`.
