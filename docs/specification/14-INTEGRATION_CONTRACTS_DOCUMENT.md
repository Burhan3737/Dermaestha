# 14 — Integration Contracts Document

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| Document ID      | 14-INTEGRATION_CONTRACTS_DOCUMENT  |
| Status           | Canonical                          |
| Version          | 1.12                               |
| Last updated     | 2026-06-28                         |
| Sources absorbed | `docs/engineering/INTEGRATIONS.md` |
| Related docs     | 03, 05, 08, 15                     |

---

## Index

1. [Adapter contracts (JSDoc @typedef)](#1-adapter-contracts-jsdoc-typedef)
2. [Payment — manual offline, no integration](#2-payment--manual-offline-no-integration)
3. [Daily.co (video) payload shapes](#3-dailyco-video-payload-shapes)
4. [Resend (email) shapes](#4-resend-email-shapes)
5. [Email merge-variable catalog (8 triggers)](#5-email-merge-variable-catalog-8-triggers)
6. [Analytics event catalog](#6-analytics-event-catalog)
7. [Error envelope](#7-error-envelope)
8. [Revision footer](#revision-footer)

---

## Purpose

This document is a faithful re-presentation of `docs/engineering/INTEGRATIONS.md`. It defines the vendor adapter interface contracts (JSDoc `@typedef`s), all payload shapes for Daily.co and Resend, the email merge-variable catalog, and the analytics event catalog. Payment is an offline, admin-verified bank transfer with no payment integration (ADR-43). Each vendor sits behind a `@typedef` contract so a swap is a new file and a config switch; services depend on the typedef, never on a vendor SDK directly.

---

## 1. Adapter contracts (JSDoc @typedef)

### Payment — no provider adapter (ADR-43)

There is no `PaymentProvider` contract. Payment is an offline bank transfer verified manually by the admin — no payment gateway, no hosted checkout, no webhook/return-URL verification, no refund, and no reconciliation/status-query API. See §2 and doc 11 ADR-43.

### VideoProvider (Daily.co, free tier) — module 9

```js
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string, opts?: { notAfterIso?: string }) => Promise<VideoRoom>} createRoom
 *   One isolated room per appointment (identity tied to the appointment). Idempotent: reuses an
 *   existing `appt_<id>` room. Optional `notAfterIso` sets the room `exp` (slot-bounded; default 24h).
 * @property {(args: TokenArgs) => Promise<{ token: string, expiresAt: string }>} issueToken
 *   Time-bound participant token scoped to the slot window.
 */
```

Daily runs on the **free tier** (ADR-43): `createRoom` + `issueToken` only. There is no participant webhook, no `verifyWebhook`, and no normalized video event (§3).

### EmailProvider (Resend) — module 13

```js
/**
 * @typedef {Object} EmailProvider
 * @property {(args: SendArgs) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => BounceEvent} parseWebhook  // bounce/complaint
 */
```

---

## 2. Payment — manual offline, no integration

Per ADR-43 there is **no payment integration**: payment is an offline bank transfer the admin verifies by hand. There are no external payload shapes — no hosted checkout, no signed IPN/webhook, no return-URL verification, no refund or reconciliation/status-query contract, and no `Payment` table.

The flow uses internal `/api` routes only (contracts in doc 05): booking creates a `pending` appointment and snapshots `feeAtBooking` at lock time; the patient is shown bank details from admin Settings (`paymentInstructions { amountDue, bankName, bankAccountName, bankAccountNumber, bankInstructions }` on `GET /api/appointments/:id` for an owned `pending` appointment), transfers offline, and submits a bank reference via `POST /api/appointments/:id/pay` (sets `paymentReference` + `paymentSubmittedAt`, stays `pending`, enqueues a `payment_submitted_admin` admin alert). The admin reviews the `pending` queue (`GET /api/admin/records?state=pending`) and either accepts (`POST /api/admin/appointments/:id/accept` → `pending → confirmed`) or rejects (`POST /api/admin/appointments/:id/reject` → `pending → cancelled`, frees the slot). Paid is paid — cancelling forfeits; any money movement is offline. See doc 11 ADR-43 for the rationale.

---

## 3. Daily.co (video) payload shapes

### VideoRoom and TokenArgs

```js
/** @typedef {Object} VideoRoom @property {string} roomName @property {string} roomUrl */

/** @typedef {Object} TokenArgs
 *  @property {string} roomName
 *  @property {'patient'|'doctor'} role
 *  @property {string} notBeforeIso  // slot-start − 10 min
 *  @property {string} notAfterIso   // slot-end + 5 min (hard cutoff)
 *  @property {string} displayName */
```

### Room + token only — free tier (ADR-43)

Daily runs on the **free tier**: the adapter exposes only `createRoom` (deterministic `appt_<id>` room, idempotent) and `issueToken` (slot-bounded participant token). There is **no** participant webhook — `POST /api/webhooks/daily` was removed, along with `verifyWebhook`, the normalized participant event, join recording, and `DAILY_WEBHOOK_SECRET`. `video-token` is issued for `confirmed` appointments only and returns the room name + token (`joinSimUrl: null`); the SPA joins Daily directly and the platform never proxies media.

### Dev simulation: `daily.mock` (ADR-24, ADR-43)

The concrete Daily.co network adapter (`daily.js`) is wired and selected via `VIDEO_PROVIDER=daily` (ADR-33; live-delivery gated by doc 07); `VIDEO_PROVIDER=stub` (the default) still throws `NOT_IMPLEMENTED`. For dev/CI, a `daily.mock` adapter (`server/src/integrations/video/daily.mock.js`) implements the same `VideoProvider` typedef (ADR-10): `createRoom` returns a deterministic `appt_<id>` room name; `issueToken` returns an HMAC-signed (keyed on `VIDEO_MOCK_SECRET`) opaque dev token bounded by the slot window. With the participant webhook removed, there is no `/dev/video/*` join simulator and no evaluation-worker pass. The mock and all `/dev/*` routes must never be active in production (doc 10/15/08; ADR-24).

---

## 4. Resend (email) shapes

### SendArgs

```js
/** @typedef {Object} SendArgs
 *  @property {EmailTemplate} template @property {string} to @property {Record<string,*>} vars */
```

### BounceEvent (bounce/complaint webhook)

```js
/** @typedef {Object} BounceEvent
 *  @property {'bounce'|'complaint'|'delivered'} type @property {string} to @property {string} providerId */
```

### Real Resend HTTP adapter

The active email adapter posts to `POST https://api.resend.com/emails` with header `Authorization: Bearer ${RESEND_API_KEY}` and JSON body `{ from, to: [...], subject, text }`. A non-2xx response maps to an `EMAIL_SEND_FAILED` error (HTTP 502 to the caller), engaging the outbox retry machinery. A successful response returns `{ providerId }`.

**Boot-time provider selection:**

| Condition | Adapter selected |
| --------- | ---------------- |
| `EMAIL_PROVIDER=console` | Dev console logger — no real emails delivered |
| `RESEND_API_KEY` set (and `EMAIL_PROVIDER` ≠ `console`) | Real Resend HTTP adapter |
| Neither configured | Console adapter with a loud boot warning — no real emails delivered |

**Production caveat:** a configured `RESEND_API_KEY` alone sends only to the Resend account owner's address from `onboarding@resend.dev` — sufficient to verify the integration end-to-end. Delivering to arbitrary patient inboxes requires a verified sender domain (DNS) and `RESEND_FROM` set to an address on that domain. Key only = testable; key + verified domain = production-ready.

---

## 5. Email merge-variable catalog (8 triggers)

Retry/backoff lives in the notification worker (doc 15); no PDF attachments in v1 — links to the dashboard. Merge-vars are the data contract; final plain-text copy shipped in Slice H · S5 (`server/src/integrations/email/templates.js`, shared `render()`). All email times render in Asia/Karachi (F07.02).

| `EmailTemplate`          | Trigger                                   | Merge vars (`?` = optional)                          |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------- |
| `booking_confirmation`   | admin accepts a `pending` appointment (`→confirmed`) | `patientName, doctorName?, slotStartLocal?, fee?, dashboardUrl` |
| `reminder_24h`           | 24 h before slot (skipped for short-lead) | `patientName, doctorName?, slotStartLocal?, joinUrl` |
| `reminder_1h`            | 1 h before slot (skipped for short-lead)  | same as `reminder_24h`                               |
| `prescription_ready`     | every prescription submit (incl. corrections); `dedupeKey` = prescription id | `patientName, doctorName?, prescriptionUrl`        |
| `payment_submitted_admin`| patient submits a bank reference (admin alert) | `appointmentRef, reference?, reviewUrl?`        |
| `payment_not_received`   | admin rejects a `pending` appointment (`→cancelled`) | `patientName, slotStartLocal?, appointmentRef?` |
| `cancellation`           | appointment cancelled (patient/doctor/admin) | `patientName, doctorName?, slotStartLocal?`      |
| `password_reset`         | patient forgot-password request (F01.03)  | `expiresInMinutes, resetUrl`                         |

**Manual-payment producers (ADR-43):** with no gateway/refund subsystem there are no `refund_confirmation` / `cancellation_apology` / `refund_delayed` templates. The two new admin/patient alerts — `payment_submitted_admin` (patient submitted a reference) and `payment_not_received` (admin rejected) — back the offline accept/reject review loop; the former also raises an in-app admin alert.

**Auth transactional email (F01.03):** `password_reset` is the one auth-flow template — dispatched directly by the auth service (not the notification worker's appointment-cadence triggers). The send is best-effort and must never block or alter the enumeration-safe forgot-password response; on provider failure the link is logged in non-production and a warning is recorded.

**Reminder invalidation (§3.4):** the worker re-checks appointment state immediately before dispatch and **suppresses** any reminder for an appointment no longer `confirmed`.

---

## 6. Analytics event catalog

Ingested at `POST /api/analytics/events` as `{ type, networkType, meta }`. **As of Slice H · S6 the ingestion endpoint exists** (built — public, rate-limited 60/min/IP, body validated against this closed catalog: unknown `type` → `400 VALIDATION_FAILED`, success `202 { ok: true }`; doc 05). The catalog itself is unchanged. `networkType` (e.g. `"3g"`, `"4g"`, `"wifi"`, or `"unknown"`) is a **sibling of `meta`** — the client `lib/analytics/track.js` (ADR-34) attaches it to **every** event from `navigator.connection.effectiveType`; it is never nested inside `meta`. `networkType` backs the 3G-success KPI (#3).

| `type`               | Fired when                            | `meta`                                 |
| -------------------- | ------------------------------------- | -------------------------------------- |
| `landing_view`       | P-01 loads                            | `{ referrer? }`                        |
| `booking_started`    | patient locks a slot                  | `{ doctorId }`                         |
| `booking_confirmed`  | admin accepts a `pending` appt (`→confirmed`, server-side) | `{ doctorId, fee }`                    |
| `video_join_attempt` | Join Call clicked                     | `{ appointmentId, role }`              |
| `video_join_success` | Daily `joined-meeting` (media up)     | `{ appointmentId, role }`              |

Keep the catalog closed: adding an event = adding a row here first, so the KPI dashboard and the emitter stay in lockstep (matches the single-source discipline of ARCHITECTURE.md §6b).

---

## 7. Error envelope

Shared by all `/api` routes (repeated from doc 05):

```json
{ "error": { "code": "SCREAMING_SNAKE", "message": "display-safe", "details": {} } }
```

Webhook handlers return `200` only after signature verify + durable handling; invalid signature → `401` + admin alert.

---

## Revision footer

| Date       | Change           | Why                                         |
| ---------- | ---------------- | ------------------------------------------- |
| 2026-06-01 | Initial creation | Faithful re-presentation of INTEGRATIONS.md |
| 2026-06-03 | Added `password_reset` email template (§5) | Slice A: F01.03 reset email was missing from the catalog |
| 2026-06-04 | Documented the dev `payfast.mock` adapter + `/dev/checkout` simulation (§2) | Slice C: offline payment simulation via real signed IPN (ADR-22) |
| 2026-06-05 | Added dev `daily.mock` simulation note (§3) | Slice D (F05 video & lifecycle; ADR-24) |
| 2026-06-11 | Repointed deprecated `CONFIG.md §3` -> doc 15 and `API.md §1.1` -> doc 05 | Deprecated-doc hygiene |
| 2026-06-11 | Added `queryPaymentStatus` to PaymentProvider contract + `QueryPaymentStatusArgs`/`Result` typedefs + mock/stub notes (§1-2); real Resend HTTP adapter + boot-time selection + production caveat (§4); `refund_delayed` merge-var row + Asia/Karachi timezone note (§5) | Slice E (reconciliation adapter + real Resend); new external integration cascade |
| 2026-06-12 | Updated the `prescription_ready` trigger (§5) to fire on every prescription submit incl. corrections, with `dedupeKey` = prescription id (vars unchanged) | Slice F (F08): per-prescription enqueue via outbox `dedupe_key` |
| 2026-06-13 | Added `verifyReturn` to the `PaymentProvider` typedef (§1); added `'manual_required'` to `RefundResult.status` + nullable `refundRef` (§2); rewrote the PayFast IPN-specifics subsection from the South-Africa passphrase model to the **PayFast Pakistan** IPG contract (GetAccessToken→PostTransaction, `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)` signature, rupees-decimal wire amounts, dual-channel CHECKOUT_URL + SUCCESS/FAILURE return, ipguat/ipg1 hosts, no refund/status API) marked researched-not-vendor-confirmed and gated by doc 07 §3 (§2) | Slice H · S1 (PayFast Pakistan adapter; ADR-32) |
| 2026-06-14 | Added `verifyWebhook` to the `VideoProvider` typedef + optional `createRoom({ notAfterIso })` + the `NormalizedVideoEvent` typedef (§1); replaced the simplified dev participant shape with Daily's versioned envelope (`payload.owner`, `room`=name, `user_id` role anchor) + documented the raw-body HMAC verification (`X-Webhook-Timestamp`/`X-Webhook-Signature`, base64-decoded `DAILY_WEBHOOK_SECRET`, constant-time) and the live-delivery launch gate → doc 07 (§3); corrected the `daily.mock` note's "not yet wired" opening (the concrete `daily.js` is now wired) | Slice H · S2 (Daily.co video adapter; ADR-33) |
| 2026-06-14 | §6 analytics catalog: corrected the wire shape to the as-built `{ type, networkType, meta }` (`networkType` is the envelope **sibling** the client `track.js` attaches to every event, ADR-34) and removed `networkType` from the `video_join_success` `meta` cell (it was wrongly nested); aligned the `video_join_success` trigger to the Daily `joined-meeting` event | Slice H · S3 (video UI; ADR-34): fix wrong stated fact in the catalog |
| 2026-06-14 | §5: resolved "final copy is M4" — final plain-text copy for all 8 templates shipped in Slice H · S5 (`server/src/integrations/email/templates.js`, shared `render()`); merge-vars unchanged | Slice H · S5 (email template copy) |
| 2026-06-14 | §6 intro: noted the `POST /api/analytics/events` ingestion endpoint now EXISTS (built — public, rate-limited, closed-catalog validated; doc 05); the catalog itself is unchanged | Slice H · S6 (launch foundation + hardening) |
| 2026-06-28 | Dropped the PayFast `PaymentProvider` contract + all PayFast/refund/reconcile payload shapes (§1–2, now a manual-offline note); dropped the Daily participant webhook + `verifyWebhook` + `NormalizedVideoEvent` (free tier = `createRoom`+`issueToken` only, §1, §3); rebuilt the §5 email catalog to the as-built 8 templates (removed `refund_confirmation`/`cancellation_apology`/`refund_delayed`, added `payment_submitted_admin`/`payment_not_received`, renamed `cancellation_apology`→`cancellation`); clarified `booking_confirmed` fires server-side on admin accept (§6) | Manual-payment pivot — as-built sync |
