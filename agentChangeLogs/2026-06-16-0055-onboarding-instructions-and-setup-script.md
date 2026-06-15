# 2026-06-16-0055 — onboarding-instructions-and-setup-script

**Status:** Completed
**Goal:** Give a brand-new developer a single plain-English guide + one-click script to run, build, and deploy the project locally and to production.
**Skill(s) used:** None (no available skill fit a setup-guide/convenience-script task; surfaced this to the user instead of activating one).
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (uncommitted working-tree additions)
**Last updated:** 2026-06-16-0055
**Tags:** #docs #infra

## Summary
Added a new-developer onboarding guide (`instructions.md`) and a one-click PowerShell helper (`setup.ps1`) that wrap the existing run/build/seed/deploy commands. Everything is grounded in the actual repo (package.json scripts, docker-compose.yml, Dockerfile, prisma/seed.js, prisma/scripts/*, server/src/index.js) and cross-checked against the canonical `docs/specification/10` + `15`. No code, schema, or spec changes.

## Context / why
A non-expert, fresh developer needed an easy, ordered path to start the project locally and to understand seed users/passwords and startup data, plus a script to avoid typing commands manually.

## Files changed
| File | Action | What & why |
|---|---|---|
| `onboarding/instructions.md` | Created | New-dev guide: prerequisites, local run (Docker DB + Node app), full-Docker option, build, seed users/passwords, startup data, **complete config reference (§7, all env vars + code-default-only vars + runtime settings, grouped, with how-to-set for the 3 config locations)**, tests, Railway deploy, troubleshooting, one-click table. |
| `onboarding/setup.ps1` | Created | One-click PowerShell helper with `-Task` subcommands (all/setup/dev/build/docker/seed/seed-baseline/bootstrap-admin/test/predeploy/stop/reset). Anchors to the project root via `Split-Path $PSScriptRoot -Parent` so it runs from `onboarding/` but executes at repo root. Never pushes/deploys. |
| `agentChangeLogs/index.md` | Modified | Added this session's one-line entry. |

> Follow-up edit (same session): grouped both files under `onboarding/` (per user request) and expanded the config
> section to cover EVERY setting after cross-checking `docs/specification/15`. Original root-level `instructions.md` /
> `setup.ps1` were removed (the `onboarding/` copies supersede them).

## Dependencies / config / schema
None. No packages, env vars, or migrations added/changed. `setup.ps1` copies `.env.example` -> `.env` only when `.env` is absent; it never edits an existing `.env`.

## Decisions
- **PowerShell script (not npm scripts):** editing `package.json` would be a code change; the user's primary shell is PowerShell. A standalone `.ps1` satisfies "one-click" without touching app code.
- **Grounded over README:** the root `README.md` is partially stale (claims Docker auto-runs migrations; lists different medicines; uses `ERROR_TRACKING_DSN`). Instructions follow the actual code + canonical docs `10`/`15` instead.
- **Recommended the non-Docker-app local path** as primary (Docker DB + `node` app) because it is the best-documented, simplest hot-reload flow.

## Notable findings
- **`.env` drift:** the live `.env` sets `DATABASE_URL` port **5433** while `docker-compose.yml` and `.env.example` use **5432**, and the live `.env` lacks newer keys (`PAYMENT_PROVIDER`, `EMAIL_PROVIDER`, `VIDEO_PROVIDER`, `UPLOADS_DIR`, `SENTRY_DSN`). Guide tells new devs to start from `.env.example`; script warns on a non-5432 port but does not edit `.env`.
- **Migrations are not automatic in Docker:** `server/src/index.js` runs `ensureSettings()` + `startWorkers()` at boot but no migrate; the runtime image installs no dev deps (no Prisma CLI), so migrations must be run from the host against the published DB port. README's "Docker handles migrations" is inaccurate.
- **Two seeds:** `npm run db:seed` (doctors + admin, password `Password123`, no patient) vs `prisma/scripts/seed-baseline.js` (wipes DB; admin/2 patients/doctor + appointments, password `Test123!`). Money stored in paisa.

## Verification
- `onboarding/setup.ps1` parsed with `[System.Management.Automation.Language.Parser]::ParseFile` -> **PARSE OK**, non-ASCII scan -> **ASCII-CLEAN**, and root resolution (`Split-Path (Split-Path $p -Parent) -Parent`) -> `C:\workProjects\dermestha`.
- Content cross-checked against: `package.json`, `client/package.json`, `docker-compose.yml`, `Dockerfile`, `.env`/`.env.example`, `prisma/seed.js`, `prisma/scripts/seed-baseline.js`, `prisma/scripts/bootstrap-admin.js`, `server/src/index.js`, `docs/specification/10` + `15` + `00`.
- **Second verification pass** confirmed against source: health shape `{status:'ok',db:'up'}` (`server/src/health/index.js`); Vite dev proxy `/api`->`:3000` (`client/vite.config.js`); Vitest `.env` auto-load via `loadEnv` (`vitest.config.js`); Playwright self-hosts a mock-provider server + needs browser install (`playwright.config.js`); `.env` is gitignored (`.gitignore`); Prisma singleton does NOT load dotenv — CLI auto-loads, `db:seed` is the maintainer-blessed command (`server/src/lib/prisma/prisma.js`).
- Did NOT execute the script's runtime tasks (npm install / docker / migrate) — no environment changes made.

## Risk / rollback
Low. Two new untracked files plus a one-line index addition. Rollback = delete `instructions.md` and `setup.ps1` and revert the `agentChangeLogs/index.md` line. No app behavior affected.

## Open items / next session
- Optional: reconcile the stale root `README.md` (Docker migrations claim, medicine list, `ERROR_TRACKING_DSN` -> `SENTRY_DSN`) — out of scope here (no code changes requested).
- Optional: add a bash equivalent (`setup.sh`) for non-Windows contributors.
- Doc-impact: no `docs/specification/` (00–15) updates required — these are derived convenience artifacts; doc `10` remains the canonical deploy source. Confirm with user before any spec touch.
