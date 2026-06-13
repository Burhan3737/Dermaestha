# Slice H · S1 — PayFast Pakistan Adapter — Design

| Field      | Value |
| ---------- | ----- |
| Date       | 2026-06-13 |
| Status     | Approved (brainstorming output); plan + build pending |
| Slice      | H of 8 — sub-slice S1 of 7 (S1 PayFast · S2 Daily.co · S3 video UI · S4 landing+legal · S5 email copy · S6 foundation+hardening · S7 E2E/QA gate) |
| Depends on | Slice G — merged to `main` (server + client suites green). Independent of all other S-sub-slices. |
| Canon refs | F04 (payment), F06.03 (refund retry), F04.03 (reconciliation); doc 02 §3.3 #2/#5/#6/#10; doc 05 §F04 webhook/route table; doc 14 §1–2 (PaymentProvider contract + PayFast payload shapes); doc 15 §PayFast env; glossary `feeAtBooking`, `Refund idempotency key` |

---

## 0. Decision provenance (read first)

The gateway is **PayFast *Pakistan*** (`payfast.pk` / `gopayfast.com`, IPG host `apps.net.pk`) — a different company from PayFast South Africa (`payfast.co.za`), which the current doc 14/15 + env vars wrongly assume. The PK API was **researched, not vendor-confirmed** (no merchant docs in hand; the official docs are Cloudflare-gated). The user chose: research-and-flag, build the confirmed happy path now, degrade refund + status-query to manual-admin. **Every external detail below carries a confidence level; LOW/UNVERIFIED items are gated behind the §8 merchant-verification checklist before go-live.**

PayFast PK at a glance (vs. the SA model our code inherited):

| Aspect | PayFast Pakistan (this design) | PayFast SA (what docs assumed — discard) |
| --- | --- | --- |
| Init flow | `GetAccessToken` → form-POST `PostTransaction` (hosted page) | direct form-POST to `/eng/process` |
| Auth | Bearer access token (from `MERCHANT_ID`+`SECURED_KEY`) | `merchant_id`+`merchant_key` |
| Signature | `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)`, **no passphrase** [LOW conf] | MD5 over all fields + `passphrase` |
| Amount unit | **rupees** decimal (`1000.00`) | rand decimal |
| Confirmation | browser redirect + `CHECKOUT_URL` callback [IPN contract UNVERIFIED] | server ITN + `/eng/query/validate` postback |
| Refund API | **not confirmed to exist** — likely portal-only | documented |
| Status query | **not confirmed to exist** | documented |
| Host | `ipguat.apps.net.pk` (UAT) / `ipg1.apps.net.pk` (live) | `payfast.co.za` |

---

## 1. Scope & goals

**Goal:** a production-ready `payfast.js` implementing the existing `PaymentProvider` contract against PayFast Pakistan, so launch is keys-only; refund + status-query degrade cleanly to an operator-assisted manual workflow when the vendor exposes no API for them.

**In scope**
1. **`server/src/integrations/payment/payfast.js`** — real adapter implementing all `PaymentProvider` methods (§2) plus a new `verifyReturn`.
2. **Contract extension (doc 14):** add `verifyReturn(req)` to the `PaymentProvider` typedef; add `'manual_required'` to `RefundResult.status`.
3. **Dual-channel confirmation (§3):** a new return-verification route alongside the existing `CHECKOUT_URL` webhook; both funnel into the unchanged `confirmPaidAppointment`.
4. **Caller degradation (§4):** `initiateRefund`, `refundInFull`, and `reconcileOne` handle `manual_required`/`unknown` quietly (single alert, no retry-spin).
5. **Admin backend hook (§5):** `POST /api/admin/payments/:appointmentId/record-refund` (UI deferred to S6).
6. **Config (§6):** env-var rework + provider selection gains `payfast`.
7. **Tests (§7):** HTTP-mocked unit tests (mirror `resend.js`), caller-branch tests, all existing suites stay green.
8. **Merchant-verification checklist (§8):** the only-PayFast-can-answer items, as an explicit launch gate.

