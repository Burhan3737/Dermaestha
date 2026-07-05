# 2026-07-05-0049 — superadmin-role-design

**Status:** Partial
**Goal:** Brainstorm + design a `superadmin` role that is a functional clone of `admin` this cycle (plumbing only), with explicit per-route authorization so `admin` can be restricted later.
**Skill(s) used:** superpowers:brainstorming (opted in)
**Ticket / issue:** None
**Branch:** main (no code changes; design doc only)
**Commits / PR:** None (awaiting user review; no commit per CLAUDE.md)
**Last updated:** 2026-07-05-1712
**Tags:** #feature #design

## Summary
Brainstormed adding a `superadmin` role. Scope confirmed as plumbing-only: superadmin behaves exactly like admin this cycle; restricting admin is a later cycle. User rejected a central `requireRole` hierarchy in favour of explicit per-route dual-listing (`requireRole('admin','superadmin')`) for future segregability. Two independent read-only subagents produced + confirmed the exhaustive server change inventory, which surfaced critical items beyond the route guards: four in-body role checks (visibility 404s + inverted includeInactive 403s) and an audit `actorType` landmine where a superadmin login would 500 (out-of-enum write). Wrote the design doc; no code yet.

## Context / why
User asked to add a `superadmin` role, same as `admin` for now but positioned to gain more tab permissions once `admin` is restricted next cycle. Existing auth is exact-match single-role (`requireRole`, `RoleRoute`), so introducing a distinct role value requires touching every admin-authorizing site.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-07-05-superadmin-role-design.md` | Created | The design doc for the superadmin plumbing cycle (auth sites, in-body checks, actorType coercion, client, bootstrap/seed, tests, spec doc-impact). |
| `agentChangeLogs/2026-07-05-0049-superadmin-role-design.md` | Created | This session change log. |
| `agentChangeLogs/index.md` | Modified | Added the one-line index entry for this session. |
| `docs/superpowers/plans/2026-07-05-superadmin-role.md` | Created | TDD implementation plan (11 tasks) produced via writing-plans subagent. |
| `prisma/schema.prisma` | Modified | Added `superadmin` to `enum Role`; `AuditActorType` untouched. |
| `server/src/middleware/requireRole/requireRole.js` | Modified | JSDoc `@param` union adds `superadmin` (no logic change; already variadic). |
| `server/src/modules/admin/index.js` | Modified | 9 admin routes dual-listed `('admin','superadmin')`. |
| `server/src/modules/doctor/index.js` | Modified | 8 admin/admin-shared routes dual-listed with `superadmin`. |
| `server/src/modules/medicine/index.js` | Modified | 3 admin/admin-shared routes dual-listed with `superadmin`. |
| `server/src/modules/appointment/index.js` | Modified | `:21` detail route dual-listed with `superadmin`. |
| `server/src/modules/prescription/index.js` | Modified | `:12` list route dual-listed with `superadmin`. |
| `server/src/modules/auth/index.js` | Modified | `:69` change-password route dual-listed with `superadmin`. |
| `server/src/modules/appointment/service.js` | Modified | `:109` visibility OR-chain admits `superadmin` (no 404). |
| `server/src/modules/prescription/service.js` | Modified | `:126` visibility OR-chain admits `superadmin` (no 404). |
| `server/src/modules/doctor/controller.js` | Modified | `:12` `includeInactive` gate admits `superadmin` (no 403). |
| `server/src/modules/medicine/controller.js` | Modified | `:8` `includeInactive` gate admits `superadmin` (no 403). |
| `server/src/modules/auth/service.js` | Modified | actorType coercion `superadmin`→`admin` at login/reset/change (`:52/99/118`). |
| `client/src/lib/RoleRoute/RoleRoute.jsx` | Modified | `role` prop accepts string OR array (back-compat). |
| `client/src/modules/admin/admin.routes.jsx` | Modified | Per-route explicit roles: `guard(session, roles, el)` — each admin route passes its own `['admin','superadmin']` so future segregation is a one-line per-route edit (mirrors server explicit dual-listing). Behavior unchanged. |
| `client/src/modules/auth/views/Login/Login.jsx` | Modified | DASHBOARD map adds `superadmin: '/admin'`. |
| `client/src/modules/auth/views/SignUp/SignUp.jsx` | Modified | DASHBOARD map adds `superadmin: '/admin'`. |
| `shared/schemas/auth/auth.js` | Modified | `loginSchema.role` enum adds `superadmin`. |
| `prisma/scripts/seed-baseline.js` | Modified | Added `baseline.superadmin@dermestha.test` to the dev baseline. |
| `prisma/scripts/bootstrap-admin.js` | Modified | Refactored: exports idempotent `ensureRoleUser`; creates BOTH admin + superadmin. |
| `server/test/unit/middleware/requireRole/requireRole.test.js` | Modified | +2 (superadmin allow/deny). |
| `shared/test/unit/schemas/auth/auth.test.js` | Created | loginSchema role-enum tests. |
| `server/test/unit/modules/auth/service.test.js` | Modified | +1 (login actorType coercion). |
| `server/test/unit/scripts/bootstrap-admin.test.js` | Created | `ensureRoleUser` idempotency tests. |
| `client/test/unit/lib/RoleRoute/RoleRoute.test.jsx` | Modified | +3 (array match/mismatch, string back-compat). |
| `server/test/integration/superadmin.test.js` | Created | Task 4/5/6 integration assertions (created in Stage A; run in Stage C). |

## Dependencies / config / schema
- Schema: `superadmin` added to `enum Role` (Stage A edit); DB migration applied in Stage B (baseline regenerate via `dermestha-migration-reset`). `enum AuditActorType` intentionally unchanged.
- New env vars `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` consumed by the refactored `bootstrap-admin.js`.

## Decisions
- **Explicit per-route dual-listing, not a central hierarchy** (user decision) — keeps future admin/superadmin segregation expressible per route.
- **Audit `actorType` coerce superadmin→admin** at the 3 role-derived auth writes (login/reset/change) rather than extending `AuditActorType` — keeps the audit trail uniform with the hard-coded admin flows and avoids an enum migration.
- **Bootstrap creates both admin and superadmin** in one idempotent run (user direction).
- `notification/service.js` admin recipient lookup left as `role: 'admin'` (recipient selection, not auth).

## Notable findings
- 23 `requireRole(...)` calls include `admin` across 6 files; `requireRole` middleware is already variadic → no logic change needed there.
- 4 in-body checks REQUIRED beyond the route guards: `appointment/service.js:109` + `prescription/service.js:126` (visibility → 404), `doctor/controller.js:12` + `medicine/controller.js:8` (inverted `!== 'admin'` → 403).
- **Blocker:** `auth/service.js:52/99/118` write `actorType: user.role`; `AuditActorType` has no `superadmin`, write is awaited/uncaught → superadmin login would 500. My earlier "no audit change" read was wrong.
- `loginSchema.role` zod enum would 400 a `superadmin` login hint.

## Verification
Implementation verified — all green (2026-07-05):
- Unit (Stage A): 21 server+shared new/affected + 9 relevant client tests green.
- Full automated suite (Stage C): **256 server+shared tests (42 files)** + **156 client tests (44 files)** pass. New `server/test/integration/superadmin.test.js` = 6/6 (superadmin login succeeds; reaches `/api/admin/*`; no 404 on appointment/prescription reads; no 403 on `includeInactive`; login audit row `actor_type='admin'`).
- Lint: only the 15 pre-existing errors (files not touched by this change); zero new findings.
- DB baseline: regenerated single migration `20260705115543_init`; `Role` enum = patient/doctor/admin/superadmin; `uniq_active_slot` partial index verified present in DB.
- Playwright (http://localhost:3000, rebuilt client + reseeded baseline), 3/3 flows PASS: superadmin → `/admin/doctors`, all 6 tabs, every admin view renders (network `/api/admin/*` + both `includeInactive` calls 200); admin unchanged (no regression); patient redirected away from `/admin`.

## Risk / rollback
- Local dev DB was reset + reseeded (baseline regenerate) — destructive to prior LOCAL data only; reproducible via `seed-baseline.js`. No shared/prod DB touched (DATABASE_URL = localhost).
- Code changes are UNCOMMITTED on the `main` working tree (no branch, no commit, per instruction). Rollback = restore the listed files + `git checkout prisma/migrations` (brings back the prior baseline folder).
- Schema change (Role enum) is additive; no data migration. `AuditActorType` unchanged.

## Open items / next session
- USER to review the working tree and decide on commit (no commit made this session).
- Spec-suite doc-impact (04/05/08/11/12/13/15) tracked + presented; apply ONLY after code is committed + explicit approval (CLAUDE.md change protocol).
- A background server (this session) is running on :3000 with the changes live.
- Out of scope / next cycle: restrict `admin` by moving specific routes/tabs to `superadmin`-only.
- Spec doc-impact (04/05/08/11/12/13/15) tracked; apply only at END after code committed + approval.
