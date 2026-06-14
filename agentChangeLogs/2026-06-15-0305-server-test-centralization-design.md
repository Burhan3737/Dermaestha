# 2026-06-15-0305 — server-test-centralization-design

**Status:** Partial
**Goal:** Brainstorm + spec a single centralized `test/` folder for the server (and shared) test suites, replacing ADR-26 co-location.
**Skill(s) used:** superpowers:brainstorming (user-invoked `/brainstorming`)
**Ticket / issue:** None
**Branch:** main (no code moved yet; design only)
**Commits / PR:** Pending (design doc commit)
**Last updated:** 2026-06-15-0305
**Tags:** #refactor #migration #testing #spec

## Summary
Investigated why server `modules/<x>/` use a bare `test.js` (intentional per ADR-26), then brainstormed a reorganization moving all server + shared tests into a per-workspace `test/` tree (`unit/` mirroring `src/` + flat `integration/`), glued by `#src`/`#shared` path aliases. Design doc written and pending user review; no code moved.

## Context / why
User wants both client and server test suites grouped in a single, maintainable `test/` folder. Server (+ shared) brainstormed first; client is a separate later cycle. The change deliberately reverses the test-location half of ADR-26.

## Files changed
| File | Action | What & why |
|---|---|---|
| `docs/superpowers/specs/2026-06-15-server-test-centralization-design.md` | Created | The approved design (structure, naming, aliases, migration, doc-impact). |
| `agentChangeLogs/2026-06-15-0305-server-test-centralization-design.md` | Created | This session log. |
| `agentChangeLogs/index.md` | Modified | Added this session's index line. |

## Dependencies / config / schema
None yet. Planned (at build time): add `resolve.alias` (`#src`, `#shared`) + new `include` globs to root `vitest.config.js`. No deps, no schema.

## Decisions
- Centralize tests, reversing ADR-26 co-location (→ new ADR-39).
- Layer-then-domain top split; `unit/` mirrors `src/`; sub-folder per source unit.
- Module bare `test.js` → role-named `service.test.js`; integration files drop `.integration` infix.
- Single-root path aliases (`#src/*`, `#shared/*`) via `resolve.alias` (not `package.json "imports"`).
- `test/` lives outside `src/` (`server/test/`, `shared/test/`). Shared included now; client deferred.

## Notable findings
- "Nothing inside changes" (user's initial premise) is false for unit tests: relative `import`/`vi.mock` paths break on move and must be rewritten. Only the specifier strings change; logic/assertions don't.
- No path aliases exist in the repo today (all relative imports).
- One real risk: `vi.mock('#src/...')` must resolve to the same module a source file imports relatively, for the mock to intercept — verified by the before/after suite comparison.

## Verification
Not verified (design phase only; no code changed). Verification gate at build time = full-suite green with identical passing count before vs after.

## Risk / rollback
Design-only so far — no runtime risk. Build-time blast radius is test files + `vitest.config.js` only; rollback via `git revert` (history preserved by `git mv`).

## Open items / next session
- User review of the design doc.
- Then writing-plans → implementation plan (server).
- Apply gated canonical doc updates (ADR-39 + docs 03/09/13) at end of build, after commit + approval.
- Client-side centralization: separate later cycle.
