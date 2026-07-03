# 10 — Deployment Document

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Document ID      | 10-DEPLOYMENT_DOCUMENT                                                                                  |
| Status           | Canonical                                                                                               |
| Version          | 1.9                                                                                                     |
| Last updated     | 2026-07-04                                                                                              |
| Sources absorbed | `docs/engineering/ARCHITECTURE.md §13, §14; Dockerfile; docker-compose.yml; .env.example; package.json` |
| Related docs     | 03, 08, 15                                                                                              |

---

## Index

1. [Deployment overview](#1-deployment-overview)
2. [Environments](#2-environments)
3. [Pre-deployment checklist](#3-pre-deployment-checklist)
4. [Deployment steps](#4-deployment-steps)
5. [CI/CD pipeline](#5-cicd-pipeline)
6. [Rollback plan](#6-rollback-plan)
7. [Post-deployment validation](#7-post-deployment-validation)
8. [Monitoring & alerts](#8-monitoring--alerts)
9. [Access control (who deploys)](#9-access-control-who-deploys)
10. [Versioning & releases](#10-versioning--releases)

---

## Purpose

This document describes how Dermestha v1 is built, configured, and deployed. It covers the single containerised image, the Railway hosting platform, local development via Docker Compose, and every manual step an operator must execute for a first or subsequent production deploy. It is the operational companion to doc 03 (architecture) and cross-references doc 15 (config reference) for the full environment-variable contract.

---

## 1. Deployment overview

Dermestha v1 ships as a **single Docker image** that runs on **Railway** as one app service, backed by Railway's managed Postgres plugin. There is no separate frontend service, CDN, or load balancer — Express serves the built React SPA at the same origin as the API (`express.static` + SPA catch-all), which is why no CORS configuration is needed (see doc 03 §1).

The deployment posture is deliberately minimal (see ARCHITECTURE.md §15 "What NOT to Over-Engineer"):

- **Single service** — app + workers run in one process; no message broker or separate worker process.
- **No redundancy** — one container instance; scale-out and multi-region are deferred to the AWS migration path (ARCHITECTURE.md §13).
- **12-factor configuration** — all secrets and environment-specific values are injected as environment variables; the image itself contains no secrets.

The same image is portable to AWS ECS Fargate / App Runner / Elastic Beanstalk without code changes (ARCHITECTURE.md §13); a `DATABASE_URL` swap moves the database to RDS/Aurora.

---

## 2. Environments

### Local development

Defined in `docker-compose.yml`. Two services:

- **db** — `postgres:16` with a named volume `dermestha_pg`; healthcheck on `pg_isready`.
- **app** — built from the project `Dockerfile`; depends on `db` health; exposes port `3000`. Mounts a named volume `dermestha_uploads:/app/uploads` (a third volume alongside `dermestha_pg`) so doctor profile photos survive container rebuilds.

The compose file injects a minimal set of env vars (see §4). Developers should copy `.env.example` to `.env` and supply real integration keys for any service under test. Cross-reference doc 15 for the full variable catalog.

### Staging

No dedicated staging environment is configured in v1. If one is added, it should mirror production env vars with separate integration keys.

### Production

Hosted on **Railway** in the **Mumbai or Singapore region** (closest to Karachi for KPI latency). Key differences from local dev:

| Concern          | Local dev               | Production                            |
| ---------------- | ----------------------- | ------------------------------------- |
| `NODE_ENV`       | `development`           | `production`                          |
| `APP_BASE_URL`   | `http://localhost:3000` | `https://<railway-domain>`            |
| `DATABASE_URL`   | compose service `db`    | Railway-injected managed Postgres     |
| `SESSION_SECRET` | placeholder value       | Strong random secret, per-environment |
| Integration keys | dev/sandbox keys        | Live production keys                  |

Full env-var reference: **doc 15 (15-CONFIGURATION_REFERENCE_DOCUMENT)**.

**Free-tier alternative (non-canonical).** The same Docker image also runs on a free stack for demos/evaluation — a Render web service (app) plus a Neon managed Postgres (`DATABASE_URL`), with Daily.co and email on their own free tiers. Portable by construction (doc 03 §6), it needs no code change. Per-scenario operator commands and the free-tier caveats live in the `deployment/README.md` runbook. Railway remains the canonical production target.

---

## 3. Pre-deployment checklist

Complete every item before triggering a production deploy.

- [ ] **Build the client** — run `npm run build:client` from the project root; verify `client/dist/` is populated.
- [ ] **Tests green** — run `npm test` (Vitest); all tests must pass before shipping.
- [ ] **Lint clean** — run `npm run lint`; resolve any reported errors.
- [ ] **Migrations ready** — verify `prisma/migrations/` contains all new migration files for this release.
- [ ] **Append the `uniq_active_slot` partial index** — Prisma's DSL cannot express partial (`WHERE`) indexes; the no-double-booking constraint must be hand-edited into the generated migration SQL. See doc 04 §4b (no-double-booking partial index, invariant #1). The SQL to append is:

  ```sql
  CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
    WHERE state IN ('pending', 'confirmed');
  ```

  Confirm this index is present in the migration before deploying.

- [ ] **Prisma version pinned** — `package.json` must pin `prisma@6.x` and `@prisma/client@6.x` (Prisma 7 dropped in-schema `datasource.url`). Current pin is `6.19.3`. See doc 15 §7 (Migration Caveats).
- [ ] **Environment variables set** — all required vars from doc 15 are configured in Railway's environment dashboard; no var is left empty for production.
- [ ] **Secrets rotated per environment** — `SESSION_SECRET`, `DAILY_API_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`.
- [ ] **Bank-transfer settings populated** — the admin `settings` row carries the live `bankName` / `bankAccountName` / `bankAccountNumber` / `bankInstructions` shown to patients on a pending booking; verify they are set before taking real bookings (payment is offline, admin-verified — ADR-43).
- [ ] **Real email configured** — production delivery requires `RESEND_API_KEY` set **and** `EMAIL_PROVIDER` not `console`. `pickProvider()` (`server/src/integrations/email/index.js`) only special-cases `console`; any other value — including `stub` or unset — falls back to the console logger **when `RESEND_API_KEY` is absent**, so a missing key means no real emails are sent despite a non-`console` provider (doc 08; doc 15).
- [ ] **Dev video switch OFF** — `VIDEO_PROVIDER` is unset or `stub` (NOT `mock`) so the dev mock video provider is never used in production. (The only dev route, `POST /dev/worker/notifications`, is mounted solely when `NODE_ENV=development`.) (ADR-24; doc 08; doc 15.)
- [ ] **Uploads directory configured** — `UPLOADS_DIR` is set (default `./uploads`) and the path is writable and backed by persistent storage (a Railway volume), otherwise doctor profile photos are lost on every redeploy. See doc 15 §8 (File Storage).
- [ ] **Settings singleton — automatic.** The `settings` row (`id = 1`) is bootstrapped **automatically at server boot** by `ensureSettings()` (`server/src/index.js`), which idempotently upserts `id = 1` (schema defaults fill the row). No manual `INSERT`, seed step, or first-deploy action is required; `GET`/`PUT /api/admin/settings` work on a fresh DB. (Slice H · S6, resolving the prior known gap.)
- [ ] **First deploy only: admin bootstrap** — run `npm run bootstrap:admin` after the initial deploy (see §9 and §4 step 8).

---

## 4. Deployment steps

### 4.1 Local development (Docker Compose)

```bash
# 1. Copy and populate the env file
cp .env.example .env
# edit .env with real integration keys for the services under test

# 2. Start local services (Postgres + app)
docker compose up --build

# 3. Apply migrations (first time or after schema changes)
npx prisma migrate dev

# 4. Seed data — creates the dev admin (admin login fails without it).
#    The Settings singleton (id=1) is bootstrapped automatically at boot by
#    ensureSettings(), so settings endpoints work even before seeding.
npm run db:seed
```

The app is available at `http://localhost:3000`.

### 4.2 Production deploy (Railway)

**One-time Railway project setup:**

1. Create a new Railway project.
2. Add the **Postgres plugin** — Railway automatically injects `DATABASE_URL` into the app service.
3. Set the **region** to Mumbai (`ap-south-1`) or Singapore, whichever is available.
4. Link the repository; Railway will detect the `Dockerfile` at the project root.

**Per-deploy steps:**

```bash
# 1. Ensure client build is current and tests pass locally
npm run build:client
npm test

# 2. Push to the deployment branch (Railway watches the branch configured in the project)
git push origin main
# Railway triggers a build using the Dockerfile automatically on push.
```

**What Railway does during build** (from the `Dockerfile`):

```dockerfile
# Stage 1 — client-build (node:22-slim)
#   Installs all workspace dependencies, then:
npm run build:client          # produces client/dist/

# Stage 2 — runtime (node:22-slim)
#   Installs production dependencies, generates Prisma client, copies server + shared + client/dist
#   Sets NODE_ENV=production, EXPOSE 3000
#   CMD: node server/src/index.js
```

> **Node version floor:** the client dependency `@daily-co/daily-js@0.91.0` (video UI, ADR-34) requires **Node ≥22.14.0**. The `node:22-slim` tag tracks the latest 22.x and currently satisfies this, but the version must not be pinned below 22.14.0 in CI or the Dockerfile (doc 07 open-q 11).

**After the image is deployed:**

5. In Railway's environment dashboard, set all required env vars (doc 15). `DATABASE_URL` is already injected by the Postgres plugin.

6. Run pending migrations:

   ```bash
   # Via Railway's shell or a one-off service command
   npx prisma migrate deploy
   ```

   > **First-boot ordering — migrate before the app boots.** The app queries the DB at startup: `ensureSettings()` upserts `settings(id=1)` *before* `listen()` (`server/src/index.js`), so against an un-migrated database the process crashes before it can serve. Railway's one-off command runs in a separate instance of the image, independent of the (crash-looping) main service, so running `migrate deploy` this way recovers it. On a host with no independent release/one-off phase (e.g. Render free, whose shell needs a live instance), run `prisma migrate deploy` against the managed database from an operator machine **before the first deploy**. This affects only a fresh/empty DB — the schema then persists across redeploys.

7. Verify the `uniq_active_slot` partial index is present (see checklist §3).

8. **First deploy only — admin bootstrap:**

   ```bash
   npm run bootstrap:admin
   # Runs: node prisma/scripts/bootstrap-admin.js
   # Creates the initial admin account. Rotate the password immediately after.
   ```

---

## 5. CI/CD pipeline

No CI/CD pipeline is configured in v1. No `.github/workflows/` directory or `Jenkinsfile` exists in the repository. Deploys are triggered manually by pushing to the branch Railway monitors. The pre-deployment checklist in §3 serves as the manual quality gate.

Adding an automated pipeline (e.g. a GitHub Actions workflow that runs `npm test` and `npm run lint` on pull requests) is recommended before M4 launch but is not implemented in v1.

---

## 6. Rollback plan

### Image/commit rollback

Railway retains previous deployments. To roll back:

1. Open the Railway project dashboard.
2. Navigate to the deployment history.
3. Redeploy the previous successful deployment.

This is the primary rollback mechanism and takes effect within the Railway build/restart cycle (no new Docker build required).

### Migration caveat

**Database migrations are forward-only.** Prisma's `migrate deploy` does not provide automatic down-migrations.

- If a migration introduced the `uniq_active_slot` partial index and the rollback target pre-dates it, the index must be dropped manually with `DROP INDEX uniq_active_slot;` before the schema is consistent with the rolled-back code.
- Additive schema changes (new columns with defaults, new tables) are generally safe to leave in place when rolling back application code, provided the older code ignores unknown columns.
- Destructive schema changes (column removal, type changes) make rollback complex and should be avoided in a single migration; prefer expand-contract.

### Uploaded photos across rollbacks

Doctor profile photos in the `dermestha_uploads` volume persist across rollbacks. Rolling back to a build that does not serve `/uploads` leaves the photo files on disk but HTTP-inaccessible; there is no automated cleanup of orphaned photo files.

### What is reversible

- Application code changes — fully reversible by redeploying a prior image.
- Additive schema changes — tolerated by prior code.

### What is not reversible without manual intervention

- Destructive schema migrations (must be reversed by a new forward migration or manual SQL).
- The `uniq_active_slot` partial index (hand-edited; must be managed manually if rolled back past the migration that added it).

---

## 7. Post-deployment validation

Run these checks after every production deploy (or after a Railway redeploy).

1. **Health endpoint** — confirm the server is accepting requests:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://<railway-domain>/api/health
   # Expect: 200
   ```

2. **Login smoke test** — log in with the admin account; confirm role-based routing lands on the admin dashboard.

3. **Booking happy path** — as a patient, find a doctor, book a slot (appointment goes to `pending`), verify the bank-transfer instructions appear, submit a transfer reference via `POST /api/appointments/:id/pay`, then as an admin accept the booking and confirm it shows as `confirmed` on the dashboard.

4. **Worker liveness** — confirm the single in-process worker started without error. Check application logs in Railway for the `workers started: notification-dispatch (* * * * *)` startup message (exact label matches `server/src/workers/index.js`).

5. **Admin alert feed (A3)** — navigate to the admin dashboard; confirm the alert feed is rendering and no unexpected errors are queued.

---

## 8. Monitoring & alerts

### Error tracking

Error tracking is **Sentry** (`@sentry/node`), configured via the `SENTRY_DSN` environment variable (doc 15). The DSN is optional in development (with no DSN the integration is a logging no-op) and required in production. It is initialized once at boot (`initErrorTracking()`); unhandled exceptions and caught critical errors are forwarded to Sentry with `sendDefaultPii: false` and a `beforeSend` PII scrub (request body, cookies, auth headers, user identity removed — doc 08 §A05; ADR-36).

### Admin alert feed (A3)

The in-app admin alert feed (view A-03) surfaces operational events that require human attention. Cross-reference **doc 08 §A09** for the security and compliance perspective. The categories surfaced are:

| Alert category              | Trigger                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| Email failure               | Notification worker has exhausted retries for an email trigger            |
| Awaiting prescription > 12h | Appointment completed but no prescription submitted after 12 hours        |
| Sustained login abuse       | Failed-login rate exceeds lockout threshold (§3.6 / doc 08)               |
| Unhandled exceptions        | Caught by the global error handler and forwarded to the feed              |

### Logging

The Express application logs to stdout (captured by Railway). Workers log their schedule ticks and any errors. No log aggregation service is configured in v1; Railway's built-in log viewer is the primary log access point.

---

## 9. Access control (who deploys)

| Environment | Who can deploy                      | Mechanism                                               |
| ----------- | ----------------------------------- | ------------------------------------------------------- |
| Local dev   | Any developer                       | `docker compose up --build`                             |
| Production  | Project owner / designated operator | Push to the Railway-monitored branch; Railway dashboard |

**Admin bootstrap (DA4, one-time, first production deploy only):**

The `prisma/scripts/bootstrap-admin.js` script creates the initial admin account. It is run once via:

```bash
npm run bootstrap:admin
```

This script is the only path to creating an admin account; there is no admin self-signup and no admin-creates-admin UI. After the script completes, the bootstrap password must be **rotated immediately** by logging into the admin dashboard and changing it. The DA4 procedure and bootstrap credentials are documented in the deploy runbook (operator-maintained, not committed).

---

## 10. Versioning & releases

Dermestha v1 follows the milestone-based release plan defined in PRD §5.1:

| Milestone | Scope                                                           |
| --------- | --------------------------------------------------------------- |
| M1        | Core booking — auth, doctor management, availability, slot-lock |
| M2        | Payments, state machine, video, refunds, cancellations, workers |
| M3        | Prescriptions, medicine catalogue                               |
| M4        | Admin tools, notifications, analytics, legal content, launch    |

A formal version scheme and Git tagging convention have not been established. At this stage, releases correspond to milestone completions; tagging is TBD-by-convention (e.g. `v1-M1`, `v1-M2`) and should be agreed before M4 launch. There is no automated release pipeline or changelog generation in v1.

---

## Revision footer

| Date       | Change           | Why                                                                                   |
| ---------- | ---------------- | ------------------------------------------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of ARCH §13/§14 + Dockerfile + docker-compose + package.json |
| 2026-06-04 | Added pre-deploy check: dev provider switches OFF in prod (no mock gateway / `/dev` routes) | Slice C dev payment simulation (ADR-22) |
| 2026-06-05 | Added pre-deploy check: `VIDEO_PROVIDER` must not be `mock` in production (§3) | Slice D (F05 video & lifecycle) |
| 2026-06-11 | Re-pointed the refund-exhaustion alert ref to `modules/appointment/service.js`; fixed two deprecated/broken deploy-checklist pointers (`ARCHITECTURE.md §5` -> doc 04 §4b; malformed `doc 15 §CONFIG.md §7` -> doc 15 §7) | Restructure (ADR-26) + deprecated-doc hygiene |
| 2026-06-13 | Added `dermestha_uploads` app-service volume (§2); added pre-deploy checks for `UPLOADS_DIR` persistence + Settings-singleton (id=1) known gap (§3); made `db:seed` required not optional (§4.1); added uploaded-photo rollback note (§6) | Slice G as-built sweep |
| 2026-06-14 | Added a Node-version-floor note under the Dockerfile build steps: `@daily-co/daily-js@0.91.0` (video UI) requires Node ≥22.14.0; `node:22-slim` satisfies it but must not be pinned below that (doc 07 open-q 11) | Slice H · S3 (video consultation UI; ADR-34) |
| 2026-06-14 | Settings singleton (id=1) is now bootstrapped automatically at boot via `ensureSettings()` — replaced the manual-insert first-deploy checklist item + adjusted the local-dev seed note (§3, §4.1); renamed `ERROR_TRACKING_DSN` → `SENTRY_DSN` (secrets checklist §3 + error-tracking paragraph §8, now naming Sentry + PII scrub; ADR-36) | Slice H · S6 (launch foundation + hardening) |
| 2026-06-28 | Removed all PayFast/payment-gateway and refund deploy facts: dropped the `PAYFAST_MODE` env row + staging note (§2), the `PAYFAST_*` secret + PayFast-KYC checklist items + `PAYMENT_PROVIDER`/`/dev/checkout` switch (§3), the PayFast webhook-reachability check (§7), and the Webhook-mismatch + Refund-exhaustion alert rows (§8); booking-validation + worker-liveness now reflect the manual book→pending→reference→admin-accept flow and the single `notification-dispatch` worker; added a bank-transfer-settings checklist item; corrected the `uniq_active_slot` hand-append SQL to the as-built `WHERE state IN ('pending', 'confirmed')` (ADR-43) | Manual-payment pivot — as-built sync |
| 2026-07-04 | §2 added a non-canonical free-tier host alternative (Render app + Neon Postgres) pointing to the `deployment/README.md` runbook; §3 reworded the email pre-deploy check to the accurate condition (`RESEND_API_KEY` set + `EMAIL_PROVIDER` ≠ `console`; unset/`stub` without a key silently falls back to the console logger); §4.2 added a first-boot ordering caveat (`ensureSettings()` queries the DB before `listen()` → migrate before first boot on hosts without an independent release/one-off phase) | Free-tier deployment runbook — doc-10 alignment |
