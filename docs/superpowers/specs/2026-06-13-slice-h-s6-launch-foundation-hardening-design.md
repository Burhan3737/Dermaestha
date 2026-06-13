# Slice H · S6 — Launch Foundation + Hardening — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S6 of 7 |
| Depends on | Slice A–G (merged). Provides the analytics server side that **S3/S4** client emits target. Independent otherwise. |
| Canon refs | PRD §1 KPI #1/#3; doc 14 §6 analytics catalog; doc 13 §5 technical follow-ups (indexes, Settings bootstrap, Zod alignment); doc 04 §4d; doc 07 §2.3 + open-q 7; doc 08 (error egress); doc 10 §3; doc 15 §7 |

---

## 0. Decision provenance (read first)

S6 is the **foundation + hardening** bucket — six small, independent infra items, three of them the doc 13 §5 "technical follow-ups." Verified reality:
- `AnalyticsEvent` + `Settings` tables **already exist** (no new tables); `AnalyticsEvent` has `{ type, networkType, meta }`, no `userId` column (context goes in `meta`).
- `AuditLog` lacks a `targetRef` index; `Appointment` has composite `[doctorId, slotStart]` but **no standalone `slotStart`** index.
- **Zod split is structural:** `workspaces` = `[server, client]` only — `shared/` is **not** a workspace, so `shared/schemas/*` resolve the hoisted root `zod@4.4.3` while `server/` uses `server/node_modules/zod@3.25.76`. Two copies → cross-boundary `instanceof ZodError` fails → Slice G's `errorHandler` duck-types `ZodError` as a workaround.

Approved decisions (user, 2026-06-13):
- **Error tracking: Sentry SaaS, DSN-gated, with mandatory PII scrubbing** (ship the wiring; flipping it on is a later env decision; free tier covers low v1 volume).
- **Zod: standardize on v3 + make `shared` a workspace** (single copy; low risk — server unchanged; remove the duck-typing).
- Defaults accepted: analytics endpoint **public + rate-limited + catalog-validated**; Settings **boot-time idempotent upsert**; the **two missing indexes**.

---

## 1. Scope & goals

**Goal:** the cross-cutting foundation that lets the funnel be measured and the platform be operable + safe to launch.

**In scope:** (1) analytics server endpoint + writer + server-side `booking_confirmed`; (2) Sentry error tracking (DSN-gated + scrubbing); (3) the two DB indexes; (4) `Settings(id=1)` boot bootstrap; (5) Zod v3 single-copy alignment + `shared` workspace; (6) `SENTRY_DSN` config.

**Out of scope:** the client `track.js` helper (S3) + client emit call-sites (S3/S4); new analytics event types beyond doc 14 §6; new product features; self-hosted Sentry ops.

**Success criteria**
1. Full server + client + shared suites stay green; new behavior lands test-first.
2. `POST /api/analytics/events` persists a catalog event, rejects an unknown `type`, and is rate-limited; `landing_view`/`booking_started` from S3/S4 land as rows.
3. `booking_confirmed` is written by `confirmPaidAppointment` for every confirmation (webhook + reconciliation).
4. With no `SENTRY_DSN`, the app boots with error-tracking no-op; with it set, Sentry initializes and `beforeSend` scrubs PII (proven by test).
5. A fresh DB serves `GET /api/admin/settings` (id=1 present) without the null/throw trap.
6. `npm ls zod` resolves a single v3 copy; `errorHandler` uses `instanceof ZodError` (duck-typing removed) and still catches shared-schema errors.
7. The two indexes exist (migration applied; `prisma migrate status` clean).

---

## 2. Analytics foundation (S3/S4 ↔ S6 seam)

- **`server/src/modules/analytics/`** (new): `POST /api/analytics/events` — **public** (landing fires pre-auth), **rate-limited** (existing limiter factory), Zod-validated body `{ type, networkType?, meta? }`, `type` must be in the closed doc 14 §6 catalog (`landing_view`, `booking_started`, `booking_confirmed`, `video_join_attempt`, `video_join_success`) else `400`. Session `userId` (if any) folded into `meta`.
- **`analytics.record({ type, networkType, meta })`** writer → `AnalyticsEvent` row; best-effort, never throws into a request/worker path.
- **Server-side `booking_confirmed`:** call `analytics.record({ type:'booking_confirmed', meta:{ doctorId, fee } })` inside `confirmPaidAppointment` (fires for webhook + reconciliation confirmations — accurate even with no client). This is the S4-assigned KPI #1 conversion event.

