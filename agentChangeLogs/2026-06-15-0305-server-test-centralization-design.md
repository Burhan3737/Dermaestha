# 2026-06-15-0305 — server-test-centralization-design

**Status:** Partial
**Goal:** Brainstorm + spec a single centralized `test/` folder for the server (and shared) test suites, replacing ADR-26 co-location.
**Skill(s) used:** superpowers:brainstorming (user-invoked `/brainstorming`)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** `9983ec6` (server design), `23d09e3` (server+shared move), `4c86ebb` (client design + ADR-40 fix), `6bd9869` (client move). Not pushed.
**Last updated:** 2026-06-15-0305
**Tags:** #refactor #migration #testing #spec

## Summary
Investigated why server `modules/<x>/` use a bare `test.js` (intentional per ADR-26), then brainstormed a reorganization moving all server + shared tests into a per-workspace `test/` tree (`unit/` mirroring `src/` + flat `integration/`), glued by `#src`/`#shared` path aliases. Design doc written and pending user review; no code moved.

## Context / why
User wants both client and server test suites grouped in a single, maintainable `test/` folder. Server (+ shared) brainstormed first; client is a separate later cycle. The change deliberately reverses the test-location half of ADR-26.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-15-server-test-centralization-design.md` | Created | The approved server+shared design (structure, naming, aliases, migration, doc-impact). |
| `docs/superpowers/specs/2026-06-15-client-test-centralization-design.md` | Created | The approved client design (symmetric: `client/test/unit/` mirror, `#src` in client config; 40-file inventory verified clean of snapshots/mocks/setup). |
| `agentChangeLogs/2026-06-15-0305-server-test-centralization-design.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |
| `vitest.config.js` (root) | Modified | Added `resolve.alias` (`#src`, `#shared`) + new `include` globs (`server/test/**`, `shared/test/**`); removed old `server/src/**` globs. (subagent, `23d09e3`) |
| `server/src/**` + `shared/schemas/**` test files (45) | Moved | `git mv` to `server/test/{unit,integration}/…` + `shared/test/unit/…`; import/`vi.mock`/dynamic-import specifiers rewritten to `#src/*`/`#shared/*`; module `test.js`→`service.test.js`; `.integration` infix dropped. `server/src/test/` removed. (subagent, `23d09e3`) |
| `client/vitest.config.js` | Modified | Added `resolve.alias` `#src`→`./src`; `include`→`['test/**/*.test.{js,jsx}']`; kept jsdom+globals+react plugin. (subagent, `6bd9869`) |
| `client/src/**` test files (40) | Moved | `git mv` to `client/test/unit/<mirror-of-src>/`; relative import/`vi.mock` specifiers rewritten to `#src/*`. No `*.test.*` remain under `client/src/`. (subagent, `6bd9869`) |

## Dependencies / config / schema
Root `vitest.config.js`: added `resolve.alias` (`#src`→`server/src`, `#shared`→`shared`) and replaced `include` globs. No deps added, no schema change.

## Decisions
- Centralize tests, reversing ADR-26 co-location (→ new **ADR-40**; ADR-39 already taken = "Payment/appointment no-cascade release policy").
- Layer-then-domain top split; `unit/` mirrors `src/`; sub-folder per source unit.
- Module bare `test.js` → role-named `service.test.js`; integration files drop `.integration` infix.
- Single-root path aliases (`#src/*`, `#shared/*`) via `resolve.alias` (not `package.json "imports"`).
- `test/` lives outside `src/` (`server/test/`, `shared/test/`). Shared included now; client deferred.

## Notable findings
- "Nothing inside changes" (user's initial premise) is false for unit tests: relative `import`/`vi.mock` paths break on move and must be rewritten. Only the specifier strings change; logic/assertions don't.
- No path aliases exist in the repo today (all relative imports).
- One real risk: `vi.mock('#src/...')` must resolve to the same module a source file imports relatively, for the mock to intercept — verified by the before/after suite comparison.

## Verification
Server+shared move verified by before/after full-suite comparison (`npm test` = `vitest run`), IDENTICAL both sides:
- Test Files: 42 passed, 3 failed (45). Tests: 304 passed, 18 skipped (322).
- The 3 failing integration files (`booking`, `notification`, `prescription`) fail at baseline AND after — pre-existing dirty-DB state (FK violations / null reads), NOT collection/import errors; unchanged by the move.
- `vi.mock('#src/...')`-through-alias risk did NOT materialize — all 304 unit/integration passes unchanged; no `package.json "imports"` fallback needed.
- Move verified independently by controller: commit `23d09e3` present (git-detected renames), `server/test/` tree matches spec, zero leftover tests under `src/`/`shared/schemas`, working tree clean except controller files.
- Pre-existing (NOT introduced, out of scope): `eslint .` is broken repo-wide (ESLint v9 needs flat config; repo has legacy `.eslintrc.json`); one intentional unused-var in `env.test.js` (destructuring-rest). prettier re-wrapped some alias-lengthened lines (whitespace-only).

Client move (commit `6bd9869`) — verified by controller: re-ran `npm --workspace client run test` = **40 files / 135 tests, all passing** from `client/test/unit/...`; identical to baseline (135). 40 files in `client/test/`, zero `*.test.*` left under `client/src/`, clean tree. `vi.mock('#src/...')` interception worked (no fallback). Pre-existing/out-of-scope: client `npm run lint` reports 13 errors (12 in prod `src/`, 1 unused `noon` var in `DoctorToday.test.jsx` present at HEAD) — none introduced.

## Risk / rollback
Server move done + committed (not pushed). Blast radius = test files + root `vitest.config.js`; zero production source change. Rollback via `git revert 23d09e3` (history preserved by `git mv`).

## Open items / next session
- **Client move:** design approved; not yet executed. Server proved `resolve.alias` works (no fallback), so client can proceed with the same approach. Decide: delegate now.
- **Gated canonical doc-impact (awaiting approval), apply at task end after commits:** new **ADR-40** (test-centralization, supersedes test-location half of ADR-26; covers server + client) + supersession pointer on ADR-26; doc 03:102; doc 09:40/42/281/283; doc 11:390; doc 13:77/116. (Refs found by subagent + to be re-grepped during the pass.)
- Pre-existing repo issues noted but out of scope: broken root ESLint flat-config; dirty-DB integration-test failures.
