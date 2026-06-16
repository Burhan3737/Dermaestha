# Replicate Production Locally

Concise steps to run Dermestha the way production runs it: a **single Docker image**
(`NODE_ENV=production`) where Express serves the built React SPA **and** the API on
**one port (`:3000`)**, backed by Postgres. No Vite, no hot-reload.

Run every command **from the project root** (`C:\workProjects\dermestha`).

> Authoritative source: `docs/specification/10-DEPLOYMENT_DOCUMENT.md`. If this file disagrees, that one wins.

---

## Prerequisites

- **Docker Desktop** (runs both the app image and Postgres)
- **Node.js ≥ 22.14.0** + npm (only for the host-run migrate/seed below)
- **Git**

---

## Steps

### 1. Create your `.env`

```powershell
Copy-Item .env.example .env
```

Then in `.env`, set **`SESSION_SECRET`** to a long random string, and make sure
**`DATABASE_URL` ends in `:5432`** (`postgresql://user:pass@localhost:5432/dermestha`).
This `.env` is used by the **host** `prisma`/`seed` commands in steps 3–4 — not by the container.

### 2. Build and start the stack (app + db)

```powershell
docker compose up --build
```

This builds the production `Dockerfile` and starts Postgres 16 + the app with `NODE_ENV=production`,
serving on `http://localhost:3000`.

> **Want payment/video/email to actually work?** The container only receives the env vars listed in
> `docker-compose.yml` — it does **not** read `.env`. Production leaves the providers at `stub` (they
> throw on use). To exercise the flows with dev simulators, add these three lines to the **`app:` →
> `environment:`** block in `docker-compose.yml`, then re-run step 2:
> ```yaml
>       PAYMENT_PROVIDER: mock
>       VIDEO_PROVIDER: mock
>       EMAIL_PROVIDER: console
> ```

### 3. Apply migrations (from the host, in a second terminal)

```powershell
npx prisma migrate deploy
```

Required: the production image ships no dev dependencies, so the Prisma CLI is **not** inside the
container — migrations must run from the host against the published port (`localhost:5432`).
This also creates the `uniq_active_slot` index that prevents double-booking.

### 4. Seed the admin + demo data (from the host)

```powershell
npm run db:seed
```

Creates the admin and 2 demo doctors. Every seeded account uses password **`Password123`**.

> Admin login: **`admin@dermestha.dev`** / `Password123`.

#### Alternative: full-flow baseline seed

To exercise complete patient/doctor flows, use the richer baseline fixture instead. It seeds 2 patients,
1 doctor, and 4 ready-made appointments (a call in its join window, an issued prescription, and
cancel→refund / cancel→no-refund cases):

```powershell
node --env-file=.env prisma/scripts/seed-baseline.js
```

- ⚠️ **Destructive:** it **wipes every domain table** first, then seeds the fixture. Local/dev DB only.
- All baseline accounts use password **`Test123!`** (admin `baseline.admin@dermestha.test`,
  patients `baseline.patient1@…` / `baseline.patient2@…`, doctor `baseline.doctor@…`).
- The join-window appointment is near-future — re-run this seed right before testing the join flow for a fresh window.

### 5. Verify

- Open `http://localhost:3000`
- Health check: `http://localhost:3000/api/health` → expect `{"status":"ok","db":"up"}`
- Log in as the admin above.

---

## Stop / reset

```powershell
docker compose down        # stop, keep data
docker compose down -v      # stop + delete db and uploads volumes (full reset)
```
