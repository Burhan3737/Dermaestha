# 2026-06-16-2244 — onboarding-prod-replica-instruction

**Status:** Completed
**Goal:** Add a short, steps-only `onboarding/instruction.md` for replicating the production environment locally (distinct from the existing explanatory `instructions.md`).
**Skill(s) used:** None (no available skill fits doc-distillation; user opted to proceed without one / without `/findSkills`)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (not committed)
**Last updated:** 2026-06-16-2244
**Tags:** #docs #infra

## Summary
Created `onboarding/instruction.md` — a concise, steps-only guide to run Dermestha the way production runs it (single Docker image, `NODE_ENV=production`, Express serving the built SPA + API on `:3000`, Postgres). Chose the Docker Compose path because it builds the prod `Dockerfile` and is the faithful local replica. User selected "prod-shape, usable locally," so the doc uses the demo seed and documents enabling `mock`/`console` providers.

## Context / why
The existing `onboarding/instructions.md` is comprehensive but explanatory (run/build/deploy + full config reference). User wanted a separate, minimal file covering only the production-replica steps.

## Files changed
| File | Action | What & why |
|---|---|---|
| `onboarding/instruction.md` | Created, then Modified | New concise prod-replica runbook (Docker compose → host migrate → host seed → verify). Follow-up edit added the alternative full-flow baseline seed (`prisma/scripts/seed-baseline.js`, `Test123!`, destructive wipe). |
| `agentChangeLogs/2026-06-16-2244-onboarding-prod-replica-instruction.md` | Created | This session log (per CLAUDE.md Agent Logs rule). |
| `agentChangeLogs/index.md` | Modified | Added the one-line session entry. |
| `docker-compose.yml` | Modified | Added explicit `image: dermestha-app` to the `app` service so the built image has a defined name instead of the auto-derived `<project>-<service>`. |

## Dependencies / config / schema
None.

## Decisions
- **Docker Compose = the production replica.** `docker-compose.yml` builds the prod `Dockerfile` and sets `NODE_ENV=production`, so `docker compose up --build` is the faithful "prod locally" path (vs. the `npm run dev:client` hot-reload path).
- **Provider vars belong in `docker-compose.yml`, not `.env`.** Verified the server has no `dotenv`/`--env-file`/`loadEnvFile` (grep in `server/` → no matches); the container runs `node server/src/index.js` with no `--env-file`, so it sees only the compose `environment:` vars. The doc therefore tells users to add `PAYMENT_PROVIDER`/`VIDEO_PROVIDER`/`EMAIL_PROVIDER` to the compose `app.environment` block. (This corrects the inaccurate `.env` placement shown in the clarifying-question preview.)
- **Host-run migrate/seed.** Prod image installs no dev deps → Prisma CLI absent in container; migrate/seed run from host against `localhost:5432`. Matches doc 10 §3/§4.

## Notable findings
- The prod container does not read host `.env` — a real gotcha for anyone expecting `.env` provider switches to take effect inside Docker.
- The host `.env` still matters: `npx prisma migrate deploy` and `npm run db:seed` read it (Prisma CLI loads `.env`; seed needs `DATABASE_URL` → `localhost:5432`).

## Verification
Not verified at runtime (doc-only change; no `docker compose` run performed this session). Step content cross-checked against `Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json` scripts (`db:seed`, `build:client`), and `docs/specification/10-DEPLOYMENT_DOCUMENT.md`.

## Risk / rollback
Negligible — additive doc file. Revert by deleting `onboarding/instruction.md` and this log's index line.

## Open items / next session
- Doc-impact check ran (see verdict in chat): **no `docs/specification/` (00–15) updates required** — this is a convenience doc derived from existing canon (doc 10), introducing no new fact, config value, or decision.
- Not committed; awaiting user. Per repo rules I will not push/branch/deploy without approval.