**Out of scope**
- Admin **UI** for manual refunds / stuck-payment review (→ S6 foundation+hardening).
- Live/sandbox integration tests requiring real credentials (→ §8 checklist, manual verification).
- The dev `payfast.mock` / `payfast.stub` paths — **retained unchanged**; `mock` stays the dev/CI default.
- Daily.co adapter (→ S2). Analytics emits (→ owning feature slices).
- Implementing a real refund/status API **now** (the upgrade seam is documented; activated only if §8 confirms an API exists).

**Success criteria**
1. Existing server + client suites stay green; every new behavior lands test-first.
2. `createCheckout` produces a signed `PostTransaction` handoff against the sandbox host, with `TXNAMT` correctly rupee-converted and the signature computed over the documented fields.
3. A signed callback **and** a signed browser-return each independently drive `slot_locked→confirmed` exactly once (idempotent under both arriving).
4. A bad signature on either channel → `401` + `payment.webhook_rejected` audit; no state change.
5. A cancellation refund in prod records `refundStatus='manual_required'`, raises exactly one `payment.refund_manual_required` alert, schedules **no** retry, and emails the patient once.
6. `POST …/record-refund` settles a manual refund idempotently (re-POST is a no-op) and emails `refund_confirmation`.
7. `PAYMENT_PROVIDER=payfast` selects the real adapter; `mock`/`stub` behavior is unchanged.

---

## 2. The adapter — `payfast.js` (PaymentProvider implementation)

Base URL by `PAYFAST_MODE`: `https://ipguat.apps.net.pk/Ecommerce/api/Transaction/` (sandbox) / `https://ipg1.apps.net.pk/Ecommerce/api/Transaction/` (live). HTTP via `fetch`, mirroring `resend.js`; non-2xx → `AppError`. Signature computation, base URLs, and field lists live behind named constants/helpers so a single correction lands cleanly once §8 confirms the official spec.

**`createCheckout({ appointmentId, intentKey, amount, returnUrl, cancelUrl, notifyUrl })`** → `{ redirectUrl, providerRef }`
- `POST GetAccessToken` with `MERCHANT_ID` + `SECURED_KEY` (+ `BASKET_ID`, `TXNAMT`, `CURRENCY_CODE=PKR`, `grant_type=client_credentials`) → `TOKEN`. [LIKELY]
- Build the `PostTransaction` form: `MERCHANT_ID`, `MERCHANT_NAME`, `TOKEN`, `PROCCODE=00`, `TXNAMT = (amount/100).toFixed(2)` (**paisa→rupees**), `CURRENCY_CODE=PKR`, `BASKET_ID = appointmentId`, `TXNDESC`, `SUCCESS_URL = returnUrl`, `FAILURE_URL = cancelUrl`, `CHECKOUT_URL = notifyUrl`, `SIGNATURE = md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)`. [field list CONFIRMED via SDKs; required-set + signature LOW]
- **`providerRef = appointmentId`** (our `BASKET_ID` correlation key the callback echoes). The handoff is returned as a `redirectUrl` to an app-served auto-submit page (PayFast PK expects a browser form-POST, not a GET redirect) **or** a direct redirect if a GET handoff is confirmed — resolved at §8. The gateway's own transaction id, when present in the callback, is stored in `Payment.meta` (non-authoritative).

