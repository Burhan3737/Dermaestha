# Dermestha — Integration Contracts

**Document type:** Vendor adapter interfaces + payload shapes
**Companion to:** `docs/engineering/ARCHITECTURE.md` (§12, §17). Each vendor sits behind a JSDoc `@typedef` so a swap (or AWS-native equivalent) is a new file + a config switch.
**Status:** v1 — implementation-ready

> The `@typedef`s below are the **contracts**; `payfast.js` / `daily.js` / `resend.js` are the only files that know vendor specifics. Services depend on the typedef, never on a vendor SDK directly. Field shapes are the **expected** vendor responses — confirm against live docs during M2 (KYC/sandbox).

---

## 1. PaymentProvider (PayFast) — modules 6, 8

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

/** @typedef {Object} CheckoutArgs
 *  @property {string} appointmentId
 *  @property {string} intentKey          // (patient,slot) idempotency (#7)
 *  @property {number} amount             // PKR paisa
 *  @property {string} returnUrl @property {string} cancelUrl @property {string} notifyUrl */

/** @typedef {Object} CheckoutResult
 *  @property {string} redirectUrl        // send the browser here
 *  @property {string} providerRef */

/** @typedef {Object} WebhookResult
 *  @property {'payment.success'|'payment.failed'} event
 *  @property {string} providerRef
 *  @property {string} intentKey
 *  @property {number} amount             // paisa
 *  @property {number|null} gatewayFee    // paisa; null → use Settings fallback (policy #5) */

/** @typedef {Object} RefundArgs
 *  @property {string} providerRef @property {number} amount @property {string} idempotencyKey */
/** @typedef {Object} RefundResult
 *  @property {string} refundRef @property {'settled'|'initiated'|'failed'} status */

/** @typedef {Object} UnconfirmedPayment
 *  @property {string} intentKey @property {string} providerRef @property {number} amount
 *  @property {'success'|'failed'|'pending'} status */
```

**Webhook (IPN) specifics**
- PayFast posts `application/x-www-form-urlencoded`. **Signature verification:** recompute the MD5 (or vendor-current) signature over the posted params in PayFast's prescribed order using the merchant passphrase; reject on mismatch → `401` + admin alert (§3.4). Also (recommended) validate the source IP / server-confirmation callback per PayFast docs.
- On verified `payment.success`: the webhook handler runs the **single `$transaction`** that moves the appointment `slot_locked→confirmed`, snapshots `feeAtBooking` (#6), and writes the `payments` row (#2). `gatewayFee` from the IPN is stored and drives refund math; if absent, the `settings` fallback applies (policy #5).
- `notifyUrl` = `${APP_BASE_URL}/api/webhooks/payfast`.

---

## 2. VideoProvider (Daily.co) — module 9

```js
/**
 * @typedef {Object} VideoProvider
 * @property {(appointmentId: string) => Promise<VideoRoom>} createRoom
 *   One isolated room per appointment (identity tied to the appointment).
 * @property {(args: TokenArgs) => Promise<{ token: string, expiresAt: string }>} issueToken
 *   Time-bound participant token scoped to the slot window.
 */

/** @typedef {Object} VideoRoom @property {string} roomName @property {string} roomUrl */

/** @typedef {Object} TokenArgs
 *  @property {string} roomName
 *  @property {'patient'|'doctor'} role
 *  @property {string} notBeforeIso  // slot-start − 10 min
 *  @property {string} notAfterIso   // slot-end + 5 min (hard cutoff)
 *  @property {string} displayName */
```

**Participant events** (Daily webhook → `POST /api/webhooks/daily`, feeds the evaluation worker):
```json
{ "type": "participant.joined" | "participant.left",
  "room": "appt_<id>", "user_name": "...", "timestamp": "ISO-8601" }
```
The worker maps join/leave to no-show resolution (doctor vs patient absent at slot+15m). **Transient drops do not finalize** `completed` (edge #22); **missing participant data → non-penalizing terminal + admin alert** (§10). Tokens are browser-only; the platform never proxies media.

---

## 3. EmailProvider (Resend) — module 13

```js
/**
 * @typedef {Object} EmailProvider
 * @property {(args: SendArgs) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => BounceEvent} parseWebhook  // bounce/complaint
 */
/** @typedef {Object} SendArgs
 *  @property {EmailTemplate} template @property {string} to @property {Record<string,*>} vars */
/** @typedef {Object} BounceEvent
 *  @property {'bounce'|'complaint'|'delivered'} type @property {string} to @property {string} providerId */
```

### 3.1 Email catalog — the 6 triggers (§3.4, P4)
Retry/backoff lives in the notification worker (`CONFIG.md §3`); **no PDF attachments in v1** — links to the dashboard. Merge-vars are the data contract; final copy is M4.

| `EmailTemplate` | Trigger | Merge vars |
|---|---|---|
| `booking_confirmation` | `→confirmed` | `patientName, doctorName, slotStartLocal, fee, dashboardUrl` |
| `reminder_24h` | 24 h before slot (skipped for short-lead) | `patientName, doctorName, slotStartLocal, joinUrl` |
| `reminder_1h` | 1 h before slot (skipped for short-lead) | same as `reminder_24h` |
| `prescription_ready` | `→prescription_issued` | `patientName, doctorName, prescriptionUrl` |
| `refund_confirmation` | refund `settled` | `patientName, amount, refundRef, appointmentRef` |
| `cancellation_apology` | `doctor_cancelled` / `doctor_no_show` | `patientName, doctorName, slotStartLocal, refundAmount` |

**Reminder invalidation (§3.4):** the worker re-checks appointment state immediately before dispatch and **suppresses** any reminder for an appointment no longer `confirmed`/`in_progress`.

---

## 4. Analytics event catalog (module 18, KPI #1/#3)

Ingested at `POST /api/analytics/events` as `{ type, networkType?, meta? }`. `networkType` (e.g. `"3g"`, `"4g"`, `"wifi"`) backs the 3G-success KPI.

| `type` | Fired when | `meta` |
|---|---|---|
| `landing_view` | P-01 loads | `{ referrer? }` |
| `booking_started` | patient locks a slot | `{ doctorId }` |
| `booking_confirmed` | `→confirmed` | `{ doctorId, fee }` |
| `video_join_attempt` | Join Call clicked | `{ appointmentId, role }` |
| `video_join_success` | participant token accepted / media up | `{ appointmentId, role, networkType }` |

> Keep the catalog closed: adding an event = adding a row here first, so the KPI dashboard and the emitter stay in lockstep (matches the single-source discipline of ARCHITECTURE.md §6b).

---

## 5. Error envelope (shared by all `/api`, repeated from `API.md §1.1`)
```json
{ "error": { "code": "SCREAMING_SNAKE", "message": "display-safe", "details": {} } }
```
Webhook handlers return `200` only after signature verify + durable handling; invalid signature → `401` + admin alert.
