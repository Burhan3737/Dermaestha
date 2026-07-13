# 2026-07-08-1621 — consolidate-prisma-migrations

**Status:** Completed
**Goal:** Re-flatten the 3 Prisma migrations into a single fresh `init` baseline after the patch-module schema changes, preserving BOTH hand-added partial indexes.
**Skill(s) used:** dermestha-migration-reset (opted in)
**Ticket / issue:** None
**Branch:** main
**Commits / PR:** None (commit gated on user approval)
**Last updated:** 2026-07-08-1635
**Tags:** #migration #infra

## Summary
Collapsing `prisma/migrations/` (3 dirs: `init`, `add_patch_executions`, `add_running_patch_guard`) into one regenerated `init` baseline that reproduces the final schema from empty. Local dev DB only, app pre-deployment. Migrations are kept (not `db push`) so prod `migrate deploy` works and the partial indexes survive.

## Context / why
Since the last consolidation (2026-07-03), the patches module added two migrations, one of which (`add_running_patch_guard`) hand-added a SECOND partial unique index (`uniq_running_patch`). Migrations have piled up again; re-flatten before deployment.

## Files changed
| File | Action | What & why |
|---|---|---|
| `prisma/migrations/20260705115543_init/` | Deleted | Collapsed into one baseline |
| `prisma/migrations/20260705172059_add_patch_executions/` | Deleted | Collapsed into one baseline |
| `prisma/migrations/20260705173500_add_running_patch_guard/` | Deleted | Collapsed into one baseline (its `uniq_running_patch` index re-appended to new baseline) |
| `prisma/migrations/20260708113341_init/migration.sql` | Created | Regenerated baseline + both hand-appended partial indexes (`uniq_active_slot`, `uniq_running_patch`) |

## Dependencies / config / schema
DB reset (destructive, local dev only) + reseed. No package/env changes.

## Decisions
- Re-append BOTH partial indexes, not just the one the skill documents: `uniq_active_slot` (appointments) AND `uniq_running_patch` (patch_executions). Prisma DSL can't express either (no WHERE on @@unique), so the schema regen drops both.

## Notable findings
- The skill only documents ONE hand-added partial index; this repo now has TWO. `schema.prisma`'s header caveat also only mentions `uniq_active_slot` — the `uniq_running_patch` caveat is not in the schema at all (only in migration SQL). Potential doc/skill gap to flag.

## Verification
- `npx prisma migrate status` → "1 migration found … Database schema is up to date!"
- `pg_indexes` → BOTH partial indexes present: `uniq_active_slot … WHERE (state = ANY (ARRAY['pending','confirmed']))` and `uniq_running_patch … WHERE (status = 'running')`.
- `SELECT count(*) FROM _prisma_migrations` → 1 row.
- `npx prisma migrate dev` applied the baseline cleanly; `prisma generate` succeeded (no EPERM); `npm run db:seed` → "Seed complete".

## Risk / rollback
Destroys local dev data (reproducible via seed). Rollback: restore prior migration dirs from git (they are committed/tracked in the working tree until this session) and re-reset.

## Open items / next session
- Complete reset → regen → re-append both indexes → apply → seed → verify.
- Doc-impact sweep (docs 04/11/13 + README + schema header second-caveat gap).
