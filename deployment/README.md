# Dermestha — Deployment Runbook (free-tier)

Concise operator guide for deploying Dermestha on a **free** stack and keeping it running.
Canonical target in the spec is Railway (doc 10); this runbook covers the **Render + Neon free** path.
No secrets live in the image — all config is injected at runtime (12-factor).

**Stack:** Render (app, Docker, free) · Neon (Postgres, free) · Daily.co (video, free) · console email (or Resend).

---

## Mental model (read once)

- **Code** reaches production by `git push` → Render rebuilds & restarts.
- **Database** (migrations, admin, settings) is changed by running Prisma **against the Neon URL from your laptop** → visible to the live app **instantly** (same DB, no push, no sync step).
- The app and your laptop share **only the database**. Nothing else is synced.
- The **cron worker** (notification dispatch) starts automatically at boot — not optional, not configurable.
- `EMAIL_PROVIDER=console` logs emails to Render logs instead of sending them → no Resend/domain setup, and Render's sleep-delay stops mattering.

---

## Environment variables

Set these in **Render's dashboard**, never in the Dockerfile. Source of truth: `server/src/config/env/env.js`.

**Required (boot fails without them):**

| Var | Value |
|---|---|
| `APP_BASE_URL` | your Render URL, e.g. `https://dermestha.onrender.com` (must be a valid URL) |
| `DATABASE_URL` | Neon pooled URL + `?sslmode=require` |
| `SESSION_SECRET` | random string, **≥16 chars** |

**For video + email:**

| Var | Value |
|---|---|
| `VIDEO_PROVIDER` | `daily` |
| `DAILY_API_KEY` | from Daily.co dashboard |
| `DAILY_DOMAIN` | e.g. `your-team.daily.co` |
| `EMAIL_PROVIDER` | `console` (demo) or `resend` |
| `RESEND_API_KEY` | only if `EMAIL_PROVIDER=resend` |

Safe defaults (leave unset): `PORT`(3000), `UPLOADS_DIR`(./uploads), rate-limit/token windows.

> `NODE_ENV=production` is the only value baked into the Dockerfile — that is correct. The Dockerfile needs **no edits** for this deploy.

---

## Where DB commands run

**From your laptop**, pointed at Neon — not on Render (free tier has no reliable release phase, and the app hits the DB at boot before it can accept a shell).

```bash
export DATABASE_URL="<neon-pooled-url>?sslmode=require"   # Windows PS: $env:DATABASE_URL="..."
```

Run from repo root, Node ≥22.14.

---

## Scenario 1 — Initial deploy (first ever)

```bash
# A. Prepare DB (laptop → Neon)
export DATABASE_URL="<neon-url>"
npm run build:client && npm test
npx prisma migrate deploy
# verify the hand-added partial index exists; if missing, run in Neon SQL:
#   CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
#     WHERE state IN ('pending','confirmed');
npm run bootstrap:admin          # first admin only — rotate password after first login

# B. Deploy app
git push origin main             # (Render: New → Web Service → repo → Docker → Free, set env vars)
```

Then, in the app: admin logs in → set bank-transfer settings (`bankName`, `bankAccountName`, `bankAccountNumber`, `bankInstructions`) → rotate admin password.

Smoke: `curl -s -o /dev/null -w "%{http_code}" https://<app>/api/health` → `200`

---

## Scenario 2 — Redeploy after code change (no schema change)

```bash
npm run build:client && npm test
git push origin main             # Render auto-builds on push
```

---

## Scenario 3 — Redeploy with a DB migration (schema change)

```bash
export DATABASE_URL="<neon-url>"
npx prisma migrate deploy        # migrate FIRST for additive changes
# re-verify uniq_active_slot if this migration touched the appointments table
git push origin main
```

Ordering:
- **Additive** (new column/table): migrate → then push code that uses it.
- **Destructive** (drop/rename): push code that stops using it → then migrate (expand→contract).

---

## Scenario 4 — Fresh customer (new isolated instance)

```bash
# New Neon DB + new Render service + new env vars, then:
export DATABASE_URL="<new-neon-url>"
npx prisma migrate deploy
npm run bootstrap:admin
git push origin main             # (or point the new Render service at the same repo)
```

Then admin logs in → set bank-transfer settings → rotate password.

---

## Scenario 5 — Ongoing live customer (update in place)

```bash
npm run build:client && npm test
export DATABASE_URL="<their-neon-url>"
npx prisma migrate deploy        # ONLY if schema changed
git push origin main
```

- **Never** re-run `bootstrap:admin` (creates a duplicate admin).
- **Back up first**: take a Neon branch/snapshot before migrating.
- Additive migrations = safe live; destructive = expand→contract across two deploys.

---

## Rollback

- **Code:** Render dashboard → Deployments → Redeploy a previous build.
- **Database:** migrations are **forward-only** — there is no auto down-migration. Undo a schema change by writing a new forward migration (or manual SQL, e.g. `DROP INDEX uniq_active_slot;`).

---

## Free-tier caveats (Render)

- Service **sleeps after ~15 min idle** → first request slow; cron/email delayed (moot with `EMAIL_PROVIDER=console`).
- **Ephemeral disk** → uploaded doctor photos are lost on redeploy/restart (DB data & sessions survive — they're in Neon).
- **Un-migrated DB crashes first boot** (`ensureSettings()` queries at boot) → always `migrate deploy` against Neon **before** first boot.
- Node must stay **≥22.14** (Daily.js); the `node:22-slim` image satisfies this.
- Resend without a verified domain only delivers to the account owner's inbox — use `console` for demos, verify a domain for real patients.

---

## Zero-caveat upgrade

Move to **Railway** (~$5/mo, the spec's intended host, doc 10): same Docker image, persistent uploads volume, no sleep. Only change is where env vars live — no code change.
