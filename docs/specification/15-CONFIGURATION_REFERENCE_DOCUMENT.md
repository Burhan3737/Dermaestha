# 15 — Configuration Reference Document

| Document ID      | 15-CONFIGURATION_REFERENCE_DOCUMENT          |
| ---------------- | -------------------------------------------- |
| Status           | Canonical                                    |
| Version          | 1.7                                          |
| Last updated     | 2026-06-13                                   |
| Sources absorbed | `docs/engineering/CONFIG.md`; `.env.example` |
| Related docs     | 03, 04, 08, 10, 14                           |

---

## Index

1. [Purpose](#purpose)
2. [Timing Windows](#1-timing-windows)
3. [Rate Limits & Lockout](#2-rate-limits--lockout)
4. [Worker Cadence](#3-worker-cadence)
5. [Refund Retry & Backoff](#4-refund-retry--backoff)
6. [Auth & Crypto Parameters](#5-auth--crypto-parameters)
7. [Money & Locale](#6-money--locale)
8. [Migration Caveats](#7-migration-caveats)
9. [Environment Variable Contract](#8-environment-variable-contract)
10. [Revision Footer](#revision-footer)

---

## Purpose

This document is a single authoritative reference for every deploy-time constant, runtime-tunable default, and environment variable in Dermestha v1. It faithfully re-presents the values from `docs/engineering/CONFIG.md` and `.env.example` in a navigable structure — nothing is invented, altered, or omitted. Change any value by editing the source config and this document together, not by guessing in code.

---

## 1. Timing Windows

Two tiers govern constants: **(A) Settings-tunable at runtime** live in the `settings` table (A6), no redeploy required; **(B) Deploy-time constants** live in `.env.example` or `server/src/config/constants.js`.

| Constant                  | Value                                                       | Tier                        | Source                |
| ------------------------- | ----------------------------------------------------------- | --------------------------- | --------------------- |
| Slot-lock TTL             | **10 min**                                                  | B                           | PRD §4.3              |
| Min booking lead          | **60 min** (floor 30, ceiling 1440 min / 24h)               | A (`minBookingLeadMinutes`) | PRD §4.x, edge filter |
| Slot granularity          | **30 min**                                                  | B                           | D1                    |
| No-show grace             | slot-start **+15 min**                                      | B                           | PRD §4.3              |
| Video token window        | slot-start **−10 min** → slot-end **+5 min**                | B                           | §3.4                  |
| `in_progress` hard cutoff | slot-end **+5 min** (never later)                           | B                           | §3.4, §10             |
| Reminder offsets          | **24 h** and **1 h** before slot                            | B                           | P4                    |
| Missing-Rx alert          | `completed` + **12 h** → A3 alert (`awaiting_prescription`) | B                           | PRD §4.3              |
| Password-reset token      | **1 h**, single-use                                         | B                           | P2                    |

**Environment variable names** (mirror the constants above for deploy-time tier B):

| Variable               | Default |
| ---------------------- | ------- |
| `SLOT_LOCK_TTL_MIN`    | `10`    |
| `SLOT_GRANULARITY_MIN` | `30`    |
| `NO_SHOW_GRACE_MIN`    | `15`    |
| `VIDEO_TOKEN_PRE_MIN`  | `10`    |
| `VIDEO_TOKEN_POST_MIN` | `5`     |
| `RESET_TOKEN_TTL_MIN`  | `60`    |
| `SESSION_TTL_DAYS`     | `7`     |

---

## 2. Rate Limits & Lockout

Mandated by PRD §3.6. Library: `express-rate-limit` (memory store acceptable for single instance; see [§3 Worker Cadence](#3-worker-cadence) for single-instance note).

| Surface             | Limit                                       | On Breach                                                          |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Login (per account) | **5 failures / account / 15 min** → lockout | `429 ACCOUNT_LOCKED`; audit-logged; sustained → A3                 |
| Login (per IP)      | **20 / 15 min**                             | `429 RATE_LIMITED`                                                 |
| Sign-up             | **5 / IP / hour**                           | `429 RATE_LIMITED`                                                 |
| Forgot-password     | **5 / account / hour**                      | enumeration-safe `200`; counted silently                           |
| Payment-intent      | **10 / patient / hour**                     | `429 RATE_LIMITED` (protects PayFast quota, beyond #7 idempotency) |

**Lockout duration:** 15 min rolling. Threshold breaches → `audit_log` (`event_type=login_lockout`); sustained abuse surfaced to A3.

**Environment variable names:**

| Variable                              | Default |
| ------------------------------------- | ------- |
| `LOGIN_MAX_ATTEMPTS`                  | `5`     |
| `LOGIN_LOCKOUT_MIN`                   | `15`    |
| `SIGNUP_MAX_PER_IP_HOUR`              | `5`     |
| `FORGOT_MAX_PER_ACCOUNT_HOUR`         | `5`     |
| `PAYMENT_INTENT_MAX_PER_PATIENT_HOUR` | `10`    |

---

## 3. Worker Cadence

Workers use `node-cron`, running in-process. **Single-instance assumption (v1):** workers run in the one app process; **no leader election** (deliberate — "don't over-engineer"). If the app ever scales horizontally, gate workers behind a Postgres advisory lock or move them to scheduled tasks — this section is the one place that changes. Memory-backed rate-limit also assumes single instance.

| Worker                 | Schedule                       | Notes                                                                                                                                  |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Reconciliation         | **hourly** (`0 * * * *`)       | PayFast unconfirmed-payments query, last 24 h (edge #6/#6a)                                                                            |
| Notification           | **every minute** (`* * * * *`) | Dispatch due emails; **re-check appointment state immediately before send**; suppress reminders if no longer `confirmed`/`in_progress` |
| Refund-retry           | **every minute** (`* * * * *`) | Process due refund retries; exponential backoff (`REFUND_BACKOFF_BASE_SEC × 2^attempts`, max `REFUND_MAX_ATTEMPTS`; Slice E).          |
| Appointment-evaluation | **every minute** (`* * * * *`) | `confirmed→in_progress` at slot-start; resolve `completed`/no-show in grace window; never strand `in_progress` past slot-end+5 min. **Implemented** (`server/src/workers/`; `evaluateDueAppointments` in `server/src/modules/appointment/service.js`; ADR-25). |

---

## 4. Refund Retry & Backoff

Source: CONFIG.md §4 (Refund retry #10, edge #30).

- **Strategy:** exponential backoff, base **30 s**, factor **2**, **max 5 attempts** (≈ 30 s → 8 min).
- Each attempt reuses the per-appointment `refundIdempotencyKey` (one settlement guaranteed).
- **On exhaustion:** `refundStatus=failed` + **A3 admin alert**. No in-app manual retry; admin acts in the gateway dashboard.

**Environment variable names:**

| Variable                  | Default |
| ------------------------- | ------- |
| `REFUND_MAX_ATTEMPTS`     | `5`     |
| `REFUND_BACKOFF_BASE_SEC` | `30`    |

> `REFUND_MAX_ATTEMPTS` (5) and `REFUND_BACKOFF_BASE_SEC` (30) gained their first consumers in Slice E (the refund-retry worker).

---

## 5. Auth & Crypto Parameters

| Constant                | Value                                                                          | Source         |
| ----------------------- | ------------------------------------------------------------------------------ | -------------- |
| Password hash algorithm | **argon2id** (bcrypt acceptable)                                               | §7             |
| argon2 memoryCost       | **19456 KiB**                                                                  | OWASP baseline |
| argon2 timeCost         | **2**                                                                          | OWASP baseline |
| argon2 parallelism      | **1** (tune to host)                                                           | OWASP baseline |
| Session cookie flags    | **HttpOnly, Secure, SameSite=Lax**                                             | §3.6           |
| Session store           | `connect-pg-simple`, `createTableIfMissing: false` (Prisma owns `session` DDL) | §7             |
| Session TTL             | **7 days rolling**                                                             | —              |

**Environment variable:**

| Variable           | Default                                  |
| ------------------ | ---------------------------------------- |
| `SESSION_SECRET`   | _(must be set — rotate per environment)_ |
| `SESSION_TTL_DAYS` | `7`                                      |

---

## 6. Money & Locale

Source: CONFIG.md §6.

- **Currency:** PKR. Stored and transmitted as **integer paisa**. Display ÷ 100 with thousands separators.
- **Timezone:** Store UTC (`timestamptz`); render **Asia/Karachi** (no DST).
- **Fallback gateway-fee model** (when PayFast reports none, policy #5): `fallbackFeePctBps` (basis points, range **0–10000**) + `fallbackFeeFixed` (paisa, **≥0**), both in the `settings` table (A6 — runtime-tunable, no redeploy).

---

## 7. Migration Caveats

Source: CONFIG.md §7. Cross-reference: [doc 04 — Database Document](04-DATABASE_DOCUMENT.md).

1. **Pin `prisma@6.x`** (e.g. `prisma@6.19.x` + `@prisma/client@6.x`). Prisma 7 removed in-schema `datasource.url` in favour of `prisma.config.ts` + driver adapters — a heavier setup this v1 does not need. Validated clean on 6.19.3.

2. **No-double-booking is a hand-added partial index.** After `prisma migrate dev --name init`, edit the generated `migration.sql` and append the `uniq_active_slot` index from `prisma/schema.prisma`'s header. Prisma's DSL cannot express the `WHERE state IN (...)` clause; **do not skip this — it is invariant #1.**

3. **`dosage_forms` is a Postgres `text[]`.** Confirm the target host supports array columns (RDS/Aurora/Railway PG all do).

4. **Dual-Zod known inconsistency.** The root workspace resolves `zod@4.x` (used by `shared/schemas/`), while `server/` pins `zod@3.x`. `instanceof ZodError` is therefore unreliable across the workspace boundary, so `server/src/http/errorHandler/errorHandler.js` duck-types a ZodError (`err.name === 'ZodError' && Array.isArray(err.issues)`) as a workaround. Align to a single zod version before the next major milestone.

---

## 8. Environment Variable Contract

Source: `.env.example`. Copy to `.env` for local dev; set real values in Railway/host for production. See doc 10 (deployment) for host/runtime topology.

### Core

| Variable       | Purpose                                                 | Example / Default             |
| -------------- | ------------------------------------------------------- | ----------------------------- |
| `NODE_ENV`     | Runtime environment mode                                | `development` \| `production` |
| `PORT`         | HTTP server port                                        | `3000`                        |
| `APP_BASE_URL` | Public origin; used to build webhook notify/return URLs | `http://localhost:3000`       |

### Database

| Variable       | Purpose                               | Example / Default                                 |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string via Prisma | `postgresql://user:pass@localhost:5432/dermestha` |

> Pin `prisma@6.x` and `@prisma/client@6.x` (Prisma 7 dropped in-schema `datasource.url`). See [§7 Migration Caveats](#7-migration-caveats).

### Sessions / Auth

| Variable         | Purpose                        | Example / Default                        |
| ---------------- | ------------------------------ | ---------------------------------------- |
| `SESSION_SECRET` | Express-session signing secret | _(must be set — rotate per environment)_ |

### PayFast (Payment Adapter)

| Variable                | Purpose                             | Example / Default       |
| ----------------------- | ----------------------------------- | ----------------------- |
| `PAYFAST_MERCHANT_ID`   | PayFast Pakistan merchant ID        | _(set per environment)_ |
| `PAYFAST_SECURED_KEY`   | PayFast Pakistan secured key — auth for the real adapter's `GetAccessToken` step (doc 14 §2) | _(set per environment)_ |
| `PAYFAST_MERCHANT_NAME` | PayFast Pakistan merchant name — part of the signature payload `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)` | _(set per environment)_ |
| `PAYFAST_STORE_ID`      | PayFast Pakistan store / merchant identifier (provisioned at KYC) | _(set per environment)_ |
| `PAYFAST_PASSPHRASE`    | **Dev-mock-only** HMAC key for the `payfast.mock` gateway's signed IPN (ADR-22); falls back to a dev-only constant if unset. NOT used by the real PayFast Pakistan adapter. | _(dev only)_ |
| `PAYFAST_MODE`          | Real-adapter gateway mode — selects the sandbox `ipguat.apps.net.pk` vs live `ipg1.apps.net.pk` host | `sandbox` \| `live` (default `sandbox`) |

### Provider Selection (dev vs production)

Adapter selection switches (ADR-10/ADR-22). **Both default to the production-safe value**: the real-but-not-yet-wired throwing stubs. The dev simulators are opt-in only; production must leave these at their defaults so the dev mock gateway and the `/dev/*` checkout routes are never mounted (see doc 08 secret-handling and doc 10 deploy note).

| Variable           | Purpose                                                                                          | Example / Default          |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------- |
| `PAYMENT_PROVIDER` | Selects the `PaymentProvider`: `stub` (throwing placeholder, default), `mock` (dev simulated gateway, mounts `/dev/checkout`), or `payfast` (the real PayFast **Pakistan** adapter — researched-not-vendor-confirmed, doc 14 §2; do not enable for live until the doc 07 §3 merchant-verification checklist passes) | `stub` \| `mock` \| `payfast` |
| `EMAIL_PROVIDER`   | Selects the `EmailProvider`: `stub` \| `console` \| `resend`. Boot-time selection: `EMAIL_PROVIDER=console` forces the console logger; else a present `RESEND_API_KEY` selects the real Resend adapter; else fallback to console with a loud warning. | `stub` |
| `VIDEO_PROVIDER`   | Selects the `VideoProvider`: `stub` (prod, throws until concrete adapter wired), `mock` (dev — real webhook path + `/dev/video/*` + `/dev/worker/*` simulator), or `daily` (resolves to stub until the concrete `daily.js` adapter is wired). Mock and `/dev/*` routes **must never be active in production** (ADR-24; doc 08; doc 10). | `stub` |
| `VIDEO_MOCK_SECRET` | Dev-only mock meeting-token signing key (HMAC). Optional; for use only when `VIDEO_PROVIDER=mock`. Never set in production. | _(optional, dev-only)_ |

### Daily.co (Video Adapter)

| Variable        | Purpose              | Example / Default       |
| --------------- | -------------------- | ----------------------- |
| `DAILY_API_KEY` | Daily.co API key     | _(set per environment)_ |
| `DAILY_DOMAIN`  | Daily.co team domain | `your-team.daily.co`    |

### Resend (Email Adapter)

| Variable         | Purpose                 | Example / Default            |
| ---------------- | ----------------------- | ---------------------------- |
| `RESEND_API_KEY` | Resend API key          | _(set per environment)_      |
| `RESEND_FROM`    | Optional. From address for the real Resend adapter. Without it the adapter sends from `onboarding@resend.dev` (Resend's shared default). Note: key-only sends reach only the Resend account owner's inbox — patient inboxes require a verified domain + this variable set. | `onboarding@resend.dev` |

### Error Tracking

| Variable             | Purpose                          | Example / Default   |
| -------------------- | -------------------------------- | ------------------- |
| `ERROR_TRACKING_DSN` | Error-tracking DSN (e.g. Sentry) | _(optional in dev)_ |

### File Storage

| Variable      | Purpose                                                                                      | Example / Default |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `UPLOADS_DIR` | Directory for doctor profile photos; served statically at `/uploads`. In Docker this path is the `dermestha_uploads` volume (must be persistent storage in production, else photos are lost on redeploy — doc 10 §3). | `./uploads`       |

### Tunable Defaults

All **three** `settings` tunables are editable at runtime via `PUT /api/admin/settings` (A6) without a redeploy: `minBookingLeadMinutes` (30–1440), `fallbackFeePctBps` (0–10000), and `fallbackFeeFixed` (≥0 paisa).

| Variable               | Purpose                                              | Default |
| ---------------------- | ---------------------------------------------------- | ------- |
| `SLOT_LOCK_TTL_MIN`    | Slot-lock TTL in minutes                             | `10`    |
| `SLOT_GRANULARITY_MIN` | Slot granularity in minutes                          | `30`    |
| `NO_SHOW_GRACE_MIN`    | No-show grace period in minutes after slot-start     | `15`    |
| `VIDEO_TOKEN_PRE_MIN`  | Minutes before slot-start to open video token window | `10`    |
| `VIDEO_TOKEN_POST_MIN` | Minutes after slot-end to close video token window   | `5`     |
| `RESET_TOKEN_TTL_MIN`  | Password-reset token TTL in minutes                  | `60`    |
| `SESSION_TTL_DAYS`     | Session TTL in days (rolling)                        | `7`     |

### Rate Limits / Lockout (§3.6)

| Variable                              | Purpose                                           | Default |
| ------------------------------------- | ------------------------------------------------- | ------- |
| `LOGIN_MAX_ATTEMPTS`                  | Failed login attempts before account lockout      | `5`     |
| `LOGIN_LOCKOUT_MIN`                   | Lockout duration in minutes (rolling)             | `15`    |
| `SIGNUP_MAX_PER_IP_HOUR`              | Max sign-up attempts per IP per hour              | `5`     |
| `FORGOT_MAX_PER_ACCOUNT_HOUR`         | Max forgot-password requests per account per hour | `5`     |
| `PAYMENT_INTENT_MAX_PER_PATIENT_HOUR` | Max payment-intent requests per patient per hour  | `10`    |

### Refund Retry (#10)

| Variable                  | Purpose                             | Default |
| ------------------------- | ----------------------------------- | ------- |
| `REFUND_MAX_ATTEMPTS`     | Maximum refund retry attempts       | `5`     |
| `REFUND_BACKOFF_BASE_SEC` | Exponential backoff base in seconds | `30`    |

### Email Dispatch

| Variable                 | Purpose                                                                                                                    | Default |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| `EMAIL_MAX_ATTEMPTS`     | Max email dispatch attempts before a job is marked failed and an `email.send_failed_final` audit alert is written (F07.03) | `3`     |
| `EMAIL_BACKOFF_BASE_SEC` | Base seconds for email dispatch exponential backoff (`base × 2^attempts`)                                                  | `60`    |

### Reconciliation Worker

| Variable                     | Purpose                                                                                             | Default |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| `RECONCILIATION_LOOKBACK_H`  | Hours of history the reconciliation worker scans for pending payments (F04.03)                      | `24`    |
| `RECONCILIATION_MIN_AGE_MIN` | Minimum payment age in minutes before reconciliation acts (avoids racing a webhook still in flight) | `60`    |

---

## Revision Footer

| Date       | Change           | Why                                                  |
| ---------- | ---------------- | ---------------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of CONFIG.md + .env.example |
| 2026-06-04 | Added `PAYMENT_PROVIDER` + `EMAIL_PROVIDER` provider-selection switches; noted `PAYFAST_PASSPHRASE` dual use as the dev mock-IPN signing key | Slice C dev payment/email simulation (ADR-22) |
| 2026-06-05 | Added `VIDEO_PROVIDER` + `VIDEO_MOCK_SECRET` provider-selection switches (§8); noted appointment-evaluation worker as Implemented (§3) | Slice D (F05 video & lifecycle) |
| 2026-06-11 | Re-pointed the evaluation-worker logic ref to `modules/appointment/service.js` (merged) | Folder-structure restructure (ADR-26); `config/constants.js` ref unchanged (stayed flat) |
| 2026-06-11 | Dropped deprecated `CONFIG.md`/`ARCHITECTURE.md §14.5` live pointers (this doc is the config canon; deployment topology -> doc 10) | Deprecated-doc hygiene |
| 2026-06-11 | Added `EMAIL_MAX_ATTEMPTS`, `EMAIL_BACKOFF_BASE_SEC`, `RECONCILIATION_LOOKBACK_H`, `RECONCILIATION_MIN_AGE_MIN`; updated `EMAIL_PROVIDER` enum to `stub \| console \| resend`; updated `RESEND_FROM` semantics; added Refund-retry worker cadence (§3); noted Slice E first consumers of refund retry constants (§4) | Slice E (worker constants, Resend fallback, worker cadences); new tunable/config |
| 2026-06-13 | Added `UPLOADS_DIR` File-Storage env var (§8); added `minBookingLeadMinutes` ceiling 1440 + `fallbackFeePctBps`/`fallbackFeeFixed` bounds (§1, §6); expanded Tunable-Defaults note to all three settings tunables (§8); added Dual-Zod known-inconsistency migration caveat (§7) | Slice G as-built sweep |
| 2026-06-13 | PayFast env section (§8): added `PAYFAST_SECURED_KEY`, `PAYFAST_MERCHANT_NAME`, `PAYFAST_STORE_ID`; redefined `PAYFAST_PASSPHRASE` as dev-mock-only; removed `PAYFAST_MERCHANT_KEY` (South-Africa-only, dropped); noted `PAYFAST_MODE` default `sandbox`; changed `PAYMENT_PROVIDER` enum to `stub\|mock\|payfast` | Slice H · S1 (PayFast Pakistan adapter; ADR-32) |
