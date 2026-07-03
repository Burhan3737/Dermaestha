# 2026-07-04-0024 — deployment-runbook

**Status:** Completed
**Goal:** Add a concise operator runbook for deploying Dermestha on a free stack, covering every scenario discussed this session.
**Skill(s) used:** None (no best-fit skill for writing a deployment runbook; user directed the task)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (not committed — awaiting user approval per CLAUDE.md)
**Last updated:** 2026-07-04-0024
**Tags:** #infra #docs

## Summary
Created a new `deployment/` folder with a concise `README.md` runbook for the Render + Neon free-tier deployment path. It documents the code-vs-database "sync" model, the runtime env-var contract (grounded in `server/src/config/env/env.js`), where DB commands run (laptop → Neon), and five deploy scenarios: initial, code-only redeploy, migration redeploy, fresh customer, and ongoing live customer — plus rollback and free-tier caveats.

## Context / why
User is evaluating a genuinely-free deployment and asked, across the session, how to deploy, redeploy on code changes, handle DB migrations, onboard a fresh customer vs. update a live one, and understand how DB changes reach the running app. They asked for a concise, commands-first reference document.

## Files changed
| File | Action | What & why |
|---|---|---|
| `deployment/README.md` | Created | Concise free-tier deployment runbook (Render + Neon), all five scenarios + rollback + caveats |
| `agentChangeLogs/2026-07-04-0024-deployment-runbook.md` | Created | This session changelog |
| `agentChangeLogs/index.md` | Modified | Added the session index line |

## Dependencies / config / schema
None. No code, dependencies, schema, or env changes — documentation only.

## Decisions
- Documented the **Render + Neon free** path rather than the spec's Railway target, because the user's constraint is "free right now." Flagged in the doc that Railway (doc 10) remains the canonical/upgrade target.
- Recommended `EMAIL_PROVIDER=console` for demos (no Resend/domain setup; neutralizes Render's sleep-delay on notifications).
- Recommended running Prisma migrate / bootstrap **from the laptop against the Neon URL**, because Render free has no reliable release phase and the app queries the DB at boot (`ensureSettings()`), which crashes on an un-migrated DB.
- Kept the Dockerfile unchanged; env vars stay host-injected (12-factor), consistent with doc 10 §1.

## Notable findings
- `server/src/config/env/env.js` is the real env-var source of truth: required (no default) = `APP_BASE_URL`, `DATABASE_URL`, `SESSION_SECRET` (≥16); video/email vars optional; `VIDEO_PROVIDER`/`EMAIL_PROVIDER` default to `stub`.
- `EMAIL_PROVIDER` enum **does** include `stub` (schema), but `pickProvider()` only special-cases `console` and otherwise keys off `RESEND_API_KEY` presence — so `stub`-with-no-key falls through to the console adapter.
- The cron worker (`startWorkers()`, `server/src/index.js:51`) starts unconditionally at boot; it is not gated by any env flag.
- Pre-existing doc drift (not caused here): doc 10's pre-deploy checklist references `EMAIL_PROVIDER=stub` intent for prod, and mentions provider terminology (`stub`) that only partly matches the email adapter's handled values.

## Verification
Not verified at runtime — documentation only, no executable change. Env-var list and boot behavior cross-checked against `server/src/config/env/env.js`, `server/src/index.js`, `server/src/integrations/email/index.js`, and `Dockerfile`.

## Risk / rollback
Negligible — additive documentation. Revert by deleting `deployment/` and this changelog, and removing the index line.

## Open items / next session
- Optional doc-10 improvements to consider (tracked, not applied): (1) the Render+Neon free path as an alternative to Railway; (2) the "empty-DB first-boot crash on hosts without a release phase" caveat; (3) the `EMAIL_PROVIDER` `stub`/`console` checklist wording. These touch a canonical spec (doc 10) and require the doc-impact approval flow.
