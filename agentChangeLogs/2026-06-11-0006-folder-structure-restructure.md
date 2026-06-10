# 2026-06-11-0006 — folder-structure-restructure

**Status:** Partial
**Goal:** Execute the feature-first folder restructure of `client/`, `server/`, and `shared/schemas/` per the approved spec + plan — pure relocation, no behavior/API/schema/dependency change.
**Skill(s) used:** superpowers:executing-plans (user opted in via `/executing-plans`)
**Ticket / issue:** None
**Branch:** `refactor/folder-restructure` (created with user approval)
**Commits / PR:** None (commits GATED — working tree only until human approves)
**Last updated:** 2026-06-11-0210
**Tags:** #refactor #migration

## Summary
Reorganizing the source trees into the feature-first structure defined in `docs/superpowers/specs/2026-06-10-folder-restructure-design.md`, executing the phased plan `docs/superpowers/plans/2026-06-10-folder-restructure.md`. Each phase is gated on both vitest suites staying green. No spec edits applied yet (Phase 6 is gated).

## Context / why
Two dev notes flagged inconsistent client/server folder layouts. The approved design adopts client `modules/` + `shared/` + `lib/` + `context/`, server domain `modules/`, and per-domain `shared/schemas/`. This session executes the move.

## Files changed
| File | Action | What & why |
|---|---|---|
| `.env` (gitignored, local only) | Modified | Restored `DATABASE_URL` port 5433 (matches the session's Docker container; not part of the restructure diff). |
| `vitest.config.js` | Modified | Added `server/src/**/test.js` to include glob so module `test.js` files are collected. |
| `server/src/services/audit/{audit.service,audit.service.test}.js` | Moved | 1a: `audit.service` → `services/audit/`; 12 importers re-pointed. |
| `server/src/lib/<name>/`, `middleware/<name>/`, `config/env/`, `http/errorHandler/` | Moved | 1b: infra files folder-grouped (js+test per unit); `config/constants.js` + `http/AppError.js` stay flat; ~48 importers swept. |
| `server/src/modules/auth/{index,controller,service,test}.js` | Moved | 1c: auth module from `routes/`+`controllers/`+`services/`; depth + internal wiring fixed; `index.js` + `auth.integration.test.js` re-pointed. |
| `server/src/modules/doctor/{index,controller,service,test}.js` | Moved+Merged | 1d: doctor module; absorbs availability (D10) — 2 services→`service.js` (self-import for spy), 2 routers→`index.js` (both exported), 3 test files→`test.js` (unified prisma mock). Old availability files removed; booking + `index.js` re-pointed. |
| `server/src/modules/payment/{index,controller,service,test}.js` | Moved+Split | 1e: payment module; service+test moved; `payfast` handler → `controller.js`; new `index.js` owns `/api/webhooks/payfast`. 3 importers (webhook/appointment controllers, devCheckout) re-pointed. |
| `server/src/modules/video/{index,controller,service,test}.js` | Moved+Split | 1f: video module; service+test moved; `daily` handler → `controller.js`; new `index.js` owns `/api/webhooks/daily`; daily test folded into `test.js` via cross-module `vi.spyOn`. 4 importers re-pointed. |
| `server/src/{routes.js, health/index.js, dev/devCheckout.js, dev/devVideo.js}` | Created/Moved | 1g: central `routes.js` (`registerRoutes`, both webhook routers under `/api/webhooks`); health + dev moved (same depth, no import change); `index.js` slimmed to `registerRoutes(app)`. |
| `server/src/{controllers/webhook.controller.js, controllers/webhook.controller.test.js, routes/webhooks.js}` | Deleted | 1g: superseded by module webhook routers; daily coverage preserved in `video/test.js`. |
| `server/src/modules/appointment/{service,controller,index,test}.js` | Merged | Phase 2: 7 services→`service.js` (verbatim concat + `self.` on 4 stubbed seams + `sendApology`→`sendNoShowApology` R2 rename); controller+route moved; 6 test files→`test.js` (unified prisma mock, per-suite spies). |
| `server/src/services/{appointment,booking,appointmentState,cancellation,refund,evaluation}.service.js (+5 tests), refundSideEffects.js` | Deleted | Phase 2: merged into appointment module. `services/` now holds only `audit/`. |
| `server/src/{workers/index.js, dev/devVideo.js, test/video.integration.test.js, modules/payment/service.js, modules/payment/test.js}` | Modified | Phase 2: re-pointed evaluation/appointmentState imports to `modules/appointment/service.js`. |
| `shared/schemas/{auth/auth,doctor/doctor,appointment/appointment}.js (+ appointment test), index.js` | Moved | Phase 3: per-domain folders (availability→doctor); barrel rewritten. Server importers use the barrel (no churn). |
| `client/src/lib/{apiClient,format,queryClient,RoleRoute}/` | Moved | 4a: lib folder-grouping. |
| `client/src/context/{session/session.jsx, AppProviders.jsx}` | Moved/Created | 4b: session→`context/session/` (state-only); `AppProviders` composes Query+Router+Session; `main.jsx` slimmed. |
| `client/src/modules/auth/{useAuth.js, auth.routes.jsx, views/<5 views>/}` | Created/Moved | 4c: auth module; `useAuth` consolidates all 6 auth actions (D15); session actions stripped from context. |
| `client/src/modules/doctor/{useDoctor.js, doctor.routes.jsx, views/<4>/, components/DoctorCard/}` | Created/Moved | 4d: doctor module; `useDoctor` (enabled-gated queries + mutations, D2); DoctorCard + its split test moved (5b pulled fwd). |
| `client/src/modules/{booking,appointment,video}/` | Created/Moved | 4e: booking/appointment/video modules; `useBooking`/`useAppointment`/`useVideo` (D2); CancelModal/DoctorCancelModal → appointment module. |
| `client/src/shared/<6 primitives>/, layouts/<3>/` | Moved | 4f: primitives→`shared/`; layouts folder-grouped; `components.test.jsx` split → Button/Field tests (5a). |
| `client/src/{routes.jsx, App.jsx}` | Rewritten | 4g: `buildRoutes(session)` aggregates each module's `*.routes.jsx`; `App.jsx` renders the table + catch-alls only (hardcoded RoleRoute blocks removed). |

## Dependencies / config / schema
- **Environment setup (not a repo change):** Native Windows `postgresql-x64-18` shadows port 5432 (and needs elevation to stop, unavailable here). Worked around by running the Docker Postgres on host port **5433** (container `dermestha-db-5433`, reusing volume `dermestha_dermestha_pg`) and pointing the gitignored `.env` at 5433. No tracked file changed for this.
- No package, schema, or migration changes.

## Decisions
- **Branch:** user approved creating `refactor/folder-restructure`.
- **Baseline gate:** user asked me to start Docker → achieved a true full-green baseline rather than the DB-down fallback gate.
- **Execution mode:** user confirmed inline `executing-plans` (not subagent-driven).
- **Merge seams (D5) — Option B (user-approved):** the plan's R1 fix (`vi.mock(sibling)`→`vi.spyOn(service, fn)`) does NOT work — proven by a throwaway probe that `vi.spyOn(namespace, fn)` cannot intercept an intra-module call in ESM/Vitest. Resolution: add `import * as self from './service.js'` to merged services and route the test-stubbed intra-module calls through `self.fn()` so `vi.spyOn` intercepts. Tiny, behavior-identical source change; keeps one `service.js` per module and isolated tests. Applies to doctor (1d) and the appointment cluster (Phase 2).
- **vitest include glob:** added `server/src/**/test.js` to `vitest.config.js` include — the spec mandates module tests named `test.js`, but the runner only matched `*.test.js`, so module tests silently weren't collected (caught by a count drop 139→129). Necessary config change beyond pure relocation.

## Notable findings
- `.env` had a stale `5433` port from a prior session's temporary remap (documented in `agentChangeLogs/2026-06-04-1746-slice-d-video-lifecycle.md`); canonical is 5432, but native PG18 still occupies 5432, so 5433 is the working local port this session.
- **ESM intra-module spy limitation:** `vi.spyOn(moduleNamespace, fn)` cannot intercept a call made *within* the same module (the caller binds the local function, not the namespace export). Invalidates the plan's R1; resolved via Option B (see Decisions).
- **Two process traps caught by the gate (not logic bugs):** (1) moving a file deeper requires fixing its *own* upward imports too, not just external importers (Task 1a); (2) the Bash tool persists CWD, so a `cd` in one command made a later `npm test` run from the wrong workspace — gate commands now anchor at repo root.
- **vitest glob gap:** module `test.js` files weren't matched by `*.test.js` (see Decisions).

## Verification
- **Phase 0 baseline (DB up, 5433):** `npm test` → 33 files / 139 tests passed. `npm --workspace client run test` → 17 files / 41 tests passed. Both fully green.
- **Phase 1 gates (server+shared `npm test`) — all green at 139 tests:** 1a audit→services/audit/. 1b infra grouping (48-file sweep). 1c auth module (+vitest glob fix). 1d doctor module (availability merge, Option B). 1e payment module + payfast split. 1f video module + daily split. 1g `routes.js`+`index.js` rewire + webhook trio deleted → 139 / 30 files. Integration tests now exercise the new module webhook routes via `registerRoutes`.
- **Phase 2 gate (appointment merge):** 139 green / 25 files (6 cluster test files → 1; count preserved). Hit + fixed a mock-pollution bug: `vi.restoreAllMocks()` was stripping `vi.mock` factory impls (audit.record→undefined→`.catch` TypeError); removed it (clearAllMocks preserves impls). Verified the probe-proven `self.` seam pattern at scale (4 seams).
- **Phase 3 gate (schemas):** 139 green. Barrel insulated all server importers (R9).
- **Phase 4 gates (client `npm --workspace client run test`) — all green at 41 tests:** 4a lib grouping. 4b context/session + AppProviders. 4c auth module + useAuth. 4d doctor module + useDoctor (DoctorCard test split pulled fwd). 4e booking/appointment/video modules + 3 data hooks. 4f shared/layouts + component-test split. 4g routing consolidation.
- **FINAL VERIFICATION — both suites + build:** `npm test` → 139 / 25 files. `npm --workspace client run test` → 41 / 18 files. `npm run build:client` → clean (125 modules transformed; resolves the full client import graph). All five code phases complete; behavior/API/schema unchanged.

## Decisions (additional)
- **Client routing (D3):** module `*.routes.jsx` that wrap `RoleRoute` (which keeps its `session` prop — its test depends on it) are `(session) => [...]` factories; `routes.jsx` exports `buildRoutes(session)` aggregating them; `App.jsx` calls it. Minor adaptation of the spec's static-array sketch.
- **Phase 5 folded into Phase 4:** the two component-test splits (D13) were pulled forward to keep gates green when their components moved — DoctorCard test in 4d, Button/Field split in 4f.

## Risk / rollback
- All changes are verbatim relocations behind a two-suite green gate. Revert = `git checkout .` / delete the branch (nothing committed yet).
- Env-only: to restore canonical setup, stop `dermestha-db-5433`, set `.env` back per local preference; native PG18 untouched.

## Open items / next session
- Phases 1–5 (code moves) then Phase 6 (spec edits: ADR-26 + doc 03 + path audit) — Phase 6 is GATED, presented for approval, applied only after the code lands.
- Final: ask human about committing (branch approval) before any commit/push.
