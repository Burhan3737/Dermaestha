# 2026-06-10-0249 — folder-structure-restructure-design

**Status:** Partial
**Goal:** Brainstorm + design a pure folder/code restructure (client + server + shared/schemas) for maintainability, with no behavior change; produce a reviewable design doc before any moves.
**Skill(s) used:** superpowers:brainstorming (announced + accepted by user)
**Ticket / issue:** devNotes/06_07_2026_0000_client_folder_structure_refactoring.md, devNotes/06_07_2026_0001_server_folder_structure_refactoring.md
**Branch:** main
**Commits / PR:** None (not committed; awaiting user review)
**Last updated:** 2026-06-10-0430
**Tags:** #refactor

## Summary
Worked through, via the brainstorming skill, a complete design for restructuring the `client/` and `server/` source trees (and `shared/schemas/`) into a consistent feature-first layout: client `modules/<feature>/` with view/logic split into hooks, per-module routing aggregation, server domain modules (`index/controller/service/test`), and per-domain shared Zod schema folders. No business logic changes — pure relocation. Captured the agreed decisions in a design doc for the user to review before any code is moved. Spec edits (doc 03 + new ADR-26) are identified but GATED on explicit approval.

## Context / why
After a first review post-M2, the user's dev notes flagged inconsistent/hard-to-navigate folder structure on both tiers (routing split across App.jsx/routes.jsx, type-first client folders, layer-first server folders, ungrouped lib/tests). The ask: restructure for maintainability for future devs/agents, and integrate the resulting conventions into canonical documentation.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-10-folder-restructure-design.md` | Created | The reviewable design doc capturing all restructure decisions, file maps, view→hook split, schema reorg, Prisma-vs-Zod orientation, gated spec changes, phasing/verification, and answers to the dev-note questions. |
| `docs/superpowers/plans/2026-06-10-folder-restructure.md` | Created | The executable implementation plan: Phase 0–6 tasks, exact file moves, the full import-rewrite surface, R1 `vi.spyOn` resolution, two-suite verification gates, and the 9 ordering hazards. Built to execute from a cold context. |
| `agentChangeLogs/2026-06-10-0249-folder-structure-restructure-design.md` | Created | This session changelog. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |

## Dependencies / config / schema
None.

## Decisions
- Client = feature-first `modules/` + `shared/` + `layouts/` + `lib/`; **one `use<Feature>` hook per module** (`useAuth`, `useDoctor` enabled-gated, `useBooking`, `useAppointment`, `useVideo`); per-module `*.routes.jsx` aggregated in `routes.jsx`.
- Client module internals: `modules/<feature>/views/<View>/` (pages, `.test.jsx`) + `modules/<feature>/components/<Comp>/` (feature components) + the hook + routes at module root.
- Auth: client has **hooks, not services** (corrected an earlier `auth.service.js` mislabel). New **`client/src/context/`** folder for app-wide contexts; `context/AppProviders.jsx` composes QueryClient + Router + Session so `main.jsx` slims. **State/action split:** `context/session/session.jsx` holds cross-cutting STATE only (`useSession` → session/loading/refresh/setSession); one-shot auth ACTIONS (login/signup/logout/forgot/reset/change) live in `modules/auth/useAuth.js` (calls api + setSession). This restores auth's per-module hook (no longer an exception). `views/` (pages) and `components/` (feature components) are distinct per-module subfolders.
- Server = 5 domain modules (auth, doctor[+availability], appointment, payment, video); one `service.js` + one `test.js` per module; `appointment` merges 7 lifecycle services verbatim. `audit.service` → a narrowed top-level **`services/audit/`** (services/ = shared cross-module services with no single owning domain; audit is the only tenant). `workers/`/`integrations/` stay top-level (not services). Cross-cutting folders flat at top level; `lib/`/`middleware/`/`services/` folder-grouped.
- `shared/schemas` Option A: stays a client↔server Zod contract, reorganized into per-domain folders mirroring modules; availability schema folds into doctor.
- Prisma schema stays centralized (idiomatic; not modularized).
- Webhooks: each module owns its own webhook route. health/ + dev/ as non-module folders. Component tests split per component (user choice).
- Conventions to be recorded in canon via doc 03 subsection + ADR-26 — GATED on approval.

## Notable findings
- Routing genuinely split: `App.jsx` hardcodes ~8 routes AND maps over `routes.jsx`.
- Auth service half-applied: Login/SignUp use the service, but Forgot/Reset/ChangePassword call `api.post` inline → will be routed through the auth service.
- `shared/schemas` was NOT a single file (already domain-split with a barrel); client imports none of them (sharing intent unrealized).
- `doctorListQuery`/`slotsQuery` mis-filed in `availability.js` (they are doctor-discovery).
- Doc-hygiene: `prisma/schema.prisma` headers reference deprecated `docs/engineering/*` docs (canon is now 04/15).

## Verification
Not verified (no code changed yet). **Two** vitest suites gate every move: `npm test` (server+shared) and `npm --workspace client run test` (client); final check adds `npm run build:client`. A Plan agent produced a file-level execution plan (phases, import-rewrite surface, risks) from the design doc.

**Critical finding (R1):** the appointment 7→1 service+test merge is NOT a 100% mechanical test move — ~3 cluster tests mock a sibling *module* (`vi.mock('./appointmentState.service.js')` etc.) to isolate `transition`/`quoteRefund`/`safeRefund`; once caller+callee share one `service.js`, the module-mock stops intercepting and those tests fail. Resolving = switch to `vi.spyOn(service, fn)` (behavior-preserving but a real test-internals edit). Same for the doctor+availability merge. **RESOLVED:** user accepted the bounded `vi.spyOn` rewrite — D5 (one service.js + one test.js) stands; this is the sole sanctioned test-internals edit in the restructure.

## Risk / rollback
None yet (design only). Highest-risk steps identified for the implementation phase: the 7-file `appointment` service+test merge, and the per-component test split — both gated on green-before/green-after.

## Open items / next session
- **Design + plan are FINAL and on disk.** Execution should happen in a FRESH session (clear context) reading only the design doc + plan doc.
- Fresh session steps: (1) read both docs; (2) get approval for a git worktree/branch (CLAUDE.md gates branches; never implement on `main` without consent); (3) execute via subagent-driven-development, two-suite green gate per phase; (4) leave changes in working tree — commit/push gated.
- Spec edits (doc 03 + ADR-26 + docs 00–15 path audit) = Phase 6, presented for explicit approval AFTER code lands (gated).
- Out of scope (noted): wiring the client to consume the shared Zod schemas; Prisma→Zod generation.
- No code has been moved yet in this session — design/plan only.
