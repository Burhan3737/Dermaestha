# Dermestha — New Developer Guide (Run · Build · Deploy)

A plain-English, copy-paste guide for a brand-new developer. Follow the sections **in order**.

> **These files live in `onboarding/`.** Run all commands **from the project root** (`C:\workProjects\dermestha`),
> not from inside `onboarding/`. The helper script (`onboarding/setup.ps1`) automatically anchors itself to the
> project root, so you can launch it from anywhere.

> **Where this fits:** This is a friendly convenience guide. The **authoritative** specs live in
> `docs/specification/` — in particular `10-DEPLOYMENT_DOCUMENT.md` (deploy) and
> `15-CONFIGURATION_REFERENCE_DOCUMENT.md` (every environment variable). If this file and those ever
> disagree, the `docs/specification/` suite wins.

---

## 0. What this project is (30-second mental model)

Dermestha is a **single Node/Express server** that does two jobs at once on **one port (3000)**:

1. Serves the JSON API under `/api/...`
2. Serves the compiled React (Vite) website (the "SPA") for everything else.

Data lives in **PostgreSQL**, accessed through **Prisma**. Logins/sessions are stored in Postgres too.
Because the API and the website share one origin, there is no CORS setup and no separate frontend server in production.

```
Browser ──HTTP :3000──► Express ──┬─► /api/*        → JSON API + background workers
                                  └─► everything else → React SPA (client/dist)
                                          │
                                          ▼
                                    PostgreSQL (via Prisma)
```

---

## 1. Prerequisites (install these first)

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **22.14.0 or newer** | `package.json` says `>=20`, but the video library `@daily-co/daily-js` needs Node ≥ 22.14.0. Use Node 22 to be safe. |
| **npm** | bundled with Node | — |
| **Docker Desktop** | any recent | Used to run PostgreSQL locally (and optionally the whole app). |
| **Git** | any recent | — |

Check your versions:

```powershell
node -v      # expect v22.14.0 or higher
npm -v
docker -v
```

---

## 2. Quickest path: run locally (recommended for daily work)

This runs **PostgreSQL in Docker** and the **app directly with Node** (best for hot-reload and debugging).

### Step 1 — Install dependencies

```powershell
npm install
```

> ⚠️ `npm install` does **not** generate the Prisma client. You must run Step 3 before starting the server or tests.

### Step 2 — Create your `.env`

```powershell
Copy-Item .env.example .env
```

