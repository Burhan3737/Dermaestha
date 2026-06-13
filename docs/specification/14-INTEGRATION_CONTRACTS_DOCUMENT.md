# 14 — Integration Contracts Document

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| Document ID      | 14-INTEGRATION_CONTRACTS_DOCUMENT  |
| Status           | Canonical                          |
| Version          | 1.9                                |
| Last updated     | 2026-06-14                         |
| Sources absorbed | `docs/engineering/INTEGRATIONS.md` |
| Related docs     | 03, 05, 08, 15                     |

---

## Index

1. [Adapter contracts (JSDoc @typedef)](#1-adapter-contracts-jsdoc-typedef)
2. [PayFast (payment) payload shapes](#2-payfast-payment-payload-shapes)
3. [Daily.co (video) payload shapes](#3-dailyco-video-payload-shapes)
4. [Resend (email) shapes](#4-resend-email-shapes)
5. [Email merge-variable catalog (8 triggers)](#5-email-merge-variable-catalog-8-triggers)
6. [Analytics event catalog](#6-analytics-event-catalog)
7. [Error envelope](#7-error-envelope)
8. [Revision footer](#revision-footer)

---

## Purpose

This document is a faithful re-presentation of `docs/engineering/INTEGRATIONS.md`. It defines the three vendor adapter interface contracts (JSDoc `@typedef`s), all payload shapes for PayFast, Daily.co, and Resend, the six-trigger email merge-variable catalog, and the analytics event catalog. Each vendor sits behind a `@typedef` contract so a swap is a new file and a config switch; services depend on the typedef, never on a vendor SDK directly.

---

## 1. Adapter contracts (JSDoc @typedef)

### PaymentProvider (PayFast) — modules 6, 8

```js
/**
 * @typedef {Object} PaymentProvider
 * @property {(args: CheckoutArgs) => Promise<CheckoutResult>} createCheckout
 *   Build a hosted-checkout handoff for a slot_locked appointment.
 * @property {(req: import('express').Request) => WebhookResult} verifyWebhook
 *   Verify signature + parse an inbound IPN (the CHECKOUT_URL server callback). THROWS on invalid signature (→ 401 + alert).
 * @property {(req: import('express').Request) => WebhookResult} verifyReturn
 *   Verify + parse the browser SUCCESS_URL/FAILURE_URL return params; same verification as
 *   verifyWebhook (dual-channel confirmation). THROWS on invalid signature (→ 401 + alert).
 * @property {(args: RefundArgs) => Promise<RefundResult>} refund
 *   Idempotent refund keyed by refundIdempotencyKey.
 * @property {(sinceIso: string) => Promise<UnconfirmedPayment[]>} listUnconfirmed
 *   Reconciliation query: payments not yet confirmed in the window (hourly worker).
 * @property {(args: QueryPaymentStatusArgs) => Promise<QueryPaymentStatusResult>} queryPaymentStatus
 *   Reconciliation probe: fetch live status for a single payment by providerRef (F04.03).
 *   Used by the hourly reconciliation worker to recover from lost payment.success IPNs.
 */
```

### VideoProvider (Daily.co) — module 9

```js
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string, opts?: { notAfterIso?: string }) => Promise<VideoRoom>} createRoom
 *   One isolated room per appointment (identity tied to the appointment). Idempotent: reuses an
 *   existing `appt_<id>` room. Optional `notAfterIso` sets the room `exp` (slot-bounded; default 24h).
 * @property {(args: TokenArgs) => Promise<{ token: string, expiresAt: string }>} issueToken
 *   Time-bound participant token scoped to the slot window.
 * @property {(req: import('express').Request) => NormalizedVideoEvent | null} verifyWebhook
 *   Verify the Daily HMAC signature + normalize the participant event. Returns null for irrelevant
 *   or tokenless (knocking) events and the create-time test ping; THROWS AppError(INVALID_SIGNATURE,
 *   401) on a bad signature.
 */

/** @typedef {Object} NormalizedVideoEvent
 *  @property {'participant.joined'|'participant.left'} type
 *  @property {string} appointmentId      // payload.room with the 'appt_' prefix stripped
 *  @property {'doctor'|'patient'} role   // anchored to the meeting-token user_id Daily echoes back
 *  @property {string} timestamp          // joined_at; .left falls back to the envelope event_ts
 *  @property {string} eventId */
```

### EmailProvider (Resend) — module 13

```js
/**
 * @typedef {Object} EmailProvider
 * @property {(args: SendArgs) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => BounceEvent} parseWebhook  // bounce/complaint
 */
```

---

## 2. PayFast (payment) payload shapes

### CheckoutArgs and CheckoutResult

```js
/** @typedef {Object} CheckoutArgs
 *  @property {string} appointmentId
 *  @property {string} intentKey          // (patient,slot) idempotency (#7)
 *  @property {number} amount             // PKR paisa
 *  @property {string} returnUrl @property {string} cancelUrl @property {string} notifyUrl */

/** @typedef {Object} CheckoutResult
 *  @property {string} redirectUrl        // send the browser here
 *  @property {string} providerRef */
```

### WebhookResult (signed IPN)

```js
/** @typedef {Object} WebhookResult
 *  @property {'payment.success'|'payment.failed'} event
 *  @property {string} providerRef
 *  @property {string} intentKey
 *  @property {number} amount             // paisa
 *  @property {number|null} gatewayFee    // paisa; null → use Settings fallback (policy #5) */
```

### RefundArgs and RefundResult

```js
/** @typedef {Object} RefundArgs
 *  @property {string} providerRef @property {number} amount @property {string} idempotencyKey */
/** @typedef {Object} RefundResult
 *  @property {string|null} refundRef
 *  @property {'settled'|'initiated'|'failed'|'manual_required'} status
 *    // 'manual_required': PayFast PK exposes no confirmed refund API → manual admin settlement
 *    //                    (refundRef null until an admin records the out-of-band refund; ADR-32). */
```

### UnconfirmedPayment (reconciliation query)

```js
/** @typedef {Object} UnconfirmedPayment
 *  @property {string} intentKey @property {string} providerRef @property {number} amount
 *  @property {'success'|'failed'|'pending'} status */
```

### QueryPaymentStatusArgs and QueryPaymentStatusResult

```js
/** @typedef {Object} QueryPaymentStatusArgs
 *  @property {string} providerRef */
/** @typedef {Object} QueryPaymentStatusResult
 *  @property {'paid'|'failed'|'unknown'} status
 *  @property {number} [amount]          // paisa; present when status is 'paid'
 *  @property {number|null} [gatewayFee] // paisa; null → use Settings fallback (policy #5) */
```

### PayFast Pakistan IPG specifics (researched — NOT vendor-confirmed)

> **The entire external contract below is researched, NOT vendor-confirmed.** Every detail — base URLs, the `GetAccessToken`→`PostTransaction` init flow, the signature field list/order, the callback field names, and the amount unit — is gated behind doc 07 §3's PayFast-Pakistan merchant-verification checklist before go-live. The adapter (`server/src/integrations/payment/payfast.js`) keeps each detail behind a named constant/helper so a single correction lands once PayFast confirms the official spec.

- **Init flow (two-step):** `createCheckout` first POSTs `GetAccessToken` (auth: `MERCHANT_ID` + `SECURED_KEY`) to obtain an access token, then builds the signed `PostTransaction` handoff field set (`MERCHANT_ID`, `MERCHANT_NAME`, `TOKEN`, `PROCCODE`, `TXNAMT`, `CURRENCY_CODE=PKR`, `BASKET_ID`, `TXNDESC`, `SUCCESS_URL`, `FAILURE_URL`, `CHECKOUT_URL`, `SIGNATURE`). `BASKET_ID` = `appointmentId` and doubles as the provider ref / intent key (PayFast PK echoes it; there is no separate intent key on the wire).
- **Signature:** `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)`; reject on mismatch → `401` + admin alert (§3.4). [LOW confidence — doc 07 §3 #1.]
- **Amounts are rupees-decimal on the wire** (e.g. `"2500.00"`), not paisa. The adapter converts paisa↔rupees at the boundary (`paisaToRupees` / `rupeesToPaisa`); all internal money stays integer paisa (doc 15 §6).
- **Dual-channel confirmation:** PayFast PK confirms through (1) a server-to-server callback to `CHECKOUT_URL` (= `notifyUrl` = `${APP_BASE_URL}/api/webhooks/payfast`), parsed by `verifyWebhook`, AND (2) the browser return to `SUCCESS_URL` / `FAILURE_URL`, parsed by `verifyReturn` (§1). Both run the identical signature-verify + parse and feed the same atomic-commit path; either channel can be the one that confirms (whichever arrives first — the commit is idempotent on replay).
- **On verified `payment.success`** (either channel): the handler runs the **single `$transaction`** that moves the appointment `slot_locked→confirmed`, snapshots `feeAtBooking` (#6), and writes the `payments` row (#2). PayFast PK reports **no** gateway fee, so `gatewayFee` is `null` and the `settings` fallback fee model always applies (policy #5).
- **Hosts:** sandbox `ipguat.apps.net.pk`, live `ipg1.apps.net.pk` (selected by `PAYFAST_MODE`); base path `/Ecommerce/api/Transaction/`.
- **No confirmed refund or status-query API:** `refund` returns `{ status: 'manual_required', refundRef: null }` (manual admin settlement, doc 11 ADR-32 / doc 07 §3 #3); `queryPaymentStatus` returns `{ status: 'unknown' }` (reconciliation surfaces these for manual review, doc 07 §3 #4).

### Dev simulation: `payfast.mock` (ADR-22)

The concrete PayFast network adapter is not yet wired; the production default (`PAYMENT_PROVIDER=stub`) throws `NOT_IMPLEMENTED`. For dev/CI, a `payfast.mock` adapter implements the same `PaymentProvider` typedef: `createCheckout` returns a redirect to an app-served, env-guarded hosted-checkout page (`GET /dev/checkout`, mounted only when `PAYMENT_PROVIDER=mock`). Its Pay/Fail action builds a **real HMAC-signed IPN** (over the fields above, keyed on `PAYFAST_PASSPHRASE`) and POSTs it through the **same** `verifyWebhook` + atomic-commit path as production, so signature verification, the `$transaction` commit (#2), `feeAtBooking` snapshot (#6), and 401-on-bad-signature are exercised offline. The mock signs its own deterministic field set rather than PayFast's exact MD5 param order — the real adapter implements that when wired. The mock also implements `queryPaymentStatus`, returning `{ status: 'unknown' }` (the mock keeps no payment ledger; reconciliation unit tests stub richer answers). The `payfast.stub` (`PAYMENT_PROVIDER=stub`, real-adapter placeholder for Slice H) marks `queryPaymentStatus` as not-yet-implemented and throws `NOT_IMPLEMENTED`. The mock gateway and `/dev/*` routes must never be active in production (doc 10/15/08).

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

### Participant join/leave event (Daily webhook)

Participant events are received at `POST /api/webhooks/daily` (signature-verified) and feed the evaluation worker. Daily delivers its current **versioned envelope**:

```json
{ "version": "1.0",
  "type": "participant.joined" | "participant.left",
  "id": "<event id>",
  "payload": { "room": "appt_<id>", "user_id": "doctor"|"patient",
               "user_name": "...", "owner": true,
               "joined_at": "ISO-8601", "session_id": "..." },
  "event_ts": 1700000000 }
```

`payload.room` is the room **name** (`appt_<id>`); note the boolean is `payload.owner`, NOT `is_owner`. **Role** is taken from the meeting-token `user_id` Daily echoes back (`'doctor'`/`'patient'`; `payload.owner` is only a fallback) — tokenless/knocking participants have no role and are ignored (`verifyWebhook` returns null). The adapter normalizes the envelope to a `NormalizedVideoEvent` (§1), preferring `payload.joined_at` for the timestamp and falling back to the envelope `event_ts` for `.left` (which has no confirmed participant timestamp).

**HMAC verification (`verifyWebhook`):** Daily signs each delivery with headers `X-Webhook-Timestamp` + `X-Webhook-Signature`. The signed string is `timestamp + "." + rawBody`; the MAC is HMAC-SHA256 keyed on the **base64-decoded** `DAILY_WEBHOOK_SECRET`, output base64, compared constant-time. A mismatch THROWS `401` (→ `video.webhook_rejected` audit, doc 05). The signed string runs over the **exact received bytes** (`req.rawBody`), so the route mounts its own `express.json({ verify })` to capture them; the create-time `{ "test": "test" }` ping verifies and returns null. **Launch gate:** the signed-string serialization (raw received bytes vs `JSON.stringify`) must be validated against a live Daily delivery before go-live (doc 07).

The worker maps join/leave to no-show resolution (doctor vs patient absent at slot+15m). Transient drops do not finalize `completed` (edge #22); missing participant data → non-penalizing terminal + admin alert (§10). Tokens are browser-only; the platform never proxies media.

### Dev simulation: `daily.mock` (ADR-24)

The concrete Daily.co network adapter (`daily.js`) is now wired and selected via `VIDEO_PROVIDER=daily` (ADR-33; live-delivery gated by doc 07); `VIDEO_PROVIDER=stub` (the default) still throws `NOT_IMPLEMENTED`. For dev/CI, a `daily.mock` adapter (`server/src/integrations/video/daily.mock.js`) implements the same `VideoProvider` typedef (ADR-10): `createRoom` returns a deterministic `appt_<id>` room name; `issueToken` returns an HMAC-signed (keyed on `VIDEO_MOCK_SECRET`) opaque dev token bounded by the slot window. A dev-only, env-guarded simulator (`/dev/video/*`, mounted only when `VIDEO_PROVIDER=mock`) emits the documented Daily participant payload above through the **same** real `POST /api/webhooks/daily` handler, so the join-recording and no-show resolution paths are exercised offline and in CI. The `/dev/worker/*` route triggers one evaluation-worker pass on demand. The mock and all `/dev/*` routes must never be active in production (doc 10/15/08; ADR-24).

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

Retry/backoff lives in the notification worker (doc 15); no PDF attachments in v1 — links to the dashboard. Merge-vars are the data contract; final copy is M4. All email times render in Asia/Karachi (F07.02).

| `EmailTemplate`        | Trigger                                   | Merge vars                                                   |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `booking_confirmation` | `→confirmed`                              | `patientName, doctorName, slotStartLocal, fee, dashboardUrl` |
| `reminder_24h`         | 24 h before slot (skipped for short-lead) | `patientName, doctorName, slotStartLocal, joinUrl`           |
| `reminder_1h`          | 1 h before slot (skipped for short-lead)  | same as `reminder_24h`                                       |
| `prescription_ready`   | every prescription submit (incl. corrections); `dedupeKey` = prescription id | `patientName, doctorName, prescriptionUrl`                   |
| `refund_confirmation`  | refund `settled`                          | `patientName, amount, refundRef, appointmentRef`             |
| `cancellation_apology` | `doctor_cancelled` / `doctor_no_show`     | `patientName, doctorName, slotStartLocal, refundAmount`      |
| `refund_delayed`       | edge #30 patient delay notice             | `patientName, appointmentRef`                               |
| `password_reset`       | patient forgot-password request (F01.03)  | `resetUrl, expiresInMinutes`                                |

**Auth transactional email (F01.03):** `password_reset` is the one auth-flow template — dispatched directly by the auth service (not the notification worker's six appointment-cadence triggers). The send is best-effort and must never block or alter the enumeration-safe forgot-password response; on provider failure the link is logged in non-production and a warning is recorded.

**Reminder invalidation (§3.4):** the worker re-checks appointment state immediately before dispatch and **suppresses** any reminder for an appointment no longer `confirmed`/`in_progress`.

---

## 6. Analytics event catalog

Ingested at `POST /api/analytics/events` as `{ type, networkType, meta }`. `networkType` (e.g. `"3g"`, `"4g"`, `"wifi"`, or `"unknown"`) is a **sibling of `meta`** — the client `lib/analytics/track.js` (ADR-34) attaches it to **every** event from `navigator.connection.effectiveType`; it is never nested inside `meta`. `networkType` backs the 3G-success KPI (#3).

| `type`               | Fired when                            | `meta`                                 |
| -------------------- | ------------------------------------- | -------------------------------------- |
| `landing_view`       | P-01 loads                            | `{ referrer? }`                        |
| `booking_started`    | patient locks a slot                  | `{ doctorId }`                         |
| `booking_confirmed`  | `→confirmed`                          | `{ doctorId, fee }`                    |
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
