# 2026-05-31-1700 — m0-foundation-scaffold

**Status:** In Progress (Tasks 0–12 complete; Task 12 complete; Task 13 remaining)
**Goal:** Execute Milestone 0 (Foundation/Scaffold) of Dermestha — stand up a same-origin Express + React (Vite) + Prisma/Postgres skeleton with every cross-cutting seam (config, sessions, role middleware, error envelope, audit writer, vendor-adapter interfaces) in place and tested.
**Skill(s) used:** superpowers:writing-plans (plan authoring), superpowers:subagent-driven-development (execution: fresh implementer subagent per task + spec/quality review).

## Summary
Authored and approved the M0 implementation plan (`docs/superpowers/plans/2026-05-31-foundation-scaffold.md`, 14 tasks), then began subagent-driven execution. Task 0 (npm-workspaces scaffold + tooling + Vitest), Task 1 (Prisma init migration + the hand-added `uniq_active_slot` partial index + seed + double-booking invariant test), Task 2 (config/env.js + constants.js), Task 3 (lib/ cross-cutting primitives), and Task 4 (AppError + uniform error-envelope middleware) are complete. Task 3 created the Prisma singleton, minimal structured logger, error-tracking stub seam, and password hash/verify util — turning the double-booking keystone test green and bringing the full suite to 6/6. Task 4 added `AppError` (SCREAMING_SNAKE coded errors with HTTP status) and the Express `errorHandler` middleware mapping AppError → its status, ZodError → 400 VALIDATION_FAILED, and unknown → 500 INTERNAL, bringing the full suite to 9/9. Git history was cleaned at the developer's request to remove the Co-Authored-By trailer from this session's commits, and the per-session change-log was consolidated to this single file. Task 5 added the Postgres-backed session middleware (HTTP-only/Secure/Lax cookie, `createTableIfMissing:false` because Prisma owns the DDL). Task 6 (TDD) added the `requireRole` authorization boundary (DA6) and the `makeRateLimiter` factory, bringing the full suite to 12/12 across 5 files. Task 7 (TDD) added the append-only audit-log writer seam (`audit.service.js` — single `record()` export, no update/delete by convention, §3.6), bringing the suite to 14/14 across 6 files. Task 8 added payment/video/email vendor-adapter interface seams: `@typedef` contracts plus `NOT_IMPLEMENTED` stubs for PayFast, Daily.co, and Resend, each selected via a barrel `index.js`; stubs throw `AppError('NOT_IMPLEMENTED', ..., 501)` reusing the existing AppError primitive. Full suite now 17/17 across 7 files. Task 9 assembled the Express app (`server/src/index.js`): JSON body parser + session middleware, `/api/health` route (Prisma `SELECT 1`), `/api` 404 catch (uniform error envelope), static SPA serving + `*` catch-all, `errorHandler` last. `createApp()` exported for Supertest; server only listens when run directly. Added `shared/schemas/index.js` empty seam and integration test. Full suite now 20/20 across 8 files. Task 10 scaffolded the React (Vite 8) client workspace: ported `tokens.css`/`components.css` verbatim, replaced default scaffold files with the specified `main.jsx`, `App.jsx`, `routes.jsx`, `RoleRoute.jsx`, and added `vitest.config.js` with jsdom. RoleRoute test 2/2 passed. Build produced `client/dist/`. Server serves `/` 200 + SPA HTML; `/api/health` still `{status:'ok',db:'up'}`. Deviation: Vite 8 template shipped with `@vitejs/plugin-react@^6` (rolldown-based) + `vitest@^4.1` needed instead of `^2` (root) to support Vite 8; also `lightningcss-win32-x64-msvc` platform binary added to root deps for CSS minification.