Then open `.env` and set **`SESSION_SECRET`** to any long random string. For purely local testing the rest of the
defaults are fine. (See [Section 7](#7-configuration-reference-every-setting) for what each variable does.)

> ⚠️ **Important — known drift:** A `.env` may already exist in this repo that points `DATABASE_URL` at port
> **5433** and is missing some newer keys. The clean starting point is **`.env.example`** (port **5432**, which
> matches Docker). If you keep an old `.env`, make sure its `DATABASE_URL` port matches the database you actually run
> (see Step 4).

### Step 3 — Generate the Prisma client

```powershell
npx prisma generate
```

(Required after every fresh `npm install`.)

### Step 4 — Start PostgreSQL (Docker)

```powershell
docker compose up -d db
```

This starts **Postgres 16** on `localhost:5432` (user `user`, password `pass`, database `dermestha`).

- If port **5432** is already used by a native Postgres service, stop it first (elevated PowerShell):
  `Stop-Service postgresql-x64-18` — or change the published port in `docker-compose.yml` **and** the
  `DATABASE_URL` port in `.env` so they match.

### Step 5 — Apply database migrations

```powershell
npx prisma migrate deploy
```

This creates all tables **and** the hand-written `uniq_active_slot` partial index that prevents double-booking.
(Prisma loads `.env` automatically for its CLI commands.)

### Step 6 — Seed starter data

```powershell
npm run db:seed
```

This inserts: the settings row, 3 demo medicines, **2 demo doctors** (with weekly availability), and **1 admin**.
See [Section 5](#5-seed-data--default-logins) for the exact accounts and passwords.

### Step 7 — Run the app (two terminals)

**Terminal 1 — API server (port 3000):**

```powershell
node --env-file=.env server/src/index.js
```

**Terminal 2 — Vite dev server (hot-reloading UI):**

```powershell
npm run dev:client
```

- The **Vite dev server** prints a URL (usually `http://localhost:5173`) — use that for live UI development; it proxies API calls to `:3000`.
- The **API + a production-style UI** are at `http://localhost:3000`.
- Health check: open `http://localhost:3000/api/health` → expect `{"status":"ok","db":"up"}`.

> 💡 `npm run dev:server` exists too (auto-restart via `node --watch`), but it does **not** load `.env`. Prefer the
> explicit `node --env-file=.env server/src/index.js` command above unless your shell already has the variables set.

> 🚀 Or just run `\.onboarding\setup.ps1` to do Steps 1–7 in one go (see [Section 11](#11-one-click-helper-script)).

---

## 3. Run the whole stack in Docker (app + database together)

Use this when you just want it running and don't need hot-reload.

```powershell
docker compose up --build
```

This builds the app image and starts both `db` and `app`. The app is at `http://localhost:3000`.

> ⚠️ **Migrations and seed are NOT automatic.** The container only auto-runs `prisma generate` (at build) and
> `ensureSettings()` (at boot). You still need to apply migrations and seed **once**, from your host machine,
> against the published database port:
>
> ```powershell
> # Make sure DATABASE_URL in .env points to localhost:5432 (the published Docker port)
> npx prisma migrate deploy
> npm run db:seed
> ```
>
> (Running them inside the container won't work: the production image installs no dev dependencies, so the Prisma CLI isn't present there.)

To stop and remove the containers:

```powershell
docker compose down          # keep data
docker compose down -v       # also delete the database + uploads volumes (full reset)
```

---

## 4. Build for production (locally)

To produce the optimized UI bundle and serve it from Express on one port:

```powershell
npm run build:client                       # outputs client/dist/
node --env-file=.env server/src/index.js   # Express serves the built SPA + API on :3000
```

Open `http://localhost:3000` — this is exactly how production behaves (one origin, no Vite dev server).

---

## 5. Seed data & default logins

### What `npm run db:seed` creates (`prisma/seed.js`)

**Every seeded account uses the password: `Password123`**

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@dermestha.dev` | The single app admin. |
| Doctor | `dr.ayesha@dermestha.dev` | Fee Rs 2,500; available **Mon/Wed/Fri 18:00–21:00**; specialization "Acne & Pigmentation". |
| Doctor | `dr.bilal@dermestha.dev` | Fee Rs 3,000; available **Mon/Wed/Fri 18:00–21:00**; specialization "Eczema & Psoriasis". |

It also seeds **3 medicines** (Isotretinoin, Adapalene Gel, Clindamycin Lotion) and the single **settings** row.

> 🔎 **No patient is seeded.** To test the patient journey, register a new patient through the website's sign-up flow.

### Alternative: a richer "baseline" fixture (`prisma/scripts/seed-baseline.js`)

This one **wipes every domain table** and seeds a small, predictable fixture **including patients and ready-made
appointments** (a call in its join window, an issued prescription, and cancel→refund / cancel→no-refund cases). Best
for exercising full flows.

**Every baseline account uses the password: `Test123!`**

| Role | Email |
|---|---|
| Admin | `baseline.admin@dermestha.test` |
| Patient | `baseline.patient1@dermestha.test` |
| Patient | `baseline.patient2@dermestha.test` |
| Doctor | `baseline.doctor@dermestha.test` (available every day 09:00–21:00) |

Run it with:

```powershell
node --env-file=.env prisma/scripts/seed-baseline.js
```

> ⚠️ Destructive: it **deletes all existing rows** first. Use only on a local/dev database.

### What data exists at startup (before any seeding)

After **migrations only** (no seed), all domain tables are empty **except** the `settings` row, which the server
creates automatically on first boot via `ensureSettings()`. New `session` rows appear as people log in; uploaded
doctor photos are written under `UPLOADS_DIR` (`./uploads` by default).

> 💰 **Money is stored in paisa** (1 PKR = 100 paisa). A `fee` of `250000` means **Rs 2,500**.

---

## 6. Creating the real admin (production / first deploy)

Production does **not** run the demo seed. The single admin is created once by a dedicated script (there is **no**
admin self-signup anywhere in the app):

```powershell
$env:ADMIN_EMAIL = 'you@example.com'
$env:ADMIN_PASSWORD = '<a-strong-temporary-password>'
node --env-file=.env prisma/scripts/bootstrap-admin.js
```

- The script is **idempotent** — if an admin already exists, it does nothing.
- **Rotate the password immediately** after the first login.
- In a real host (e.g. Railway) where `DATABASE_URL` is supplied by the platform, use `npm run bootstrap:admin`
  (no `--env-file`), and provide `ADMIN_EMAIL` / `ADMIN_PASSWORD` through the host's environment settings.

---

## 7. Configuration reference (every setting)

This section covers **all** configuration. The canonical source is `docs/specification/15-CONFIGURATION_REFERENCE_DOCUMENT.md`;
this is a friendlier restatement.

### 7.0 — The three places configuration lives, and how to set each

| Where | What it is | How to set it |
|---|---|---|
| **`.env` (local) / host dashboard (prod)** | Deploy-time environment variables. | **Local:** edit `.env` as `KEY=value` lines; it's read by `node --env-file=.env ...`, by the Prisma CLI, and by Vitest. **Prod (Railway):** set each variable in the project's **Variables** tab. |
| **Code defaults (no `.env.example` entry)** | A handful of tuning vars that have built-in defaults and are **not** listed in `.env.example`. | Only set them (in `.env` or the host dashboard) if you need to override the default. They are listed in [7.9](#79--advanced-defaults-only-in-code-not-in-envexample). |
| **`settings` table (runtime)** | Three values an admin can change **live, with no redeploy**. | Admin UI (view A-06) or `PUT /api/admin/settings`. See [7.10](#710--runtime-tunables-database-not-env). |

> **Rule of thumb for local dev:** copy `.env.example` → `.env`, set `SESSION_SECRET`, and (if you want to click
> through payment/video/email) set the three provider switches to their dev values. Everything else can stay default.

### 7.1 — Core (required)

| Variable | What it does | Local value |
|---|---|---|
| `NODE_ENV` | Runtime mode. | `development` |
| `PORT` | Port Express listens on. | `3000` |
| `APP_BASE_URL` | Public origin; used to build webhook notify/return URLs. | `http://localhost:3000` |

### 7.2 — Database (required)

| Variable | What it does | Local value |
|---|---|---|
| `DATABASE_URL` | Postgres connection string used by Prisma. **Its port must match your running DB.** | `postgresql://user:pass@localhost:5432/dermestha` |

> In production on Railway, the Postgres plugin **injects `DATABASE_URL` automatically** — you don't set it by hand.

### 7.3 — Sessions / auth (required)

| Variable | What it does | Local value |
|---|---|---|
| `SESSION_SECRET` | Signs session cookies. **Must be set; use a long random string; rotate per environment.** | any long random string |
| `SESSION_TTL_DAYS` | Session lifetime (rolling). | `7` |

### 7.4 — Provider switches (dev simulators vs real vendors)

These decide whether the app uses harmless **dev simulators** or **real paid vendors**. All three default to the
production-safe value (`stub`, which throws until a real provider is wired). For **local full-flow testing without any
vendor accounts**, use the "dev value" column.

| Variable | What it does | Values | Dev value |
|---|---|---|---|
| `PAYMENT_PROVIDER` | Selects the payment gateway. `mock` mounts a simulated `/dev/checkout`. | `stub` \| `mock` \| `payfast` | `mock` |
| `EMAIL_PROVIDER` | Selects the email sender. `console` just logs emails to the server output. | `stub` \| `console` \| `resend` | `console` |
| `VIDEO_PROVIDER` | Selects the video provider. `mock` enables `/dev/video/*` + `/dev/worker/*` simulators. | `stub` \| `mock` \| `daily` | `mock` |
| `VIDEO_MOCK_SECRET` | Optional dev-only signing key for mock meeting tokens. | any string | leave blank |

> 🔒 **Production must leave these at `stub`/real values** (never `mock`/`console`) so the `/dev/*` simulator routes
> are never exposed.

### 7.5 — PayFast (real payment, production)

Leave blank locally unless testing the real PayFast Pakistan integration.

| Variable | What it does |
|---|---|
| `PAYFAST_MERCHANT_ID` | PayFast Pakistan merchant ID. |
| `PAYFAST_SECURED_KEY` | Secured key; authenticates the adapter's `GetAccessToken` step. |
| `PAYFAST_MERCHANT_NAME` | Merchant name; part of the signature payload. |
| `PAYFAST_STORE_ID` | Store/merchant identifier provisioned at KYC. |
| `PAYFAST_PASSPHRASE` | **Dev-mock only** — HMAC key for the `payfast.mock` signed IPN. Not used by the real adapter. |
| `PAYFAST_MODE` | Real-adapter gateway mode: `sandbox` (default) or `live`. |

### 7.6 — Daily.co (real video, production)

| Variable | What it does | In `.env.example`? |
|---|---|---|
| `DAILY_API_KEY` | Daily.co API key (Bearer auth for `createRoom`/`issueToken`). | Yes |
| `DAILY_DOMAIN` | Daily.co team domain (e.g. `your-team.daily.co`). | Yes |
| `DAILY_WEBHOOK_SECRET` | HMAC key to verify `POST /api/webhooks/daily`. **Required for real Daily video in prod** — produced by the one-time `server/scripts/register-daily-webhook.mjs` step. | **No — set it manually in prod** |

### 7.7 — Resend (real email, production)

| Variable | What it does |
|---|---|
| `RESEND_API_KEY` | Resend API key. If present (and `EMAIL_PROVIDER` isn't `console`), the real Resend adapter is used. |
| `RESEND_FROM` | From address. Without it, mail sends from `onboarding@resend.dev` and only reaches the account owner; real patient email needs a verified domain + this set. |

### 7.8 — Error tracking & file storage

| Variable | What it does | Default |
|---|---|---|
| `SENTRY_DSN` | Sentry DSN. Unset → error tracking is a no-op (fine in dev). Required in prod. (Formerly `ERROR_TRACKING_DSN`.) | _(blank)_ |
| `UPLOADS_DIR` | Where doctor profile photos are written; served at `/uploads`. In Docker this is the `dermestha_uploads` volume (must be persistent in prod or photos are lost on redeploy). | `./uploads` |

### 7.8b — Timing, rate-limit & refund knobs (deploy-time; defaults are fine)

These are all in `.env.example` with sensible defaults. Override only if you have a reason.

| Variable | What it does | Default |
|---|---|---|
| `SLOT_LOCK_TTL_MIN` | How long a slot is reserved during payment. | `10` |
| `SLOT_GRANULARITY_MIN` | Booking slot size. | `30` |
| `NO_SHOW_GRACE_MIN` | Grace after slot start before "no-show". | `15` |
| `VIDEO_TOKEN_PRE_MIN` | Minutes before slot-start the video token opens. | `10` |
| `VIDEO_TOKEN_POST_MIN` | Minutes after slot-end the video token closes. | `5` |
| `RESET_TOKEN_TTL_MIN` | Password-reset token lifetime. | `60` |
| `LOGIN_MAX_ATTEMPTS` | Failed logins before lockout. | `5` |
| `LOGIN_LOCKOUT_MIN` | Lockout duration. | `15` |
| `SIGNUP_MAX_PER_IP_HOUR` | Sign-ups per IP per hour. | `5` |
| `FORGOT_MAX_PER_ACCOUNT_HOUR` | Forgot-password requests per account per hour. | `5` |
| `PAYMENT_INTENT_MAX_PER_PATIENT_HOUR` | Payment-intents per patient per hour. | `10` |
| `REFUND_MAX_ATTEMPTS` | Max refund retry attempts. | `5` |
| `REFUND_BACKOFF_BASE_SEC` | Refund retry backoff base seconds (`base × 2^attempt`). | `30` |

### 7.9 — Advanced defaults (only in code, not in `.env.example`)

These have built-in defaults and are **absent from `.env.example`**. Add them to `.env` / the host dashboard only to
override. (Source: doc 15 §8.)

| Variable | What it does | Default |
|---|---|---|
| `EMAIL_MAX_ATTEMPTS` | Email dispatch attempts before a job fails (and alerts). | `3` |
| `EMAIL_BACKOFF_BASE_SEC` | Email retry backoff base seconds. | `60` |
| `RECONCILIATION_LOOKBACK_H` | Hours of payment history the reconciliation worker scans. | `24` |
| `RECONCILIATION_MIN_AGE_MIN` | Minimum payment age before reconciliation acts. | `60` |

### 7.10 — Runtime tunables (database, not env)

Changed live by an admin via view **A-06** / `PUT /api/admin/settings` — **no redeploy**. Stored in the `settings` row.

| Setting | What it does | Range / default |
|---|---|---|
| `minBookingLeadMinutes` | Minimum gap between "now" and a bookable slot. | 30–1440; default **60** |
| `fallbackFeePctBps` | Fallback gateway-fee percentage (basis points) when PayFast reports none. | 0–10000 |
| `fallbackFeeFixed` | Fallback fixed gateway fee, in paisa. | ≥ 0 |

---

## 8. Running the tests

```powershell
npm test                              # server + shared suites (Vitest); needs a migrated DB reachable at DATABASE_URL
npm --workspace client run test       # client suite (Vitest + jsdom); no database needed
npm run lint                          # ESLint
```

The server tests load `.env` automatically (via `vitest.config.js`). Make sure Postgres is up and migrated first.

### End-to-end tests (Playwright)

```powershell
npx playwright install chromium       # ONE TIME: download the browser binary
npm run test:e2e                      # runs the e2e/ suite
```

What `npm run test:e2e` does for you: it **builds the client and starts its own server** on `:3000` with the dev
mock providers (`PAYMENT_PROVIDER=mock`, `VIDEO_PROVIDER=mock`, `EMAIL_PROVIDER=console`), reusing an already-running
`:3000` if one is up. You still need **Postgres up and migrated** (its setup seeds its own test rows). Skipping the
one-time `npx playwright install` is the most common first-run failure.

---

## 9. Deploying to production (Railway)

> 🔒 **`git push` and any deploy action require explicit human approval per this repo's rules.** The steps below are
> the procedure; do not push on someone's behalf without their go-ahead. Source of truth:
> `docs/specification/10-DEPLOYMENT_DOCUMENT.md`.

**Pre-deploy checklist (run locally first):**

```powershell
npm run build:client    # confirm client/dist/ is produced
npm test                # all green
npm run lint            # clean
```

Also confirm: the `uniq_active_slot` index is present in `prisma/migrations/`, all required env vars are set in
Railway, secrets are rotated per environment, and the dev provider switches are **off** (`PAYMENT_PROVIDER`,
`EMAIL_PROVIDER`, `VIDEO_PROVIDER` unset or `stub`).

**One-time Railway setup:**

1. Create a Railway project.
2. Add the **Postgres plugin** (Railway injects `DATABASE_URL` automatically).
3. Choose the **Mumbai** or **Singapore** region.
4. Link this repository — Railway detects the root `Dockerfile`.

**Each deploy:**

1. Set all required environment variables in Railway's **Variables** tab (see [Section 7](#7-configuration-reference-every-setting)
   and doc 15). At minimum: `NODE_ENV=production`, `APP_BASE_URL=https://<your-railway-domain>`, a strong unique
   `SESSION_SECRET`, `PAYFAST_*` (with `PAYFAST_MODE=live`), `DAILY_*` (incl. `DAILY_WEBHOOK_SECRET`), `RESEND_*`,
   and `SENTRY_DSN`.
2. Push to the branch Railway watches (**requires approval**):
   ```powershell
   git push origin main
   ```
   Railway builds the image from the `Dockerfile` automatically.
3. After the deploy, **apply migrations** (via Railway shell / one-off command):
   ```bash
   npx prisma migrate deploy
   ```
4. Verify the `uniq_active_slot` index exists.
5. **First deploy only:** create the admin with `npm run bootstrap:admin` (see [Section 6](#6-creating-the-real-admin-production--first-deploy)), then rotate the password.

**Validate the deploy:** hit `https://<domain>/api/health` (expect 200), log in as admin, and run one booking happy-path.

**Rollback:** Railway keeps prior deployments — redeploy a previous successful one from the dashboard. Note that
database migrations are **forward-only** (no automatic down-migrations).

---

## 10. Common problems

| Symptom | Likely cause / fix |
|---|---|
| `PrismaClientInitializationError` / "Can't reach database" | DB not running, or `DATABASE_URL` port doesn't match. Start `docker compose up -d db` and ensure the port matches (5432 by default). |
| Server starts but `@prisma/client did not initialize` | You skipped `npx prisma generate`. Run it. |
| Port 5432 already in use | A native Postgres is running. Stop it (`Stop-Service postgresql-x64-18`) or change the compose port + `DATABASE_URL`. |
| Port 3000 already in use | Another process owns 3000. Stop it or change `PORT` in `.env`. |
| Admin login fails on a fresh DB | You ran migrations but not `npm run db:seed` (or the prod `bootstrap-admin` script). |
| Payment/video/email throws on a click | Provider is `stub`. Set `PAYMENT_PROVIDER=mock`, `VIDEO_PROVIDER=mock`, `EMAIL_PROVIDER=console` for local testing. |
| Node/Vite build errors about Node version | You're below Node 22.14.0. Upgrade Node. |
| `setup.ps1` won't run: "running scripts is disabled" | PowerShell execution policy. Run `Set-ExecutionPolicy -Scope Process -Bypass`, or launch via `powershell -ExecutionPolicy Bypass -File .\onboarding\setup.ps1`. |
| `npm run test:e2e` fails immediately / "browser not found" | You skipped the one-time `npx playwright install chromium`. Also ensure Postgres is up and migrated. |

---

## 11. One-click helper script

Instead of typing the commands above, use **`onboarding/setup.ps1`** (PowerShell). It always runs from the project
root, so launch it from anywhere:

```powershell
.\onboarding\setup.ps1 -Task help    # list all tasks
.\onboarding\setup.ps1               # full local setup AND launch the app (default task)
```

> ⚠️ **First-run on Windows:** if you see *"running scripts is disabled on this system"*, PowerShell's execution
> policy is blocking the script. Either allow scripts for the current window:
> ```powershell
> Set-ExecutionPolicy -Scope Process -Bypass
> ```
> or run it without changing any policy:
> ```powershell
> powershell -ExecutionPolicy Bypass -File .\onboarding\setup.ps1
> ```

| Task | What it does |
|---|---|
| `all` *(default)* | Full local setup, then launches API + UI. |
| `setup` | Install deps, create `.env`, prisma generate, start DB, migrate, seed. |
| `dev` | Launch API server + Vite dev server (setup already done). |
| `build` | Build the client and serve it production-style on :3000. |
| `docker` | Run the full stack (app + db) via docker compose. |
| `seed` | Demo seed (doctors + admin, password `Password123`). |
| `seed-baseline` | **Wipe** + load the richer baseline fixture (password `Test123!`). |
| `bootstrap-admin` | Create the production admin (prompts for email/password). |
| `test` | Run server + client test suites. |
| `predeploy` | Local deploy gate: build + test + lint (does **not** push). |
| `stop` | `docker compose down` (keep data). |
| `reset` | `docker compose down -v` (**delete** db + uploads volumes). |
