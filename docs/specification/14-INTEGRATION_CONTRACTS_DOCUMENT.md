# 14 — Integration Contracts Document

| Field            | Value                              |
| ---------------- | ---------------------------------- |
| Document ID      | 14-INTEGRATION_CONTRACTS_DOCUMENT  |
| Status           | Canonical                          |
| Version          | 1.3                                |
| Last updated     | 2026-06-05                         |
| Sources absorbed | `docs/engineering/INTEGRATIONS.md` |
| Related docs     | 03, 05, 08, 15                     |

---

## Index

1. [Adapter contracts (JSDoc @typedef)](#1-adapter-contracts-jsdoc-typedef)
2. [PayFast (payment) payload shapes](#2-payfast-payment-payload-shapes)
3. [Daily.co (video) payload shapes](#3-dailyco-video-payload-shapes)
4. [Resend (email) shapes](#4-resend-email-shapes)
5. [Email merge-variable catalog (7 triggers)](#5-email-merge-variable-catalog-7-triggers)
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
 *   Verify signature + parse an inbound IPN. THROWS on invalid signature (→ 401 + alert).
 * @property {(args: RefundArgs) => Promise<RefundResult>} refund
 *   Idempotent refund keyed by refundIdempotencyKey.
 * @property {(sinceIso: string) => Promise<UnconfirmedPayment[]>} listUnconfirmed
 *   Reconciliation query: payments not yet confirmed in the window (hourly worker).
 */
```

### VideoProvider (Daily.co) — module 9

```js
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<VideoRoom>} createRoom
 *   One isolated room per appointment (identity tied to the appointment).
 * @property {(args: TokenArgs) => Promise<{ token: string, expiresAt: string }>} issueToken
 *   Time-bound participant token scoped to the slot window.
 */
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
 *  @property {string} refundRef @property {'settled'|'initiated'|'failed'} status */
```

### UnconfirmedPayment (reconciliation query)

```js
/** @typedef {Object} UnconfirmedPayment
 *  @property {string} intentKey @property {string} providerRef @property {number} amount
 *  @property {'success'|'failed'|'pending'} status */
```

### Webhook (IPN) specifics

- PayFast posts `application/x-www-form-urlencoded`. **Signature verification:** recompute the MD5 (or vendor-current) signature over the posted params in PayFast's prescribed order using the merchant passphrase; reject on mismatch → `401` + admin alert (§3.4). Also (recommended) validate the source IP / server-confirmation callback per PayFast docs.
- On verified `payment.success`: the webhook handler runs the **single `$transaction`** that moves the appointment `slot_locked→confirmed`, snapshots `feeAtBooking` (#6), and writes the `payments` row (#2). `gatewayFee` from the IPN is stored and drives refund math; if absent, the `settings` fallback applies (policy #5).
- `notifyUrl` = `${APP_BASE_URL}/api/webhooks/payfast`.

### Dev simulation: `payfast.mock` (ADR-22)

The concrete PayFast network adapter is not yet wired; the production default (`PAYMENT_PROVIDER=stub`) throws `NOT_IMPLEMENTED`. For dev/CI, a `payfast.mock` adapter implements the same `PaymentProvider` typedef: `createCheckout` returns a redirect to an app-served, env-guarded hosted-checkout page (`GET /dev/checkout`, mounted only when `PAYMENT_PROVIDER=mock`). Its Pay/Fail action builds a **real HMAC-signed IPN** (over the fields above, keyed on `PAYFAST_PASSPHRASE`) and POSTs it through the **same** `verifyWebhook` + atomic-commit path as production, so signature verification, the `$transaction` commit (#2), `feeAtBooking` snapshot (#6), and 401-on-bad-signature are exercised offline. The mock signs its own deterministic field set rather than PayFast's exact MD5 param order — the real adapter implements that when wired. The mock gateway and `/dev/*` routes must never be active in production (doc 10/15/08).

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

Participant events are received at `POST /api/webhooks/daily` and feed the evaluation worker:

```json
{ "type": "participant.joined" | "participant.left",
  "room": "appt_<id>", "user_name": "...", "timestamp": "ISO-8601" }
```

The worker maps join/leave to no-show resolution (doctor vs patient absent at slot+15m). Transient drops do not finalize `completed` (edge #22); missing participant data → non-penalizing terminal + admin alert (§10). Tokens are browser-only; the platform never proxies media.

### Dev simulation: `daily.mock` (ADR-24)

The concrete Daily.co network adapter is not yet wired; the production default (`VIDEO_PROVIDER=stub`) throws `NOT_IMPLEMENTED`. For dev/CI, a `daily.mock` adapter (`server/src/integrations/video/daily.mock.js`) implements the same `VideoProvider` typedef (ADR-10): `createRoom` returns a deterministic `appt_<id>` room name; `issueToken` returns an HMAC-signed (keyed on `VIDEO_MOCK_SECRET`) opaque dev token bounded by the slot window. A dev-only, env-guarded simulator (`/dev/video/*`, mounted only when `VIDEO_PROVIDER=mock`) emits the documented Daily participant payload above through the **same** real `POST /api/webhooks/daily` handler, so the join-recording and no-show resolution paths are exercised offline and in CI. The `/dev/worker/*` route triggers one evaluation-worker pass on demand. The mock and all `/dev/*` routes must never be active in production (doc 10/15/08; ADR-24).

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

---

## 5. Email merge-variable catalog (7 triggers)

Retry/backoff lives in the notification worker (`CONFIG.md §3`); no PDF attachments in v1 — links to the dashboard. Merge-vars are the data contract; final copy is M4.

| `EmailTemplate`        | Trigger                                   | Merge vars                                                   |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `booking_confirmation` | `→confirmed`                              | `patientName, doctorName, slotStartLocal, fee, dashboardUrl` |
| `reminder_24h`         | 24 h before slot (skipped for short-lead) | `patientName, doctorName, slotStartLocal, joinUrl`           |
| `reminder_1h`          | 1 h before slot (skipped for short-lead)  | same as `reminder_24h`                                       |
| `prescription_ready`   | `→prescription_issued`                    | `patientName, doctorName, prescriptionUrl`                   |
| `refund_confirmation`  | refund `settled`                          | `patientName, amount, refundRef, appointmentRef`             |
| `cancellation_apology` | `doctor_cancelled` / `doctor_no_show`     | `patientName, doctorName, slotStartLocal, refundAmount`      |
| `password_reset`       | patient forgot-password request (F01.03)  | `resetUrl, expiresInMinutes`                                |

**Auth transactional email (F01.03):** `password_reset` is the one auth-flow template — dispatched directly by the auth service (not the notification worker's six appointment-cadence triggers). The send is best-effort and must never block or alter the enumeration-safe forgot-password response; on provider failure the link is logged in non-production and a warning is recorded.

**Reminder invalidation (§3.4):** the worker re-checks appointment state immediately before dispatch and **suppresses** any reminder for an appointment no longer `confirmed`/`in_progress`.

---

## 6. Analytics event catalog

Ingested at `POST /api/analytics/events` as `{ type, networkType?, meta? }`. `networkType` (e.g. `"3g"`, `"4g"`, `"wifi"`) backs the 3G-success KPI.

| `type`               | Fired when                            | `meta`                                 |
| -------------------- | ------------------------------------- | -------------------------------------- |
| `landing_view`       | P-01 loads                            | `{ referrer? }`                        |
| `booking_started`    | patient locks a slot                  | `{ doctorId }`                         |
| `booking_confirmed`  | `→confirmed`                          | `{ doctorId, fee }`                    |
| `video_join_attempt` | Join Call clicked                     | `{ appointmentId, role }`              |
| `video_join_success` | participant token accepted / media up | `{ appointmentId, role, networkType }` |

Keep the catalog closed: adding an event = adding a row here first, so the KPI dashboard and the emitter stay in lockstep (matches the single-source discipline of ARCHITECTURE.md §6b).

---

## 7. Error envelope

Shared by all `/api` routes (repeated from `API.md §1.1`):

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