## Context / why
Greenfield repo: only docs/specs and mockups existed (no app code). M0 is the base every later milestone builds on. Scope is foundation-only (no business features); contract specs (`schema.prisma`, `API.md`, `CONFIG.md`, `INTEGRATIONS.md`, `.env.example`) are the build-against source of truth. Developer choices: foundation-only first plan, pragmatic TDD, subagent-driven execution, Docker Desktop for Postgres.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/plans/2026-05-31-foundation-scaffold.md` | Created | The approved 14-task M0 plan (copied from the in-session plan file to the repo). |
| `package.json` | Created | Root npm-workspaces manifest (server, client); scripts; devDeps (vitest, supertest, eslint, prettier, prisma 6.19.3); deps (@prisma/client 6.19.3). |
| `server/package.json` | Created | Server workspace deps (express, express-session, connect-pg-simple, express-rate-limit, zod, argon2, bcryptjs). |
| `jsconfig.json` | Created | `checkJs` editor type-checking, NodeNext, no build step. |
| `.gitignore` | Modified | Scaffold ignores (node_modules, client/dist, .env, coverage, *.log) + restored pre-existing `.claude/` and `.superpowers/` local-agent-state ignores. |
| `.prettierrc` | Created | semi, singleQuote, printWidth 100. |
| `.eslintrc.json` | Created | eslint:recommended base. |
| `vitest.config.js` | Created | Vitest (node env) targeting `server/src/**/*.test.js`. |
| `package-lock.json` | Created | npm install lockfile (336 packages). |
| `prisma/migrations/20260531163617_init/migration.sql` | Created | Full schema DDL + hand-appended `uniq_active_slot` partial index (PRD #1). |
| `prisma/migrations/migration_lock.toml` | Created | Prisma migration lock (postgresql). |
| `prisma/seed.js` | Created | Seeds the single `settings` row + 3 demo medicines. |
| `server/src/test/doubleBooking.test.js` | Created | Keystone invariant test; red until `lib/prisma.js` (Task 3). |
| `agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md` | Created | This single session change log. |
| `agentChangeLogs/index.md` | Modified | One-line session entry. |
| `server/src/lib/prisma.js` | Created | Prisma client singleton (prevents connection exhaustion on --watch); turns doubleBooking.test.js green. |
| `server/src/lib/logger.js` | Created | Minimal structured JSON logger (info/warn/error) using console.*. |
| `server/src/lib/errorTracking.js` | Created | Error-tracking init seam; no-op until DSN configured; A3 fills in M4. |
| `server/src/lib/password.js` | Created | argon2id hash/verify util (memoryCost 19456, timeCost 2, parallelism 1). |
| `server/src/lib/password.test.js` | Created | TDD tests for hashPassword + verifyPassword (correct + wrong password cases). |
| `server/src/http/AppError.js` | Created | Coded application error class: SCREAMING_SNAKE `code` + HTTP `status` + optional `details` (API.md §1.1). |
| `server/src/http/errorHandler.js` | Created | Express error middleware: maps AppError → its status, ZodError → 400 VALIDATION_FAILED, unknown → 500 INTERNAL (never leaks internals). |
| `server/src/http/errorHandler.test.js` | Created | TDD tests: AppError envelope, ZodError 400, unknown 500 no-leak (3 tests). |
| `server/src/middleware/session.js` | Created | Postgres-backed Express session middleware; HTTP-only/Secure/Lax cookie; `createTableIfMissing:false` (Prisma owns DDL). |
| `server/src/middleware/requireRole.js` | Created | DA6 single server-side authorization boundary; returns 401 UNAUTHENTICATED or 403 FORBIDDEN via AppError. |
| `server/src/middleware/rateLimit.js` | Created | `makeRateLimiter` factory for §3.6 rate limiters; routes instantiate in M1. |
| `server/src/middleware/requireRole.test.js` | Created | TDD tests for requireRole: allowed role passes, 401 no session, 403 wrong role (3 tests). |
| `server/src/services/audit.service.js` | Created | Append-only audit writer (§3.6); single `record()` export; no update/delete path exported by convention. |
| `server/src/services/audit.service.test.js` | Created | TDD tests: row appended (DB write verified), no update/delete exports (2 tests). |
| `server/src/integrations/payment/payfast.stub.js` | Created | PayFast NOT_IMPLEMENTED stub; implements `PaymentProvider` typedef; all methods throw AppError 501. |
| `server/src/integrations/payment/index.js` | Created | Payment barrel + `PaymentProvider` typedef; exports `paymentProvider = payfastStub`. |
| `server/src/integrations/video/daily.stub.js` | Created | Daily.co NOT_IMPLEMENTED stub; implements `VideoProvider` typedef. |
| `server/src/integrations/video/index.js` | Created | Video barrel + `VideoProvider` typedef; exports `videoProvider = dailyStub`. |
| `server/src/integrations/email/resend.stub.js` | Created | Resend NOT_IMPLEMENTED stub; implements `EmailProvider` typedef. |
| `server/src/integrations/email/index.js` | Created | Email barrel + `EmailProvider` typedef; exports `emailProvider = resendStub`. |
| `server/src/integrations/integrations.test.js` | Created | TDD tests: payment stub throws NOT_IMPLEMENTED, video exposes createRoom/issueToken, email exposes send (3 tests). |
| `shared/schemas/index.js` | Created | Empty seam for shared Zod DTOs (client↔server); feature plans fill in M1+. |
| `server/src/routes/health.js` | Created | `/health` route: `prisma.$queryRaw SELECT 1` → `{ status: 'ok', db: 'up' }`. |
| `server/src/index.js` | Created | Express app assembly: JSON + session middleware, `/api/health`, `/api` 404 envelope, static SPA + catch-all, errorHandler last. `createApp()` export for Supertest; listen guard for direct execution. |
| `server/src/test/app.integration.test.js` | Created | Integration tests: health 200 + DB up, /api 404 envelope NOT_FOUND, session cookie HttpOnly+Lax (conditional) — 3 tests. |
| `client/` (Vite scaffold) | Created | `npm create vite@latest client -- --template react`: index.html, vite.config.js, public/, src/assets/, eslint.config.js, README.md, .gitignore. |
| `client/package.json` | Created | Client workspace manifest: dev/build/preview/test scripts; react-router-dom@^6; @testing-library/react; jsdom; vitest@^4.1 (Vite 8 compatible). |
| `client/src/styles/tokens.css` | Created | Verbatim copy of `mockups/assets/css/tokens.css` — single design token source of truth. |
| `client/src/styles/components.css` | Created | Verbatim copy of `mockups/assets/css/components.css` — BEM component classes. |
| `client/index.html` | Modified | Title → "Dermestha"; added Google Fonts preconnect + Archivo/Hanken Grotesk link. |
| `client/src/main.jsx` | Modified | Replaced scaffold default with BrowserRouter + token/component CSS imports. |
| `client/src/App.jsx` | Modified | Replaced scaffold default with placeholder proving token vars and `.btn.btn--primary` render. |
| `client/src/routes.jsx` | Created | Centralized route-config seam (M1 fills with 24 views + RoleRoute guards). |
| `client/src/lib/RoleRoute.jsx` | Created | Client-side role guard seam; server (DA6) remains the real auth boundary. |
| `client/src/lib/RoleRoute.test.jsx` | Created | 2 tests: children render when role matches; redirect when mismatched. |
| `client/vitest.config.js` | Created | Vitest config: jsdom, globals:true, @vitejs/plugin-react, include src/**/*.test.jsx. |
| `package.json` | Modified | npm reformatted; `lightningcss-win32-x64-msvc` added to deps (Vite 8 CSS minification binary — Windows-specific optional). |
| `package-lock.json` | Modified | Updated for client workspace deps + lightningcss-win32-x64-msvc. |
| `Dockerfile` | Created | Multi-stage image: client-build (node:22-slim, npm ci, vite build) + runtime (npm ci with devDeps for prisma generate, copy built SPA, run server). |
| `.dockerignore` | Created | Excludes node_modules, client/dist, .env, coverage, .git from Docker build context. |
| `docker-compose.yml` | Created | Two-service compose: postgres:16 db with healthcheck + app waiting on db healthy; env injected; dermestha_pg named volume. |
| `prisma/scripts/bootstrap-admin.js` | Created | DA4 one-off idempotent admin bootstrap: hashes password with argon2id, creates a single `role:'admin'` user, no-ops if any admin already exists. Standalone (no server-workspace module resolution needed). |

## Decisions
- **Prisma pinned to exactly 6.19.3** (not `^6`/`^7`) — Prisma 7 dropped in-schema `datasource.url` (CONFIG.md §7).
- **Test stack = Vitest + Supertest**; **package manager = npm workspaces** (server, client) — chosen at plan time (ARCHITECTURE didn't name a test runner).
- **argon2 kept as primary password hash**; the bcryptjs fallback (for Windows native-build failure) was unnecessary — argon2 installed via prebuilt binary.
- **`.gitignore`**: restored `.claude/` + `.superpowers/` that the plan's minimal spec had dropped (protects local agent state).
- **Commits recreated without the Co-Authored-By trailer** per developer instruction (soft/mixed reset of unpushed branch, recommitted by pathspec).
- **Single session change log**: removed the redundant per-task log the implementer subagent created (`...1730-m0-task0-scaffold.md`); change-log ownership stays with the controller per CLAUDE.md.
- **Dev DB on Docker, native PG18 stopped**: a native Windows `postgresql-x64-18` service occupied `localhost:5432` and shadowed the Docker container; the developer stopped it (elevated) so port 5432 matches the plan/`.env.example`/compose. Dev DB = `dermestha-pg` Postgres 16 container.
- **Migration applied via `migrate deploy` on a fresh DB** to normalize Prisma's checksum after the hand-edit and to prove the migration file reproduces the partial index by itself (rather than only a manual `psql` apply).

## Notable findings
- argon2 ^0.41.0 builds cleanly on Windows 11 / Node v22.12.0 (prebuilt binary) — no native toolchain needed.
- `npm test` exits non-zero when no test files exist — expected Vitest behavior, runner is correctly wired.
- 5 moderate `npm audit` advisories in transitive deps; none in direct deps — deferred.
- Git emits LF→CRLF warnings on Windows. A `.gitattributes` (`* text=auto eol=lf`) would normalize for the Linux Docker build — **flagged, not yet added** (not in plan scope).
- Docker Desktop installed mid-session (v29.5.2); DB-dependent tasks (1/3/7/9/11/12) can now run.

## Verification
- `npm install`: 336 packages added, no errors.
- `npm test`: Vitest v2.1.9 ran against the include glob, reported "No test files found" — runner verified.
- `git log`: three session commits (plan, scaffold, change-log) confirmed with empty Co-Authored-By trailer.
- Task 3 — `npx vitest run server/src/test/doubleBooking.test.js`: 1 passed (green — P2002 rejected as expected).
- Task 3 — `npx vitest run server/src/lib/password.test.js`: 2 passed (argon2id hash+verify).
- Task 3 — `npx vitest run` (full suite): 3 files, 6 tests, all passed. Duration 938ms.
- Task 4 — `errorHandler.test.js`: 3 passed (AppError envelope, ZodError 400, unknown 500 no-leak).
- Task 4 — `npx vitest run` (full suite): 4 files, 9 tests, all passed. Duration 856ms.
- Tasks 5–6 — `session.js` import check: `node --env-file=.env -e "import('./server/src/middleware/session.js').then(()=>console.log('session.js loads ok'))"` → "session.js loads ok".
- Tasks 5–6 — `requireRole.test.js` (red before implementation): 1 suite failed (cannot find `./requireRole.js`) — confirmed red.
- Tasks 5–6 — `requireRole.test.js` (green after implementation): 3 passed.
- Tasks 5–6 — `npx vitest run` (full suite): 5 files, 12 tests, all passed. Duration 889ms.
- Task 7 — `audit.service.test.js` (red before implementation): 1 suite failed (cannot find `./audit.service.js`) — confirmed red.
- Task 7 — `audit.service.test.js` (green after implementation): 2 passed (row appended, no mutate exports).
- Task 8 — `integrations.test.js` (red before implementation): 1 suite failed (cannot find `./payment/index.js`) — confirmed red.
- Task 8 — `integrations.test.js` (green after implementation): 3 passed (payment stub throws NOT_IMPLEMENTED, video + email expose correct methods).
- Tasks 7–8 — `npx vitest run` (full suite): 7 files, 17 tests, all passed. Duration 1.05s.
- Task 9 — `npx vitest run server/src/test/app.integration.test.js`: 3 passed (GET /api/health returns `{ status: 'ok', db: 'up' }`, /api/does-not-exist returns 404 with `error.code = 'NOT_FOUND'`, cookie assertion guard passed).
- Task 9 — `npx vitest run` (full suite): 8 files, 20 tests, all passed. Duration 1.48s.
- Task 9 — `node --env-file=.env server/src/index.js` + `curl http://localhost:3000/api/health`: `{"status":"ok","db":"up"}` confirmed. Server stopped after check.
- Task 10 — `npm --workspace client run test`: vitest 4.1.7, 2 passed (RoleRoute: children when role matches, redirects when mismatches). jsdom environment.
- Task 10 — `npm run build:client`: vite 8.0.14, 20 modules transformed, `client/dist/index.html` + assets produced in 119ms. `client/dist/` correctly gitignored.
- Task 10 — `node --env-file=.env server/src/index.js` + `curl http://localhost:3000/` → HTTP 200, body contains `<div id="root">` (SPA HTML). `curl http://localhost:3000/api/health` → `{"status":"ok","db":"up"}`. Server stopped.
- Task 11 — `docker compose up --build -d`: **BLOCKED**. The `client-build` stage's `npm ci` succeeds (357 packages, Linux binaries resolved from lockfile's optional deps), but `npm run build:client` → `vite build` fails with `Error: [lightningcss minify] Cannot find module '../lightningcss.linux-x64-gnu.node'`. Root cause: the lockfile was generated on Windows and contains `lightningcss-win32-x64-msvc` as the resolved optional binary. The `lightningcss-linux-x64-gnu` package is NOT present in the lockfile at all, so `npm ci` on Linux has no entry to install it, and lightningcss (required by Vite 8 for CSS minification) cannot load its native module. Per task guardrails, no lockfile or dependency edits were made. Three Docker files committed as-is. Controller decision required: likely pin client to stable esbuild-based Vite (e.g. Vite 6) or run `npm install` on Linux to regenerate the lockfile with both platforms, then commit.