**`verifyWebhook(req)`** (the `CHECKOUT_URL` server callback; `application/x-www-form-urlencoded`) → `WebhookResult`
- Recompute `md5(...)`, compare to the posted `signature`; mismatch → `AppError('INVALID_SIGNATURE', …, 401)`.
- Map `code`/`status` (`00`/`completed`/`success` → `payment.success`; else `payment.failed`), `providerRef = BASKET_ID`, `amount = round(rupees*100)` (**rupees→paisa**), `gatewayFee = null` (PK reports none → Settings fallback, policy #5).

**`verifyReturn(req)`** *(new)* — same verify+parse for the browser `SUCCESS_URL`/`FAILURE_URL` return params. Identical output shape. Used by the §3 return route.

**`refund({ providerRef, amount, idempotencyKey })`** → `{ status: 'manual_required', refundRef: null }` (prod). No network call, no throw. Upgrade seam (`// TODO(payfast-refund-api): if §8 confirms an endpoint, implement here`) documented inline.

**`queryPaymentStatus({ providerRef })`** → `{ status: 'unknown' }` (prod). Upgrade seam documented inline.

**`listUnconfirmed(sinceIso)`** → `[]` (no bulk-query API; `reconcileOne` uses `queryPaymentStatus`, so this stays vestigial as in the mock).

---

## 3. Dual-channel confirmation

Two thin Express entrypoints, **one** confirmation core (the existing idempotent `confirmPaidAppointment`; `processWebhook` already guards `state==='confirmed'` → safe under both channels firing):

```
browser → SUCCESS_URL (/pay/return) ──→ client POSTs params → POST /api/payments/verify-return
                                                                   │ adapter.verifyReturn → processWebhook
PayFast → CHECKOUT_URL ──────────────→ POST /api/webhooks/payfast ─┘ adapter.verifyWebhook → processWebhook
                                                                   ▲ backstop: hourly reconcileUnconfirmed + manual-admin
```
- `POST /api/webhooks/payfast` — existing controller, unchanged shape (calls `verifyWebhook`).
- `POST /api/payments/verify-return` — **new**, patient-session route; the P-07 return page posts the gateway return params; controller calls `verifyReturn` → `processWebhook`. Bad signature → `401` + `payment.webhook_rejected` audit (same as the webhook).
- **Trust note:** if §8 confirms the signature carries no secret, the browser-return channel alone is integrity-only; the `CHECKOUT_URL` server callback and reconciliation remain the load-bearing confirmation. Both channels are verified identically; neither can double-confirm (single writer + idempotency guard).

---

## 4. Caller degradation (quiet, not noisy)

- **`RefundResult.status`** gains `'manual_required'` (doc 14 typedef + any code union).
- **`initiateRefund`** (cancellation refunds, `appointment/service.js`): on `manual_required` → `refundStatus='manual_required'`, `nextRefundRetryAt=null` (**no retry scheduled**), `refundIdempotencyKey` set, audit `payment.refund_manual_required`, enqueue `refund_delayed` email **once**. (Replaces the backoff/exhaustion spin for this status only; gateway-error retries are unchanged.)
- **`refundInFull`** (edge #6a, `payment/service.js`): on `manual_required` → still `deleteMany` the stale `slot_locked` lock, set `refundStatus='manual_required'`, audit `payment.reconciliation_refund` (manual note). Money was captured at the gateway; admin completes the refund in-portal.
- **`reconcileOne`**: `queryPaymentStatus='unknown'` (always, in prod) for a payment older than the reconciliation window → audit `payment.manual_review_required` **once** (idempotent via a `Payment` flag/`meta` marker) so it surfaces in the F12 alert feed; otherwise leave for the next pass. (No behavior change for the mock/test path, which stubs richer statuses.)

---

## 5. Admin backend hook (UI deferred to S6)

**`POST /api/admin/payments/:appointmentId/record-refund`** — `requireRole('admin')`, body `{ refundRef: string, amount?: number }`.
- Loads the success payment for the appointment; sets `refundRef`, `refundStatus='settled'`, `refundIdempotencyKey = rf_<appointmentId>` (reused). **Idempotent**: if already `settled` with that key, no-op `200`.
- Audit `payment.manual_refund_recorded` (`meta: { refundRef, amount }`). Enqueue `refund_confirmation` email.
- This is the glossary's "admin out-of-band gateway action" the idempotency key was designed for. Lives in `server/src/modules/admin/` (service + controller + route + test). No client view in S1.

---

## 6. Config & provider selection

**`env.js` (Zod) + doc 15 §PayFast:**
- **Add:** `PAYFAST_SECURED_KEY` (string, optional), `PAYFAST_MERCHANT_NAME` (string, optional), `PAYFAST_STORE_ID` (string, optional), `PAYFAST_MODE` (`z.enum(['sandbox','live']).default('sandbox')`).
- **Change:** `PAYMENT_PROVIDER` enum → `['stub','mock','payfast']`.
- **Retain:** `PAYFAST_MERCHANT_ID`; `PAYFAST_PASSPHRASE` (now documented as **dev-mock signing only**).
- **Drop:** `PAYFAST_MERCHANT_KEY` (SA-only; never used by PK) — remove from doc 15.

**`integrations/payment/index.js`:** `payfast → payfastReal`, `mock → payfastMock`, else `payfastStub`. (Real adapter reads `PAYFAST_MODE` for base URL.)

---

## 7. Testing

- **Adapter unit tests** (`payfast.test.js`, `fetch` mocked like `resend.js`'s test): `GetAccessToken` request shape + auth; `PostTransaction` form fields + signature string; `verifyWebhook`/`verifyReturn` good-signature parse (incl. rupee→paisa) and bad-signature → 401; `refund → manual_required` (no fetch); `queryPaymentStatus → unknown`. **No live network.**
- **Caller tests:** `initiateRefund` `manual_required` branch (no retry, one alert, one email); `refundInFull` `manual_required` branch (lock deleted, status set); `reconcileOne` stuck-payment alert.
- **Admin test:** `record-refund` happy path + idempotent re-POST + audit + email enqueue.
- **Regression:** full `npm test` (server+shared) + `npm --workspace client test` green; the mock/stub paths and all Slice C/E payment tests unchanged.

---

## 8. Pre-launch merchant-verification checklist (launch gate)

Ships in this spec and is mirrored into doc 07 (risks/open-questions) + doc 10 (deploy steps). Go-live is blocked until the merchant/PayFast confirms:
1. **Official signature algorithm** — exact field list + order; confirm `md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)` and whether any secret participates.
2. **`CHECKOUT_URL` IPN contract** — does PayFast POST server-to-server? payload, content-type, verification, source IP ranges.
3. **Refund API existence** — if yes: endpoint/params/idempotency → implement the `refund()` seam. If no: confirm portal-only (manual workflow stands).
4. **Status-query API existence** — if yes → implement the `queryPaymentStatus()` seam (re-enabling auto-reconciliation).
5. **Sandbox credentials + test cards/wallets**; **production** `MERCHANT_ID` / `SECURED_KEY` / `MERCHANT_NAME` / `STORE_ID`.
6. **Confirmed production base URLs + paths**; any account-specific ("country-wise") differences.
7. **Amount unit/precision** confirmation (rupees decimal; rounding rules).

---

## 9. Spec-doc impact (tracked; applied at task end with approval, per governance)

| Doc | Change |
| --- | --- |
| 14 | PayFast section rewritten SA→PK (flow, auth, signature, IPN, amount units); `PaymentProvider` typedef +`verifyReturn`; `RefundResult.status` +`manual_required`; mark external shapes researched-not-confirmed |
| 15 | §PayFast env-var rework (§6 above) |
| 05 | New routes: `POST /api/payments/verify-return`, `POST /api/admin/payments/:appointmentId/record-refund` |
| 07 | PayFast-PK verification risks + open questions (§8 checklist) |
| 11 | New ADR — "PayFast PK adapter: dual-channel confirmation + manual refund/reconcile fallback + researched-API risk" |
| 04 | Confirm whether `Payment.refundStatus` is an enum (add `manual_required`) or free string (no migration) |
| 13 | Status tracker: payment adapter → Built (PK); workers' manual-degradation note |

---

## Revision footer

| Date | Change | Why |
| --- | --- | --- |
| 2026-06-13 | Initial creation | Slice H · S1 brainstorming output (approved) |
