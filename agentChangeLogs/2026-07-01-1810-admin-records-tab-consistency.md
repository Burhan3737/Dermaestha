# 2026-07-01-1810 — admin-records-tab-consistency

**Status:** Completed (commit + spec update pending user approval)
**Goal:** Make the Admin Records & Audit page (A-04) visually consistent with the app — fix the boxy tabs and the stretched Search button.
**Skill(s) used:** superpowers:brainstorming (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (awaiting review/approval)
**Last updated:** 2026-07-01-1810
**Tags:** #bugfix #ui

## Summary
The Records/Audit tabs on `/admin/records` rendered as boxy grey default-HTML buttons and the
Search button stretched to full input-stack height. Root cause: `AdminRecords` was the only page
using `<button className="tab">` + `useState` (native button chrome the shared `.tab` class never
resets) instead of the route `<Link>` pattern mandated by doc 06 §7 / ADR-42; and its filter
`<form className="filters">` inherited flex `align-items: stretch` with no override. Fix converts
the tabs to route `<Link>`s (new `/admin/records/audit` URL, active tab derived from the path) and
aligns the filter row to `flex-end`.

## Context / why
User reported the top buttons, search button, and navigation buttons on the Records & audit page
look inconsistent with the app's theme. Investigated live via Playwright on :5173 and in code.

## Files changed
| File | Action | What & why |
|---|---|---|
| `client/src/modules/admin/views/AdminRecords/AdminRecords.jsx` | Modified | Tabs → route `<Link>`s with URL-derived active state (conforms to doc 06 §7 / ADR-42); filter form aligned `flex-end` so Search button no longer stretches. |
| `client/src/modules/admin/admin.routes.jsx` | Modified | Added guarded `/admin/records/audit` route → `<AdminRecords />` (static path, ranks above `/admin/records/:id`). |
| `agentChangeLogs/2026-07-01-1810-admin-records-tab-consistency.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Index entry for this session. |

## Dependencies / config / schema
None.

## Decisions
- Tabs: chose route `<Link>`s (spec-aligned per ADR-42) over a CSS-only chrome reset — brings the
  page into conformance with doc 06 §7, not just a visual patch. (User chose this option.)
- Pagination: left the shared `Pagination` component unchanged (user decision) — it's the app-wide
  standard; the grey Previous/Next is just the single-page disabled state.
- Search button: fixed via inline `alignItems: 'flex-end'` on the form (same inline-override
  convention `Pagination.jsx` already uses), not by editing the shared `.filters` token.

## Notable findings
- Doc 06 §7 already documents tabs as route `<Link>`s (ADR-42); AdminRecords was the lone deviation,
  so this change fixes drift rather than introducing it.
- React Router v6 `<Routes>` ranks static `/admin/records/audit` above dynamic `/admin/records/:id`,
  so no route collision. Sidebar `/admin/records` NavLink has no `end`, so it stays active on the
  `/audit` sub-path (same as it already does for the `/:id` detail route).

## Verification
- Client unit tests: `npm --workspace client test -- --run AdminRecords` → 3/3 passed (JSX compiles + audit-tab flow green after `button`→`link` selector update).
- Visual (Playwright, :5173): `/admin/records` tabs now clean underline style (spruce active underline), Search button normal height aligned to input row. Clicking "Audit log" → URL `/admin/records/audit`, audit tab active, sidebar "Records & audit" still highlighted. Deep-link to `/admin/records/audit` loads fresh (audit table, no filter form). `/admin/records/<id>` still renders AdminRecordDetail (static `/audit` ranks above dynamic `/:id`). 0 console errors on all navigations.
- Lint: project `npm run lint` is pre-existingly broken under ESLint 9 (repo `.eslintrc.json` configures no JSX parser) — not introduced by this change; vitest/esbuild compile serves as the parse check.

## Risk / rollback
Low, presentation + client-routing only; no schema/API/server change. Revert the two client files.

## Open items / next session
- Doc-impact candidate (tracked, not applied): add a one-line note of the new `/admin/records/audit`
  URL in doc 06 §2, paralleling how `/doctor/history` and `/appointments/history` are recorded.
- Commit pending user approval (CLAUDE.md).