## Open items / next session
- Task 13 remaining: README/runbook.
- Task 11 (Docker) RESOLVED. Root cause: `npm create vite@latest` scaffolded **Vite 8 (rolldown)**, whose **lightningcss** CSS minifier needs a Linux native binary absent from the Windows-generated lockfile → `npm ci` in the Linux image failed. Fix: pinned the client to **stable Vite 5 + @vitejs/plugin-react 4 + Vitest 2** (esbuild minifier, no native binaries) and removed the lightningcss optional dep. Verified: Docker image builds on Linux; `docker compose up` runs `app`+`db`; `/api/health` returns `{status:'ok',db:'up'}` from the container; client build 15.9 kB; RoleRoute 2/2; full server suite **20/20**.
- Note: a clean `npm install` does NOT auto-generate the Prisma client locally — run `npx prisma generate` before `npm run db:seed`/tests (the Dockerfile already runs it). Capture in the README/runbook (Task 13).
- Task 12 — First run: `ADMIN_EMAIL=admin@dermestha.test ADMIN_PASSWORD=temp-rotate-me-now node --env-file=.env prisma/scripts/bootstrap-admin.js` → `Admin created: admin@dermestha.test. Rotate this password now.`
- Task 12 — Second run (idempotency): same command → `Admin already exists — no-op.`
- Task 12 — DB count: `docker exec dermestha-db-1 psql -U user -d dermestha -c "SELECT count(*) FROM users WHERE role='admin';"` → `1` (exactly one admin row).
- The `doubleBooking.test.js` is now green — keystone invariant proven end-to-end through the Prisma client.
- Native `postgresql-x64-18` is stopped (Manual or just stopped) — restart it later if needed for other work; the Docker dev DB owns 5432 for now.
- Decide whether to add `.gitattributes` for line-ending normalization before the Docker build.
