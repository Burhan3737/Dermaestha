# DB Patches

Version-controlled, superadmin-run database remediation scripts. Deployed with the image and
executed on demand from the Patches view (`/admin/patches`) — see
`docs/superpowers/specs/2026-07-05-patches-module-design.md`.

## Authoring a patch

Add `NNN-slug.js` (numeric prefix orders the list) exporting:

- `id` (string) — stable identifier, match the filename stem.
- `description` (string) — shown in the UI.
- `repeatable` (boolean, optional, default `false`) — `false` = run-once (ledger-guarded).
- `up(tx)` (async) — receives a Prisma transaction client; return a small JSON summary
  (e.g. `{ rowsAffected }`) captured into the execution ledger.

## Rules

- **DATA/DML only.** Schema DDL (new tables/columns/enums) goes through Prisma migrations, not here.
- **Forward-only.** No `down()`. Fix a mistake with a new patch.
- Runs inside a `$transaction` — any throw rolls the whole patch back and is recorded as `failed`.
- Keep it idempotent where practical; run-once patches are blocked from a second successful run.
