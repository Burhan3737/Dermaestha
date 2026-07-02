# Dermestha

Dermestha is a same-origin monolith: a single Express server serves both the `/api` routes and the built React (Vite) SPA from one origin and one port. Postgres (via Prisma) backs all persistence; sessions are stored in Postgres. This is the **Milestone 0 / Foundation scaffold** — the skeleton every later milestone builds on.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20+ (developed on Node 22) |
| npm | bundled with Node |
| Docker Desktop | any recent version |

---

## Local setup

### 1. Install dependencies

```
npm install
```

> **Important:** `npm install` does NOT auto-generate the Prisma client. Run `npx prisma generate` (step 4 below) before running the server or tests.

### 2. Create your `.env`

```powershell
Copy-Item .env.example .env
```

Open `.env` and review all values. The defaults match the Docker Compose database credentials — only `SESSION_SECRET` must be changed to something random before any real use.

### 3. Start Postgres

**Option A — Docker Compose (recommended)**

```
docker compose up -d db
```

This starts a Postgres 16 container on `localhost:5432`. If a native Postgres service already occupies port 5432, stop it first before running this command (Windows, elevated shell):

```powershell
Stop-Service postgresql-x64-18
```

Or change the host port in `docker-compose.yml` and update `DATABASE_URL` in `.env` to match.

**Option B — Full stack via Docker**

```
docker compose up --build
```

Builds the app image and starts both the `db` and `app` services. The app is available at http://localhost:3000. Skip steps 4–7 if using this option; Docker handles `prisma generate`, migrations, and the server start.

### 4. Generate the Prisma client

```
npx prisma generate
```

Required after every clean `npm install`. The Docker image runs this automatically; local dev does not.

### 5. Apply migrations

```
npx prisma migrate deploy
```

Applies all migrations including the hand-crafted `uniq_active_slot` partial index (see [Migration caveat](#migration-caveat-important) below). Use `npx prisma migrate dev` during active schema development.

### 6. Seed the database

```
npm run db:seed
```

Creates the single `settings` row and 3 demo medicines.

### 7. Bootstrap the admin account (first deploy / first setup)

The application has exactly one admin, created once by this script (DA4 — no admin self-signup):

```powershell
$env:ADMIN_EMAIL='you@example.com'
$env:ADMIN_PASSWORD='<strong-temporary-password>'
node --env-file=.env prisma/scripts/bootstrap-admin.js
```

The script is idempotent — running it again when an admin already exists is a safe no-op. **Rotate the password immediately after first login.**

> Note: the `bootstrap:admin` npm script (`npm run bootstrap:admin`) omits `--env-file` because production environments supply `DATABASE_URL` via the real process environment, not a `.env` file.

---

## Running

### Development

Two terminals:

```
# Terminal 1 — Express API on :3000
node --env-file=.env server/src/index.js
```

```
# Terminal 2 — Vite dev server (hot reload)
npm run dev:client
```

The `dev:server` npm script uses `node --watch` but does not load `.env` automatically:

```
npm run dev:server   # uses node --watch; ensure DATABASE_URL etc. are already in the environment
```

### Production-style (SPA built + served by Express)

```
npm run build:client
node --env-file=.env server/src/index.js
```

Express serves the built SPA at `/` and all `/api` routes from the same origin on port 3000.

### Docker

```
docker compose up --build
```

App available at http://localhost:3000. Health check: http://localhost:3000/api/health → `{"status":"ok","db":"up"}`.

---

## Testing

### Server suite (Vitest, Node environment)

```
npx vitest run
```

Requires a reachable Postgres at `DATABASE_URL` with migrations applied. Vitest loads `.env` into `process.env` automatically via `vitest.config.js` (uses `loadEnv`). Expected: **20 tests, 8 files**.

### Client suite (Vitest, jsdom environment)

```
npm --workspace client run test
```

No database required. Expected: **2 tests, 1 file** (RoleRoute guards).

---

## Migration caveat (IMPORTANT)

The no-double-booking guarantee (PRD §3.3 #1) is enforced by a **partial unique index** (`uniq_active_slot`) that Prisma's schema DSL cannot express (Prisma has no `WHERE` clause on `@@unique`). This index lives as hand-appended SQL at the bottom of the single consolidated baseline `prisma/migrations/20260702202106_init/migration.sql`:

```sql
CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
  WHERE state IN ('pending', 'confirmed');
```

`prisma migrate deploy` applies it automatically from the file. However, **if you ever recreate the init migration from scratch** (e.g. `prisma migrate dev --create-only` on an empty DB), Prisma will regenerate the SQL without this block and you must re-append it manually. See `docs/engineering/CONFIG.md §7.2` for the full spec.

---

## Admin bootstrap & deploy notes

- One admin only (DA4). Created by `prisma/scripts/bootstrap-admin.js` on first deploy.
- The script is idempotent and safe to re-run.
- No admin self-signup path exists anywhere in the app.
- Rotate the password immediately after running the script on a real environment.
- Full specs: `docs/engineering/` (API.md, CONFIG.md, ARCHITECTURE.md).

---

## Project structure (M0 scaffold)

```
dermestha/
├── server/src/
│   ├── config/       env.js + constants.js
│   ├── lib/          prisma singleton, logger, password, errorTracking
│   ├── http/         AppError, errorHandler
│   ├── middleware/   session, requireRole, rateLimit
│   ├── services/     audit.service (append-only)
│   ├── integrations/ payment/video/email stubs
│   ├── routes/       health.js
│   └── index.js      Express app assembly + listen guard
├── client/src/
│   ├── styles/       tokens.css + components.css (design tokens)
│   ├── lib/          RoleRoute.jsx (client-side role guard seam)
│   ├── App.jsx       placeholder
│   └── routes.jsx    route-config seam (M1 fills with 24 views)
├── prisma/
│   ├── schema.prisma
│   ├── seed.js
│   ├── migrations/   init migration + uniq_active_slot partial index
│   └── scripts/      bootstrap-admin.js
├── shared/schemas/   Zod DTO seam (M1+ fills in)
├── Dockerfile        multi-stage: client-build + runtime
├── docker-compose.yml  db (postgres:16) + app
└── .env.example
```