## 3. Error tracking — Sentry SaaS (DSN-gated)

- Add `@sentry/node` (server dep). `initErrorTracking()` → `Sentry.init({ dsn: env.SENTRY_DSN, sendDefaultPii: false, beforeSend })` **only when the DSN is set**; otherwise the current no-op + log (dev/CI unaffected).
- `captureException(err)` → `Sentry.captureException` when active. Called from `errorHandler` **alongside** the existing Slice-G audit bridge (`system.unhandled_exception`) — both fire (external + in-app).
- **`beforeSend` scrubbing (mandatory):** strip request bodies, emails, auth tokens/cookies, and patient identifiers before send. Documented as a doc 08 control.

## 4. DB index migration

One additive migration: `AuditLog @@index([targetRef])` + `Appointment @@index([slotStart])`. No data change. `prisma migrate status` clean afterward.

## 5. Settings(id=1) bootstrap

`ensureSettings()` (idempotent `prisma.settings.upsert({ where:{id:1}, update:{}, create:{ id:1, …schema defaults } })`) invoked at server boot (before serving). Removes the "GET null / PUT throws on a fresh DB" trap with no manual deploy step. Mirrored into `prisma/seed.js` for dev parity.

## 6. Zod single-version alignment

- Add **`shared/package.json`** and add `"shared"` to the root `workspaces` array; pin `zod@3` (matching server). Ensure a **single hoisted copy** (`npm ls zod` → one v3). Remove the stray root `zod@4`.
- **Remove the `errorHandler` ZodError duck-typing**, revert to `instanceof ZodError` — guarded by a test that throws a shared-schema validation error through the handler.
- **Blast-radius note:** this touches dependency resolution for server + client + shared; the plan must run all three suites + a clean install and confirm single-copy resolution before removing the workaround.

## 7. Config additions

`env.js` (Zod) + doc 15: add **`SENTRY_DSN`** (string, optional). Reconcile the doc-referenced `ERROR_TRACKING_DSN` name → standardize on `SENTRY_DSN` (note the rename in doc 15). No other new env.

## 8. Testing

- **Analytics:** endpoint accepts a catalog `type`, rejects unknown (`400`), enforces the rate limit; `analytics.record` writes a row; `booking_confirmed` fires in `confirmPaidAppointment` (unit, both confirm paths).
- **Sentry:** `initErrorTracking` no-ops without DSN, inits with it; `beforeSend` scrubs a PII-bearing event fixture.
- **Settings:** `ensureSettings` idempotent (two calls → one row).
- **Zod:** a shared-schema `ZodError` is caught by `errorHandler` via `instanceof` (proves single copy); existing validation behavior unchanged.
- Full server + client + shared suites green; clean `npm install` + `npm ls zod` single-copy check in the plan's verification.

## 9. Spec-doc impact (tracked; applied at task end with approval)

| Doc | Change |
| --- | --- |
| 04 | `AuditLog @@index([targetRef])`, `Appointment @@index([slotStart])` |
| 05 | `POST /api/analytics/events` (public, rate-limited, catalog-validated) |
| 07 | Resolve the three §5 technical follow-ups (indexes, Settings bootstrap, Zod alignment) |
| 08 | Sentry PII-scrubbing policy + external error-egress note |
| 10 | Settings bootstrap is automatic (`ensureSettings`), not a manual deploy step |
| 11 | ADRs — "Sentry DSN-gated error tracking + PII scrubbing"; "Zod v3 single-copy + `shared` workspace; remove ZodError duck-typing" |
| 13 | Analytics module + error-tracking + the three follow-ups → done; module 18 (Analytics) → Built |
| 14 | §6 — ingestion endpoint now exists |
| 15 | `SENTRY_DSN` added (`ERROR_TRACKING_DSN` → `SENTRY_DSN` rename) |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S6 brainstorming output (approved) |
