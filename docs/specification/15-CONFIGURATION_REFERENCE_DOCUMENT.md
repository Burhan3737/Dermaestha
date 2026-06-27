# 15 — Configuration Reference Document

| Document ID      | 15-CONFIGURATION_REFERENCE_DOCUMENT          |
| ---------------- | -------------------------------------------- |
| Status           | Canonical                                    |
| Version          | 1.11                                         |
| Last updated     | 2026-06-28                                   |
| Sources absorbed | `docs/engineering/CONFIG.md`; `.env.example` |
| Related docs     | 03, 04, 08, 10, 14                           |

---

## Index

1. [Purpose](#purpose)
2. [Timing Windows](#1-timing-windows)
3. [Rate Limits & Lockout](#2-rate-limits--lockout)
4. [Worker Cadence](#3-worker-cadence)
5. [Refund Retry & Backoff — removed (ADR-43)](#4-refund-retry--backoff--removed-adr-43)
6. [Auth & Crypto Parameters](#5-auth--crypto-parameters)
7. [Money & Locale](#6-money--locale)
8. [Migration Caveats](#7-migration-caveats)
9. [Environment Variable Contract](#8-environment-variable-contract)
10. [Build & Test Scripts](#9-build--test-scripts)
11. [Revision Footer](#revision-footer)

---

## Purpose

This document is a single authoritative reference for every deploy-time constant, runtime-tunable default, and environment variable in Dermestha v1. It faithfully re-presents the values from `docs/engineering/CONFIG.md` and `.env.example` in a navigable structure — nothing is invented, altered, or omitted. Change any value by editing the source config and this document together, not by guessing in code.

---

## 1. Timing Windows

Two tiers govern constants: **(A) Settings-tunable at runtime** live in the `settings` table (A6), no redeploy required; **(B) Deploy-time constants** live in `.env.example` or `server/src/config/constants.js`.

| Constant                  | Value                                                       | Tier                        | Source                |
| ------------------------- | ----------------------------------------------------------- | --------------------------- | --------------------- |
| Min booking lead          | **60 min** (floor 30, ceiling 1440 min / 24h)               | A (`minBookingLeadMinutes`) | PRD §4.x, edge filter |
| Slot granularity          | **30 min**                                                  | B                           | D1                    |
| Video token window        | slot-start **−10 min** → slot-end **+5 min**                | B                           | §3.4                  |
| Reminder offsets          | **24 h** and **1 h** before slot                            | B                           | P4                    |
| Missing-Rx alert          | `confirmed` + **12 h** past `slotEnd` → A3 alert (`awaiting_prescription`) | B           | ADR-43                |
| Password-reset token      | **1 h**, single-use                                         | B                           | P2                    |

> A `pending` appointment has **no auto-expiry** (manual-payment pivot, ADR-43): the booking lock holds until a human cancels/rejects — the former 10-minute slot-lock TTL and the 15-minute no-show grace are removed.

**Environment variable names** (mirror the constants above for deploy-time tier B):

| Variable               | Default |
| ---------------------- | ------- |
| `SLOT_GRANULARITY_MIN` | `30`    |
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
| Pay (submit reference) | **10 / patient / hour**                  | `429 RATE_LIMITED` — limits `POST /api/appointments/:id/pay` (bank-reference submit, ADR-43) |

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

**One worker only (manual-payment pivot, ADR-43):** the reconciliation, refund-retry, and appointment-evaluation/completion workers were removed with the gateway, refund, and no-show subsystems. The lone cron job is `notification-dispatch`.

| Worker       | Schedule                       | Notes                                                                                                                |
| ------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Notification | **every minute** (`* * * * *`) | Dispatch due emails; **re-check appointment state immediately before send**; suppress reminders if no longer `confirmed`. `server/src/workers/index.js` → `dispatchDueNotifications` |

---

## 4. Refund Retry & Backoff — removed (ADR-43)

The refund subsystem was removed in the manual-payment pivot. There are no refunds (cancelling forfeits; money movement is handled offline by the admin), so the `REFUND_MAX_ATTEMPTS` / `REFUND_BACKOFF_BASE_SEC` constants and the refund-retry worker no longer exist.

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
- **No gateway-fee / fallback-fee model** (ADR-43): payment is offline and there are no refunds, so the former `fallbackFeePctBps` / `fallbackFeeFixed` settings were dropped. The `settings` table instead holds the bank-transfer details shown to the patient (`bankName`, `bankAccountName`, `bankAccountNumber`, `bankInstructions`; A6 — runtime-tunable, no redeploy).

---

## 7. Migration Caveats

Source: CONFIG.md §7. Cross-reference: [doc 04 — Database Document](04-DATABASE_DOCUMENT.md).

1. **Pin `prisma@6.x`** (e.g. `prisma@6.19.x` + `@prisma/client@6.x`). Prisma 7 removed in-schema `datasource.url` in favour of `prisma.config.ts` + driver adapters — a heavier setup this v1 does not need. Validated clean on 6.19.3.

2. **No-double-booking is a hand-added partial index.** After `prisma migrate dev --name init`, edit the generated `migration.sql` and append the `uniq_active_slot` index from `prisma/schema.prisma`'s header. Prisma's DSL cannot express the `WHERE state IN (...)` clause; **do not skip this — it is invariant #1.**

3. **`dosage_forms` is a Postgres `text[]`.** Confirm the target host supports array columns (RDS/Aurora/Railway PG all do).

4. **Single-zod alignment (resolved, Slice H · S6).** The repo now resolves a single `zod@3` copy: `shared/` is a workspace declaring `zod ^3.23.0` and the root `package.json` adds `overrides.zod ^3.23.0` to collapse the only `zod@4` (a transitive dep via `eslint-plugin-react-hooks → zod-validation-error`). `instanceof ZodError` is reliable across the workspace boundary, so the prior `errorHandler` duck-typing was removed in favor of a plain `instanceof` check (ADR-37; doc 07 §2.3). The override is a global constraint — a future dependency requiring `zod@4` would be forced to v3.

---

## 8. Environment Variable Contract

Source: `.env.example`. Copy to `.env` for local dev; set real values in Railway/host for production. See doc 10 (deployment) for host/runtime topology.

### Core

| Variable       | Purpose                                                 | Example / Default             |
| -------------- | ------------------------------------------------------- | ----------------------------- |
| `NODE_ENV`     | Runtime environment mode                                | `development` \| `production` |
| `PORT`         | HTTP server port                                        | `3000`                        |
| `APP_BASE_URL` | Public origin; used to build links in emails (e.g. dashboard / prescription URLs) | `http://localhost:3000`       |

### Database

| Variable       | Purpose                               | Example / Default                                 |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string via Prisma | `postgresql://user:pass@localhost:5432/dermestha` |

> Pin `prisma@6.x` and `@prisma/client@6.x` (Prisma 7 dropped in-schema `datasource.url`). See [§7 Migration Caveats](#7-migration-caveats).

### Sessions / Auth

| Variable         | Purpose                        | Example / Default                        |
| ---------------- | ------------------------------ | ---------------------------------------- |
| `SESSION_SECRET` | Express-session signing secret | _(must be set — rotate per environment)_ |

### Payment (offline — no gateway)

Payment is offline bank transfer verified manually by the admin (ADR-43). **There is no payment gateway and no `PAYFAST_*` / `PAYMENT_PROVIDER` configuration.** Bank-transfer details shown to the patient are runtime-editable admin Settings (`bankName`, `bankAccountName`, `bankAccountNumber`, `bankInstructions`; A6), not env vars.

### Provider Selection (dev vs production)

Adapter selection switches (ADR-10). **Both default to the production-safe value.** The dev simulators are opt-in only; production must leave these at their defaults.

| Variable           | Purpose                                                                                          | Example / Default          |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------- |
| `EMAIL_PROVIDER`   | Selects the `EmailProvider`: `stub` \| `console` \| `resend`. Boot-time selection: `EMAIL_PROVIDER=console` forces the console logger; else a present `RESEND_API_KEY` selects the real Resend adapter; else fallback to console with a loud warning. | `stub` |
| `VIDEO_PROVIDER`   | Selects the `VideoProvider`: `stub` (throwing placeholder, default), `mock` (dev), or `daily` (the real `daily.js` Daily.co adapter — **free tier: slot-bounded room + token only, no participant webhook**; ADR-43). Mock / `/dev/*` routes **must never be active in production**. | `stub` |
| `VIDEO_MOCK_SECRET` | Dev-only mock meeting-token signing key (HMAC). Optional; for use only when `VIDEO_PROVIDER=mock`. Never set in production. | _(optional, dev-only)_ |

### Daily.co (Video Adapter — free tier)

| Variable        | Purpose              | Example / Default       |
| --------------- | -------------------- | ----------------------- |
| `DAILY_API_KEY`        | Daily.co API key (Bearer auth for `createRoom`/`issueToken`)                                           | _(set per environment)_ |
| `DAILY_DOMAIN`         | Daily.co team domain                                                                                   | `your-team.daily.co`    |

> No `DAILY_WEBHOOK_SECRET` — the participant webhook was removed with the no-show lifecycle (ADR-43). Daily runs on the free tier (room + token only).

### Resend (Email Adapter)

| Variable         | Purpose                 | Example / Default            |
| ---------------- | ----------------------- | ---------------------------- |
| `RESEND_API_KEY` | Resend API key          | _(set per environment)_      |
| `RESEND_FROM`    | Optional. From address for the real Resend adapter. Without it the adapter sends from `onboarding@resend.dev` (Resend's shared default). Note: key-only sends reach only the Resend account owner's inbox — patient inboxes require a verified domain + this variable set. | `onboarding@resend.dev` |

### Error Tracking

| Variable             | Purpose                          | Example / Default   |
| -------------------- | -------------------------------- | ------------------- |
| `SENTRY_DSN` | Optional string. Sentry error-tracking DSN (`@sentry/node`). Unset → error tracking is a logging no-op (dev/test/CI never egress); set → `initErrorTracking()` activates it at boot with `sendDefaultPii:false` + a `beforeSend` PII scrub (doc 08 §A05; ADR-36). Renamed from the earlier placeholder `ERROR_TRACKING_DSN`. | _(optional in dev; set in prod)_ |

### File Storage

| Variable      | Purpose                                                                                      | Example / Default |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `UPLOADS_DIR` | Directory for doctor profile photos; served statically at `/uploads`. In Docker this path is the `dermestha_uploads` volume (must be persistent storage in production, else photos are lost on redeploy — doc 10 §3). | `./uploads`       |

### Tunable Defaults

The `settings` row (A6) is editable at runtime via `PUT /api/admin/settings` without a redeploy: `minBookingLeadMinutes` (30–1440) and the four bank-transfer fields (`bankName`, `bankAccountName`, `bankAccountNumber`, `bankInstructions`).

| Variable               | Purpose                                              | Default |
| ---------------------- | ---------------------------------------------------- | ------- |
| `SLOT_GRANULARITY_MIN` | Slot granularity in minutes                          | `30`    |
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

### Email Dispatch

| Variable                 | Purpose                                                                                                                    | Default |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------- |
| `EMAIL_MAX_ATTEMPTS`     | Max email dispatch attempts before a job is marked failed and an `email.send_failed_final` audit alert is written (F07.03) | `3`     |
| `EMAIL_BACKOFF_BASE_SEC` | Base seconds for email dispatch exponential backoff (`base × 2^attempts`)                                                  | `60`    |

> The reconciliation-worker config (`RECONCILIATION_LOOKBACK_H`, `RECONCILIATION_MIN_AGE_MIN`) was removed with the payment gateway (ADR-43).

---

## 9. Build & Test Scripts

Source: root `package.json` (`scripts` + `devDependencies`). Run from the project root.

| Script             | Command          | Purpose                                                                                  |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------- |
| `npm run test`     | `vitest run`     | Unit + integration suite (server/shared + the client config; doc 09 §1)                  |
| `npm run test:e2e` | `playwright test` | Playwright end-to-end launch-gate suite over `e2e/` (`playwright.config.js`; 6 Critical journeys J1–J6 vs the mock adapters; ADR-38, doc 09 §4) |

`@playwright/test` is a **root devDependency** — a cross-cutting test tool spanning the whole repo (like `vitest`), not scoped to a single workspace. The harness config is `playwright.config.js`; specs and fixtures live under `e2e/` (`tests/`, `support/`, `global-setup.js`).

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
| 2026-06-14 | Added `DAILY_WEBHOOK_SECRET` to the Daily.co env section (§8); updated the `VIDEO_PROVIDER` row so `daily` resolves to the real `daily.js` adapter (HMAC-verified webhook + slot-bounded rooms, gated by doc 07) rather than the stub | Slice H · S2 (Daily.co video adapter; ADR-33) |
| 2026-06-14 | Renamed the Error-Tracking env var `ERROR_TRACKING_DSN` → `SENTRY_DSN` (string, optional; DSN-gated Sentry + PII scrub; ADR-36); flipped §7 #4 Dual-Zod "known inconsistency" → resolved (single zod@3 via `shared` workspace + root `overrides.zod`; duck-typing removed; ADR-37) | Slice H · S6 (launch foundation + hardening) |
| 2026-06-14 | Added §9 Build & Test Scripts — recorded `npm run test:e2e` (`playwright test`) + noted `@playwright/test` as a cross-cutting root devDependency (like `vitest`); ADR-38 | Slice H · S7 (E2E QA + launch gate) |
| 2026-06-28 | Manual-payment pivot (ADR-43): removed all `PAYFAST_*`/`PAYMENT_PROVIDER`/`REFUND_*`/`RECONCILIATION_*`/`NO_SHOW_GRACE_MIN`/`SLOT_LOCK_TTL_MIN`/`DAILY_WEBHOOK_SECRET` config; §3 worker cadence → single `notification-dispatch` job; §4 refund-retry section retired; §6 fallback-fee model → bank-transfer settings; Daily → free tier (no webhook); pay rate-limit re-scoped to the bank-reference submit endpoint; missing-Rx alert keyed on `confirmed` | Manual-payment pivot — config as-built sync |
