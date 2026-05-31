# 2026-05-31-1700 — m0-foundation-scaffold

**Status:** In Progress
**Goal:** Execute Milestone 0 (Foundation/Scaffold) of Dermestha — stand up a same-origin Express + React (Vite) + Prisma/Postgres skeleton with every cross-cutting seam (config, sessions, role middleware, error envelope, audit writer, vendor-adapter interfaces) in place and tested.
**Skill(s) used:** superpowers:writing-plans (plan authoring), superpowers:subagent-driven-development (execution: fresh implementer subagent per task + spec/quality review).

## Summary
Authored and approved the M0 implementation plan (`docs/superpowers/plans/2026-05-31-foundation-scaffold.md`, 14 tasks), then began subagent-driven execution. Task 0 (npm-workspaces scaffold + tooling + Vitest) is complete and verified. Git history was cleaned at the developer's request to remove the Co-Authored-By trailer from this session's commits, and the per-session change-log was consolidated to this single file.

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
| `agentChangeLogs/2026-05-31-1700-m0-foundation-scaffold.md` | Created | This single session change log. |
| `agentChangeLogs/index.md` | Modified | One-line session entry. |

## Decisions
- **Prisma pinned to exactly 6.19.3** (not `^6`/`^7`) — Prisma 7 dropped in-schema `datasource.url` (CONFIG.md §7).
- **Test stack = Vitest + Supertest**; **package manager = npm workspaces** (server, client) — chosen at plan time (ARCHITECTURE didn't name a test runner).
- **argon2 kept as primary password hash**; the bcryptjs fallback (for Windows native-build failure) was unnecessary — argon2 installed via prebuilt binary.
- **`.gitignore`**: restored `.claude/` + `.superpowers/` that the plan's minimal spec had dropped (protects local agent state).
- **Commits recreated without the Co-Authored-By trailer** per developer instruction (soft/mixed reset of unpushed branch, recommitted by pathspec).
- **Single session change log**: removed the redundant per-task log the implementer subagent created (`...1730-m0-task0-scaffold.md`); change-log ownership stays with the controller per CLAUDE.md.

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

## Open items / next session
- Tasks 1–13 remaining: Prisma migrate + `uniq_active_slot` partial index + seed + double-booking test (Task 1, keystone); config loader; lib (prisma/logger/error-tracking/password); error envelope; session; requireRole + rate-limit; audit writer; adapter seams; app assembly + same-origin serving; client scaffold + ported tokens; Docker; admin bootstrap; README/runbook.
- Decide whether to add `.gitattributes` for line-ending normalization before the Docker build (Task 11).
