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

## Local testing (hot reload)

For day-to-day development with **hot module reload**, run **Postgres in Docker** but the **app on your
host** — and use **`.env.example.dev`** (mock providers + `NODE_ENV=development`) for the server.

> **Why the app moves to the host:** hot reload needs the Vite dev server, which is **not** in the
> production image (it ships only the built bundle). Docker keeps running the database.

> **Why a separate dev env file:** `NODE_ENV=development` turns the session cookie's `Secure` flag **off**,
> so login works over plain `http://localhost`. The prod replica's `NODE_ENV=production` makes the cookie
> HTTPS-only, so login silently 401s over http. `.env.example.dev` also sets `PAYMENT_PROVIDER=mock` /
> `VIDEO_PROVIDER=mock` / `EMAIL_PROVIDER=console`, so payment/video/email flows work without real vendors.

**Prereqs:** host deps installed (`npm install`), Prisma client generated (`npx prisma generate`), and the
DB migrated + seeded (steps 3–4 above). Optionally set `SESSION_SECRET` in `.env.example.dev` to any long
random string.

### 1. Start Postgres only

```powershell
docker compose up -d db
```

If the full prod stack is already up, stop just the app container first (keeps the DB + data running):

```powershell
docker compose stop app
```

### 2. Start the API on the host (terminal 1)

```powershell
node --env-file=.env.example.dev server/src/index.js
```

Wait for `Dermestha listening on :3000`.

### 3. Start the Vite dev server (terminal 2)

```powershell
npm run dev:client
```

### 4. Open the app

Open the URL Vite prints (usually **`http://localhost:5173`**) — **not** `:3000` — and log in with a
seeded account.

> 💡 Browse `:5173`, not `:3000`. Vite serves the hot-reloading UI on `:5173` and proxies `/api` to the
> API on `:3000`. No `build:client` needed — Vite serves from source and reloads on save.
> To return to the production replica: stop both host processes (Ctrl-C), then `docker compose up -d app`.

---

## Stop / reset

```powershell
docker compose down        # stop, keep data
docker compose down -v      # stop + delete db and uploads volumes (full reset)
```
