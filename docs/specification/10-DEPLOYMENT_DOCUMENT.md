# 10 — Deployment Document

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Document ID      | 10-DEPLOYMENT_DOCUMENT                                                                                  |
| Status           | Canonical                                                                                               |
| Version          | 1.0                                                                                                     |
| Last updated     | 2026-06-01                                                                                              |
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
- **app** — built from the project `Dockerfile`; depends on `db` health; exposes port `3000`.

The compose file injects a minimal set of env vars (see §4). Developers should copy `.env.example` to `.env` and supply real integration keys for any service under test. Cross-reference doc 15 for the full variable catalog.

### Staging

No dedicated staging environment is configured in v1. If one is added, it should mirror production env vars with `PAYFAST_MODE=sandbox` and separate integration keys.

### Production

Hosted on **Railway** in the **Mumbai or Singapore region** (closest to Karachi for KPI latency). Key differences from local dev:

| Concern          | Local dev               | Production                            |
| ---------------- | ----------------------- | ------------------------------------- |
| `NODE_ENV`       | `development`           | `production`                          |
| `APP_BASE_URL`   | `http://localhost:3000` | `https://<railway-domain>`            |
| `PAYFAST_MODE`   | `sandbox`               | `live`                                |
| `DATABASE_URL`   | compose service `db`    | Railway-injected managed Postgres     |
| `SESSION_SECRET` | placeholder value       | Strong random secret, per-environment |
| Integration keys | dev/sandbox keys        | Live production keys                  |

Full env-var reference: **doc 15 (15-CONFIGURATION_REFERENCE_DOCUMENT)**.

---

## 3. Pre-deployment checklist

Complete every item before triggering a production deploy.

- [ ] **Build the client** — run `npm run build:client` from the project root; verify `client/dist/` is populated.
- [ ] **Tests green** — run `npm test` (Vitest); all tests must pass before shipping.
- [ ] **Lint clean** — run `npm run lint`; resolve any reported errors.
- [ ] **Migrations ready** — verify `prisma/migrations/` contains all new migration files for this release.
- [ ] **Append the `uniq_active_slot` partial index** — Prisma's DSL cannot express partial (`WHERE`) indexes; the no-double-booking constraint must be hand-edited into the generated migration SQL. See doc 04 §5 and ARCHITECTURE.md §5 constraint #1. The SQL to append is:

  ```sql
  CREATE UNIQUE INDEX uniq_active_slot ON appointments (doctor_id, slot_start)
    WHERE state IN (
      'slot_locked', 'confirmed', 'in_progress', 'completed',
      'prescription_issued', 'cancelled_no_refund'
    );
  ```

  Confirm this index is present in the migration before deploying.

- [ ] **Prisma version pinned** — `package.json` must pin `prisma@6.x` and `@prisma/client@6.x` (Prisma 7 dropped in-schema `datasource.url`). Current pin is `6.19.3`. See doc 15 §CONFIG.md §7.
- [ ] **Environment variables set** — all required vars from doc 15 are configured in Railway's environment dashboard; no var is left empty for production.
- [ ] **Secrets rotated per environment** — `SESSION_SECRET`, `PAYFAST_*`, `DAILY_API_KEY`, `RESEND_API_KEY`, `ERROR_TRACKING_DSN`.
- [ ] **PayFast KYC complete** — merchant account must be fully verified before `PAYFAST_MODE=live` can process payments (ARCHITECTURE.md §12).
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

# 4. (Optional) seed development data
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

**After the image is deployed:**

5. In Railway's environment dashboard, set all required env vars (doc 15). `DATABASE_URL` is already injected by the Postgres plugin.

6. Run pending migrations:

   ```bash
   # Via Railway's shell or a one-off service command
   npx prisma migrate deploy
   ```

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

3. **Booking happy path** — as a patient, find a doctor, lock a slot, verify the PayFast sandbox checkout redirect fires, confirm the appointment appears in the dashboard.

4. **Webhook reachability** — verify the PayFast notify URL is publicly reachable:

   ```
   ${APP_BASE_URL}/api/webhooks/payfast
   ```

   This URL must be registered in the PayFast merchant dashboard as the IPN endpoint. Confirm Railway has not placed the service behind a domain that requires authentication.

5. **Worker liveness** — confirm the three in-process workers (reconciliation, notification, appointment-evaluation) started without error. Check application logs in Railway for `[worker:reconciliation]`, `[worker:notification]`, `[worker:appointmentEval]` startup messages (exact log labels match `server/src/workers/`).

6. **Admin alert feed (A3)** — navigate to the admin dashboard; confirm the alert feed is rendering and no unexpected errors are queued.

---

## 8. Monitoring & alerts

### Error tracking

An error-tracking integration is configured via the `ERROR_TRACKING_DSN` environment variable (doc 15). The DSN is optional in development and required in production. Unhandled exceptions and caught critical errors are forwarded to the configured error-tracking service.

### Admin alert feed (A3)

The in-app admin alert feed (view A-03) surfaces operational events that require human attention. Cross-reference **doc 08 §A09** for the security and compliance perspective. The categories surfaced are:

| Alert category              | Trigger                                                                   |
| --------------------------- | ------------------------------------------------------------------------- |
| Webhook mismatch            | PayFast IPN with invalid or missing signature                             |
| Refund exhaustion           | `refund.service` has exhausted all retry attempts (`REFUND_MAX_ATTEMPTS`) |
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
