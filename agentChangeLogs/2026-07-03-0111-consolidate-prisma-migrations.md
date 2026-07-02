# 2026-07-03-0111 — consolidate-prisma-migrations

**Status:** Completed
**Goal:** Collapse the 9 Prisma migrations into a single consolidated baseline (`init`) reflecting the final schema, preserving the hand-added `uniq_active_slot` partial index.
**Skill(s) used:** None (opted out — bounded mechanical change)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (uncommitted — awaiting review)
**Last updated:** 2026-07-03-0153
**Tags:** #migration #infra

## Summary
The app is pre-deployment (local dev DB only, `localhost:5432/dermestha`) and the schema is final, so the 9 incremental migrations are collapsed into one clean baseline migration. Migrations are retained (not dropped) because prod deploys via `prisma migrate deploy` (doc 10) and the critical `uniq_active_slot` no-double-booking partial index lives ONLY in migration SQL — it cannot be expressed in `schema.prisma`, so `db push` alone would never create it on a fresh DB.

## Context / why
User asked whether migrations are still needed given the DB is already in its final state. Conclusion: not for the existing local DB, but yes as the reproducible artifact that rebuilds a fresh DB (prod/CI) with the hand-added partial index. Chose a single consolidated baseline over dropping migrations entirely.

## Files changed
| File | Action | What & why |
|---|---|---|
| `prisma/migrations/` (9 old dirs) | Deleted | Superseded by the single consolidated baseline (`migration_lock.toml` kept) |
| `prisma/migrations/20260702202106_init/migration.sql` | Created | Fresh baseline generated from final schema (13 tables, all indexes) + hand-appended `uniq_active_slot` partial index (`WHERE state IN ('pending','confirmed')`) |
| `docs/specification/11-ARCHITECTURE_DECISION_RECORD.md` | Modified | Added ADR-46 (migration consolidation) + footer row; v1.23→1.24 |
| `docs/specification/04-DATABASE_DOCUMENT.md` | Modified | §4b caveat names the baseline as the index's home (ADR-46) + footer row; v1.10→1.11 |
| `docs/specification/13-PRODUCT_STATUS_TRACKER.md` | Modified | "Prisma schema + migrations" row re-pointed to the consolidated baseline + footer row; v1.28→1.29 |
| `README.md` | Modified | Migration caveat: re-pointed to `20260702202106_init` + fixed a doubly-stale index SQL block (old 6-state list → `pending`/`confirmed`) |

## Dependencies / config / schema
DB schema unchanged (identical to pre-squash). Local dev DB wiped twice (`migrate reset --force --skip-seed`, run by the user) and rebuilt from the single baseline. Seeded prod-style with admin only via `npm run bootstrap:admin` (`admin@dermestha.dev` / `ChangeMe123!` — placeholder, rotate). No package/env changes.

## Decisions
- Keep migrations (one baseline) rather than going `db push`-only: prod deploy path + the non-DSL-expressible partial index require it.
- Retiring `seed.js` deferred to a separate follow-up (it is a live server-integration-test fixture dependency; not free to remove).
- `bootstrap-admin.js` unchanged — schema-dependent, prod-only admin path, unaffected by the squash.

## Notable findings
- `server/test/integration/prescription.test.js:17` depends on the `seed.js` doctor fixture (`dr.ayesha@dermestha.dev` / `Password123`) — so `seed.js` is NOT unused.
- `prisma migrate reset` does NOT auto-seed here (no `prisma.seed` key in package.json); seeding stays an explicit `npm run db:seed` step.
- Final form of the partial index: `WHERE state IN ('pending','confirmed')`.

## Verification
- `npx prisma migrate status` → "1 migration found. Database schema is up to date!"
- `_prisma_migrations` contains exactly one row: `20260702202106_init`.
- `uniq_active_slot` partial index present in DB: `CREATE UNIQUE INDEX ... WHERE (state = ANY (ARRAY['pending','confirmed']))` — the no-double-booking constraint survived the squash.
- 13 base tables in `public` (matches pre-squash schema).
- `npx prisma generate` → success (v6.19.3); earlier EPERM (Windows file lock) cleared.
- Automated test suites NOT run this session (out of scope for a migration-file squash; schema is byte-identical).

## Risk / rollback
Local-only blast radius. Revert = `git checkout prisma/migrations` to restore the 9 original migration dirs, then `npx prisma migrate reset --force`. No shared/prod DB affected (app not deployed).

## Open items / next session
Doc-impact: APPLIED (committed separately after the code commit, per change protocol).
- Added ADR-46 (doc 11) as the canonical record; bumped versions + footers on docs 04/11/13.
- Fixed current-state locators: doc 13 "Prisma schema + migrations" row, README migration caveat (+ its stale SQL), doc 04 §4b caveat.
- INTENTIONALLY PRESERVED as development history (covered by ADR-46, not rewritten): the provenance prose naming old migrations in doc 04 (§240/§246/§406/§469/§530/§540/§549/§556), doc 07 (§93/§127), doc 11 (§439/§495), doc 13 (§180), and all revision-footer rows. Rewriting these to the baseline name would falsify which change introduced what.
- Onboarding files (`onboarding/*`) + doc 10 + doc 15: NO change needed — they use generic commands (`migrate deploy`, `db:seed`, `bootstrap-admin`) and process descriptions, no old migration filenames.
- `agentChangeLogs/*`, `docs/superpowers/plans/*`: historical, left untouched.

Separate follow-up task (NOT this session): retire `seed.js` — move server integration test fixtures (`server/test/integration/prescription.test.js` depends on `dr.ayesha@dermestha.dev`) onto another seed, then update README + onboarding/* + doc 10 §4.1 + doc 13.
