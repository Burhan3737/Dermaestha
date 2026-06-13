# Slice H · S1 — PayFast Pakistan Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a production-ready PayFast *Pakistan* payment adapter implementing the existing `PaymentProvider` contract, with dual-channel confirmation (server callback + browser return) and clean manual-admin degradation for refund/status-query, so launch is keys-only.

**Architecture:** A new real adapter `payfast.js` (HTTP via `fetch`, mirroring `resend.js`) sits behind the `PaymentProvider` typedef. All PayFast-PK externals (base URLs, signature algorithm, field lists) live behind named constants/helpers — a single correction lands once the §8 merchant checklist is confirmed. The contract gains `verifyReturn`; `RefundResult.status` gains `manual_required`. Callers (`initiateRefund`, `refundInFull`, `reconcileOne`) degrade quietly to operator-assisted workflows. A new admin backend hook records out-of-band manual refunds idempotently.

**Tech Stack:** Node 20 ESM, Express, Prisma 6.19.x (Postgres), Zod, Vitest, `crypto` (md5), global `fetch`.

**HARD constraints (apply to every step):** DO NOT touch `agentChangeLogs/`, the design specs under `docs/superpowers/specs/`, or the canonical specs `docs/specification/` (00–15). Spec edits are tracked in Task 8 only. The `payfast.mock`/`payfast.stub` dev paths stay behaviorally unchanged (mock remains the dev/CI default).

---

## File Structure

| File | Responsibility | Action |
| --- | --- | --- |
| `prisma/schema.prisma` | Add `manual_required` to the `RefundStatus` enum | Modify |
| `prisma/migrations/<ts>_slice_h_refund_manual_required/migration.sql` | Apply the enum value to the DB | Create (via `prisma migrate dev`) |
| `server/src/config/env/env.js` | New PayFast env vars; `PAYMENT_PROVIDER` enum gains `payfast` | Modify |
| `server/src/config/env/env.test.js` | Cover new env vars | Modify |
| `.env.example` | Document new env vars; drop `PAYFAST_MERCHANT_KEY` | Modify |
| `server/src/integrations/payment/payfast.js` | Real PayFast-PK adapter | Create |
| `server/src/integrations/payment/payfast.test.js` | HTTP-mocked adapter unit tests | Create |
| `server/src/integrations/payment/index.js` | Contract typedef (`verifyReturn`, `manual_required`) + 3-way provider selection | Modify |
| `server/src/integrations/payment/payfast.mock.js` | Add `verifyReturn` (delegates to existing verify) — behavior unchanged | Modify |
| `server/src/integrations/payment/payfast.stub.js` | Add `verifyReturn` (throws NOT_IMPLEMENTED) | Modify |
| `server/src/modules/payment/controller.js` | New `verifyReturn` route handler | Modify |
| `server/src/modules/payment/index.js` | New `paymentReturnRouter` | Modify |
| `server/src/modules/payment/controller.test.js` | verify-return controller tests | Create |
| `server/src/routes.js` | Mount `/api/payments` return router | Modify |
| `server/src/modules/appointment/service.js` | `initiateRefund` manual_required branch | Modify |
| `server/src/modules/appointment/test.js` | initiateRefund manual_required test | Modify |
| `server/src/modules/payment/service.js` | `refundInFull` + `reconcileOne` manual degradation | Modify |
| `server/src/modules/payment/test.js` | refundInFull manual + reconcile manual-review tests | Modify |
| `shared/schemas/admin/admin.js` | `recordRefundSchema` | Modify |
| `server/src/modules/admin/service.js` | `recordManualRefund` | Modify |
| `server/src/modules/admin/controller.js` | `recordRefund` handler | Modify |
| `server/src/modules/admin/index.js` | record-refund route | Modify |
| `server/src/modules/admin/test.js` | record-refund tests | Modify |

**Baseline (confirmed before starting):** `npm test` → 248 passed (34 files). `npm --workspace client test` not yet re-baselined here; it is regression-only for S1 (no client changes).

---

## Task 1: Schema — `manual_required` refund status

**Files:**
- Modify: `prisma/schema.prisma:66-71` (enum `RefundStatus`)
- Create: `prisma/migrations/<timestamp>_slice_h_refund_manual_required/migration.sql`

`RefundStatus` is a Postgres enum (`initiated|retrying|settled|failed`). The integration tests run against a real DB, so setting `refundStatus='manual_required'` requires the enum value to exist in the DB.

- [ ] **Step 1: Add the enum value**

In `prisma/schema.prisma`, change:

```prisma
enum RefundStatus {
  initiated
  retrying
  settled
  failed
}
```

to:

```prisma
enum RefundStatus {
  initiated
  retrying
  settled
  failed
  manual_required
}
```

- [ ] **Step 2: Generate + apply the migration**

Run: `npx prisma migrate dev --name slice_h_refund_manual_required`
Expected: a new migration dir is created containing `ALTER TYPE "RefundStatus" ADD VALUE 'manual_required';`, applied to the dev DB, and the Prisma client regenerated.

Fallback if `migrate dev` fails on a shadow-DB permission issue: create the migration dir manually with that single `ALTER TYPE` statement, then `npx prisma migrate deploy` and `npx prisma generate`.

- [ ] **Step 3: Verify the migration SQL**

Run: `cat prisma/migrations/*slice_h_refund_manual_required*/migration.sql`
Expected: contains `ALTER TYPE "RefundStatus" ADD VALUE 'manual_required';`

- [ ] **Step 4: Confirm the suite still passes**

Run: `npm test`
Expected: 248 passed (no regression from the schema change alone).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(payment): add manual_required to RefundStatus enum (Slice H S1)"
```

---

## Task 2: Config — PayFast env vars + provider selection

**Files:**
- Modify: `server/src/config/env/env.js:4-22`
- Test: `server/src/config/env/env.test.js`
- Modify: `.env.example:17-22`

- [ ] **Step 1: Write the failing env test**

Add to `server/src/config/env/env.test.js`, inside the `describe('parseEnv', ...)`:

```js
  it('accepts payfast as a PAYMENT_PROVIDER and defaults PAYFAST_MODE to sandbox', () => {
    const env = parseEnv({ ...base, PAYMENT_PROVIDER: 'payfast' });
    expect(env.PAYMENT_PROVIDER).toBe('payfast');
    expect(env.PAYFAST_MODE).toBe('sandbox');
  });
  it('accepts the new PayFast vars and a live mode override', () => {
    const env = parseEnv({
      ...base,
      PAYFAST_SECURED_KEY: 'sk_x',
      PAYFAST_MERCHANT_NAME: 'Dermestha',
      PAYFAST_STORE_ID: 'store_1',
      PAYFAST_MODE: 'live',
    });
    expect(env.PAYFAST_SECURED_KEY).toBe('sk_x');
    expect(env.PAYFAST_MERCHANT_NAME).toBe('Dermestha');
    expect(env.PAYFAST_STORE_ID).toBe('store_1');
    expect(env.PAYFAST_MODE).toBe('live');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/config/env/env.test.js`
Expected: FAIL — `PAYMENT_PROVIDER` enum rejects `'payfast'`; `PAYFAST_MODE`/`PAYFAST_SECURED_KEY` undefined.

- [ ] **Step 3: Update the Zod schema**

In `server/src/config/env/env.js`, replace the PayFast/payment lines:

```js
  PAYFAST_MERCHANT_ID: z.string().optional(),
  PAYFAST_PASSPHRASE: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['stub', 'mock']).default('stub'),
```

with:

```js
  PAYFAST_MERCHANT_ID: z.string().optional(),
  PAYFAST_SECURED_KEY: z.string().optional(),
  PAYFAST_MERCHANT_NAME: z.string().optional(),
  PAYFAST_STORE_ID: z.string().optional(),
  // Dev-mock signing only (ADR-22). Real PayFast PK signature does not use a passphrase.
  PAYFAST_PASSPHRASE: z.string().optional(),
  PAYFAST_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYMENT_PROVIDER: z.enum(['stub', 'mock', 'payfast']).default('stub'),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/src/config/env/env.test.js`
Expected: PASS (all env tests).

- [ ] **Step 5: Update `.env.example`**

Replace lines 17–22 of `.env.example`:

```
# ─── PayFast (payment adapter) ──────────────────────────────────────────────
PAYFAST_MERCHANT_ID=
PAYFAST_MERCHANT_KEY=
PAYFAST_PASSPHRASE=                        # used for IPN signature verification
PAYFAST_MODE=sandbox                       # sandbox | live
PAYMENT_PROVIDER=stub                      # stub (prod, not yet wired) | mock (dev simulated gateway)
```

with (note: `PAYFAST_MERCHANT_KEY` removed — PayFast SA-only, never used by PK):

```
# ─── PayFast Pakistan (payment adapter) ─────────────────────────────────────
PAYFAST_MERCHANT_ID=
PAYFAST_SECURED_KEY=                        # PayFast PK GetAccessToken credential
PAYFAST_MERCHANT_NAME=                      # used in the PayFast PK signature
PAYFAST_STORE_ID=                           # optional; account-specific
PAYFAST_PASSPHRASE=                         # dev-mock IPN signing only (PAYMENT_PROVIDER=mock); real PK signature uses no passphrase
PAYFAST_MODE=sandbox                        # sandbox | live (selects the IPG base URL)
PAYMENT_PROVIDER=stub                       # stub (prod placeholder, throws) | mock (dev sim) | payfast (real PK adapter)
```

- [ ] **Step 6: Commit**

```bash
git add server/src/config/env/env.js server/src/config/env/env.test.js .env.example
git commit -m "feat(config): PayFast PK env vars + payfast provider option (Slice H S1)"
```

---

## Task 3: The real adapter `payfast.js`

**Files:**
- Create: `server/src/integrations/payment/payfast.js`
- Test: `server/src/integrations/payment/payfast.test.js`

Implements the `PaymentProvider` contract against PayFast Pakistan per design §2. All externals behind named constants/helpers (RESEARCHED, not vendor-confirmed — see doc 07 §8 checklist). Mirrors `resend.js`: `fetch`, non-2xx → `AppError`.

- [ ] **Step 1: Write the failing adapter test**

Create `server/src/integrations/payment/payfast.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('../../config/env/env.js', () => ({
  env: {
    PAYFAST_MERCHANT_ID: 'M123',
    PAYFAST_SECURED_KEY: 'sk_secret',
    PAYFAST_MERCHANT_NAME: 'Dermestha',
    PAYFAST_MODE: 'sandbox',
    APP_BASE_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

import { payfastReal } from './payfast.js';

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

describe('payfastReal.createCheckout', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('GetAccessToken posts merchant+secured key, then builds a signed PostTransaction handoff (paisa→rupees)', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ ACCESS_TOKEN: 'tok_1' }) });
    const out = await payfastReal.createCheckout({
      appointmentId: 'appt_1',
      amount: 250000, // paisa
      returnUrl: 'http://localhost:3000/pay/return?appt=appt_1',
      cancelUrl: 'http://localhost:3000/book/d1',
      notifyUrl: 'http://localhost:3000/api/webhooks/payfast',
    });

    // 1. GetAccessToken request shape + auth
    const [tokenUrl, tokenInit] = fetch.mock.calls[0];
    expect(tokenUrl).toBe('https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken');
    const tokenBody = new URLSearchParams(tokenInit.body);
    expect(tokenBody.get('MERCHANT_ID')).toBe('M123');
    expect(tokenBody.get('SECURED_KEY')).toBe('sk_secret');
    expect(tokenBody.get('TXNAMT')).toBe('2500.00'); // 250000 paisa → rupees
    expect(tokenBody.get('CURRENCY_CODE')).toBe('PKR');
    expect(tokenBody.get('BASKET_ID')).toBe('appt_1');

    // 2. providerRef == appointmentId (BASKET_ID correlation key)
    expect(out.providerRef).toBe('appt_1');

    // 3. PostTransaction handoff carries the signed field set
    const url = new URL(out.redirectUrl);
    expect(url.origin + url.pathname).toBe(
      'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/PostTransaction',
    );
    expect(url.searchParams.get('TOKEN')).toBe('tok_1');
    expect(url.searchParams.get('MERCHANT_ID')).toBe('M123');
    expect(url.searchParams.get('MERCHANT_NAME')).toBe('Dermestha');
    expect(url.searchParams.get('TXNAMT')).toBe('2500.00');
    expect(url.searchParams.get('BASKET_ID')).toBe('appt_1');
    expect(url.searchParams.get('PROCCODE')).toBe('00');
    expect(url.searchParams.get('CURRENCY_CODE')).toBe('PKR');
    expect(url.searchParams.get('SUCCESS_URL')).toBe('http://localhost:3000/pay/return?appt=appt_1');
    expect(url.searchParams.get('FAILURE_URL')).toBe('http://localhost:3000/book/d1');
    expect(url.searchParams.get('CHECKOUT_URL')).toBe('http://localhost:3000/api/webhooks/payfast');
    // signature = md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID)
    expect(url.searchParams.get('SIGNATURE')).toBe(md5('M123:Dermestha:2500.00:appt_1'));
  });

  it('maps a non-2xx GetAccessToken to PAYMENT_INIT_FAILED (502)', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(
      payfastReal.createCheckout({
        appointmentId: 'appt_1',
        amount: 250000,
        returnUrl: 'r',
        cancelUrl: 'c',
        notifyUrl: 'n',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_INIT_FAILED', status: 502 });
  });
});

describe('payfastReal.verifyWebhook / verifyReturn', () => {
  const goodBody = () => {
    const TXNAMT = '2500.00';
    const BASKET_ID = 'appt_1';
    return {
      MERCHANT_ID: 'M123',
      MERCHANT_NAME: 'Dermestha',
      TXNAMT,
      BASKET_ID,
      err_code: '00',
      SIGNATURE: md5(`M123:Dermestha:${TXNAMT}:${BASKET_ID}`),
    };
  };

  it('verifyWebhook parses a good signature and converts rupees→paisa', () => {
    const out = payfastReal.verifyWebhook({ body: goodBody() });
    expect(out).toMatchObject({
      event: 'payment.success',
      providerRef: 'appt_1',
      amount: 250000, // 2500.00 rupees → paisa
      gatewayFee: null,
    });
  });

  it('verifyReturn parses the browser-return params identically', () => {
    const out = payfastReal.verifyReturn({ body: goodBody() });
    expect(out).toMatchObject({ event: 'payment.success', providerRef: 'appt_1', amount: 250000 });
  });

  it('a non-success code maps to payment.failed', () => {
    const b = goodBody();
    b.err_code = '999';
    b.SIGNATURE = md5(`M123:Dermestha:${b.TXNAMT}:${b.BASKET_ID}`);
    expect(payfastReal.verifyWebhook({ body: b }).event).toBe('payment.failed');
  });

  it('a bad signature throws INVALID_SIGNATURE (401) on both channels', () => {
    const b = goodBody();
    b.SIGNATURE = 'deadbeef';
    expect(() => payfastReal.verifyWebhook({ body: b })).toThrowError(
      expect.objectContaining({ code: 'INVALID_SIGNATURE', status: 401 }),
    );
    expect(() => payfastReal.verifyReturn({ body: b })).toThrowError(
      expect.objectContaining({ code: 'INVALID_SIGNATURE', status: 401 }),
    );
  });
});

describe('payfastReal manual-degraded methods (no network)', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('refund returns manual_required without a network call or throw', async () => {
    const out = await payfastReal.refund({ providerRef: 'appt_1', amount: 1000, idempotencyKey: 'rf_appt_1' });
    expect(out).toEqual({ status: 'manual_required', refundRef: null });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('queryPaymentStatus returns unknown without a network call', async () => {
    const out = await payfastReal.queryPaymentStatus({ providerRef: 'appt_1' });
    expect(out).toEqual({ status: 'unknown' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('listUnconfirmed returns an empty list', async () => {
    expect(await payfastReal.listUnconfirmed('2026-01-01T00:00:00Z')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/integrations/payment/payfast.test.js`
Expected: FAIL — `payfast.js` does not exist.

- [ ] **Step 3: Implement the adapter**

Create `server/src/integrations/payment/payfast.js`:

```js
// @ts-check
import crypto from 'node:crypto';
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';

/*
 * PayFast PAKISTAN IPG adapter (payfast.pk / gopayfast.com).
 *
 * RESEARCHED, NOT vendor-confirmed. Every external detail below — base URLs, the
 * GetAccessToken→PostTransaction flow, the signature field list/order, and the callback
 * field names — is gated behind the doc 07 §8 merchant-verification checklist before go-live.
 * It all lives behind named constants/helpers so a single correction lands once PayFast
 * confirms the official spec. DO NOT invent endpoints/fields beyond the design spec.
 */

const BASE_URLS = {
  sandbox: 'https://ipguat.apps.net.pk/Ecommerce/api/Transaction/',
  live: 'https://ipg1.apps.net.pk/Ecommerce/api/Transaction/',
};
const CURRENCY_CODE = 'PKR';
const PROCCODE = '00';
// Callback status values that mean "paid" [field name + values UNVERIFIED — §8 #2].
const SUCCESS_CODES = new Set(['00', '000', 'completed', 'success']);

/** IPG base URL for the active mode. */
const baseUrl = () => BASE_URLS[env.PAYFAST_MODE] ?? BASE_URLS.sandbox;

/** paisa (int) → PKR rupees decimal string, e.g. 250000 → "2500.00". */
const paisaToRupees = (paisa) => (Number(paisa) / 100).toFixed(2);
/** PKR rupees decimal → integer paisa, e.g. "2500.00" → 250000. */
const rupeesToPaisa = (rupees) => Math.round(Number(rupees) * 100);

/** PayFast PK signature: md5(MERCHANT_ID:MERCHANT_NAME:TXNAMT:BASKET_ID) [LOW conf — §8 #1]. */
function signature({ merchantId, merchantName, txnAmt, basketId }) {
  return crypto
    .createHash('md5')
    .update(`${merchantId}:${merchantName}:${txnAmt}:${basketId}`)
    .digest('hex');
}

/** Shared verify+parse for the server callback (CHECKOUT_URL) and the browser return. */
function parseSignedResult(body) {
  const b = body ?? {};
  const txnAmt = b.TXNAMT ?? b.txnamt;
  const basketId = b.BASKET_ID ?? b.basket_id;
  const expected = signature({
    merchantId: env.PAYFAST_MERCHANT_ID,
    merchantName: env.PAYFAST_MERCHANT_NAME,
    txnAmt,
    basketId,
  });
  const posted = String(b.SIGNATURE ?? b.signature ?? '');
  if (!posted || posted.toLowerCase() !== expected.toLowerCase()) {
    throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed.', 401);
  }
  // Status field name UNVERIFIED — accept the researched candidates (§8 #2).
  const code = String(b.err_code ?? b.code ?? b.status ?? b.transaction_status ?? '').toLowerCase();
  return {
    event: SUCCESS_CODES.has(code) ? 'payment.success' : 'payment.failed',
    providerRef: basketId,
    intentKey: basketId, // PayFast PK echoes BASKET_ID; no separate intent key on the wire
    amount: rupeesToPaisa(txnAmt),
    gatewayFee: null, // PK reports none → Settings fallback (policy #5)
  };
}

/** @type {import('./index.js').PaymentProvider} */
export const payfastReal = {
  async createCheckout({ appointmentId, amount, returnUrl, cancelUrl, notifyUrl } = {}) {
    const merchantId = env.PAYFAST_MERCHANT_ID;
    const merchantName = env.PAYFAST_MERCHANT_NAME;
    const txnAmt = paisaToRupees(amount);
    const basketId = appointmentId;

    // 1. GetAccessToken (MERCHANT_ID + SECURED_KEY) [LIKELY — §8 #5].
    const tokenRes = await fetch(`${baseUrl()}GetAccessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        MERCHANT_ID: merchantId,
        SECURED_KEY: env.PAYFAST_SECURED_KEY,
        BASKET_ID: basketId,
        TXNAMT: txnAmt,
        CURRENCY_CODE,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenRes.ok) {
      throw new AppError('PAYMENT_INIT_FAILED', `PayFast GetAccessToken responded ${tokenRes.status}`, 502);
    }
    const tokenBody = await tokenRes.json();
    const token = tokenBody.ACCESS_TOKEN ?? tokenBody.token ?? tokenBody.TOKEN;

    // 2. Build the signed PostTransaction handoff field set [field list CONFIRMED via SDKs;
    //    required-set + signature LOW — §8 #1].
    const fields = {
      MERCHANT_ID: merchantId,
      MERCHANT_NAME: merchantName,
      TOKEN: token,
      PROCCODE,
      TXNAMT: txnAmt,
      CURRENCY_CODE,
      BASKET_ID: basketId,
      TXNDESC: `Dermestha appointment ${appointmentId}`,
      SUCCESS_URL: returnUrl,
      FAILURE_URL: cancelUrl,
      CHECKOUT_URL: notifyUrl,
      SIGNATURE: signature({ merchantId, merchantName, txnAmt, basketId }),
    };

    // The exact browser handoff (GET redirect vs an app-served auto-submit form-POST page) is
    // a §8 #6 open question. Until confirmed we return the signed PostTransaction endpoint with
    // the field set as query params; this is the single seam to correct when §8 resolves.
    const redirectUrl = `${baseUrl()}PostTransaction?${new URLSearchParams(fields)}`;
    return { redirectUrl, providerRef: basketId };
  },

  verifyWebhook(req) {
    return parseSignedResult(req?.body);
  },

  // New (design §2): same verify+parse for the browser SUCCESS_URL/FAILURE_URL return params.
  verifyReturn(req) {
    return parseSignedResult(req?.body);
  },

  async refund() {
    // PayFast PK exposes no confirmed refund API — degrade to manual admin settlement.
    // TODO(payfast-refund-api): if §8 #3 confirms an endpoint, implement the network call here.
    return { status: 'manual_required', refundRef: null };
  },

  async queryPaymentStatus() {
    // No confirmed status-query API — reconciliation surfaces these for manual review.
    // TODO(payfast-status-api): if §8 #4 confirms an endpoint, implement it here.
    return { status: 'unknown' };
  },

  async listUnconfirmed() {
    // No bulk-query API; reconcileOne uses queryPaymentStatus, so this stays vestigial.
    return [];
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/src/integrations/payment/payfast.test.js`
Expected: PASS (all adapter tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/payment/payfast.js server/src/integrations/payment/payfast.test.js
git commit -m "feat(payment): real PayFast PK adapter (createCheckout/verify/manual-degrade) (Slice H S1)"
```

---

## Task 4: Contract extension + 3-way provider selection

**Files:**
- Modify: `server/src/integrations/payment/index.js`
- Modify: `server/src/integrations/payment/payfast.mock.js`
- Modify: `server/src/integrations/payment/payfast.stub.js`

The contract gains `verifyReturn(req)` and `RefundResult.status` gains `manual_required`. Every implementation must satisfy the extended contract: the mock delegates `verifyReturn` to its existing verify logic (behavior unchanged); the stub throws `NOT_IMPLEMENTED` like its `verifyWebhook`.

- [ ] **Step 1: Extend the typedef + selection in `index.js`**

Replace the full contents of `server/src/integrations/payment/index.js`:

```js
// @ts-check
import { payfastStub } from './payfast.stub.js';
import { payfastMock } from './payfast.mock.js';
import { payfastReal } from './payfast.js';
import { env } from '../../config/env/env.js';

/**
 * @typedef {Object} PaymentProvider
 * @property {(args: any) => Promise<any>} createCheckout
 * @property {(req: import('express').Request) => any} verifyWebhook
 *   Verify + parse the CHECKOUT_URL server callback. THROWS on invalid signature (→ 401 + alert).
 * @property {(req: import('express').Request) => any} verifyReturn
 *   Verify + parse the browser SUCCESS_URL/FAILURE_URL return params. Same output shape as
 *   verifyWebhook. THROWS on invalid signature (→ 401 + alert).
 * @property {(args: any) => Promise<{ refundRef: string|null, status: 'settled'|'initiated'|'failed'|'manual_required' }>} refund
 * @property {(sinceIso: string) => Promise<any[]>} listUnconfirmed
 * @property {(args: { providerRef: string }) => Promise<{ status: 'paid'|'failed'|'unknown', amount?: number, gatewayFee?: number|null }>} queryPaymentStatus
 */

/** Selected provider: payfast → real PK adapter; mock → dev sim; else → throwing stub. */
export const paymentProvider =
  env.PAYMENT_PROVIDER === 'payfast'
    ? payfastReal
    : env.PAYMENT_PROVIDER === 'mock'
      ? payfastMock
      : payfastStub;
```

- [ ] **Step 2: Add `verifyReturn` to the mock**

In `server/src/integrations/payment/payfast.mock.js`, add a `verifyReturn` method immediately after `verifyWebhook` (delegates to it — no behavior change to the existing path):

```js
  verifyReturn(req) {
    return payfastMock.verifyWebhook(req);
  },
```

- [ ] **Step 3: Add `verifyReturn` to the stub**

In `server/src/integrations/payment/payfast.stub.js`, add to the exported object (after `verifyWebhook`):

```js
  verifyReturn: () => {
    throw new AppError('NOT_IMPLEMENTED', 'payfast.verifyReturn is M2', 501);
  },
```

- [ ] **Step 4: Run the payment + adapter suites**

Run: `npx vitest run server/src/integrations/payment server/src/modules/payment`
Expected: PASS (existing mock/stub/payment tests unchanged + new adapter tests green).

- [ ] **Step 5: Commit**

```bash
git add server/src/integrations/payment/index.js server/src/integrations/payment/payfast.mock.js server/src/integrations/payment/payfast.stub.js
git commit -m "feat(payment): extend PaymentProvider contract (verifyReturn, manual_required) + select payfast (Slice H S1)"
```

---

## Task 5: Dual-channel — `POST /api/payments/verify-return`

**Files:**
- Modify: `server/src/modules/payment/controller.js`
- Modify: `server/src/modules/payment/index.js`
- Test: `server/src/modules/payment/controller.test.js` (create)
- Modify: `server/src/routes.js`

A new patient-session route that verifies the browser return params and funnels into the **same** idempotent `processWebhook` as the webhook. Bad signature → 401 + `payment.webhook_rejected` audit.

- [ ] **Step 1: Write the failing controller test**

Create `server/src/modules/payment/controller.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../integrations/payment/index.js', () => ({
  paymentProvider: { verifyReturn: vi.fn(), verifyWebhook: vi.fn() },
}));
vi.mock('./service.js', () => ({ processWebhook: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { paymentProvider } from '../../integrations/payment/index.js';
import * as paymentService from './service.js';
import * as audit from '../../services/audit/audit.service.js';
import { AppError } from '../../http/AppError.js';
import { verifyReturn } from './controller.js';

const mkRes = () => ({ json: vi.fn() });

beforeEach(() => vi.clearAllMocks());

describe('payment.verifyReturn controller', () => {
  it('on a good signature parses the return and drives processWebhook', async () => {
    const parsed = { event: 'payment.success', providerRef: 'appt_1', amount: 250000, gatewayFee: null };
    paymentProvider.verifyReturn.mockReturnValue(parsed);
    const res = mkRes();
    const next = vi.fn();
    await verifyReturn({ body: { SIGNATURE: 'ok' } }, res, next);
    expect(paymentService.processWebhook).toHaveBeenCalledWith(parsed);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('on a bad signature audits payment.webhook_rejected and forwards the 401', async () => {
    paymentProvider.verifyReturn.mockImplementation(() => {
      throw new AppError('INVALID_SIGNATURE', 'bad', 401);
    });
    const res = mkRes();
    const next = vi.fn();
    await verifyReturn({ body: {} }, res, next);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.webhook_rejected', actorType: 'system' }),
    );
    expect(paymentService.processWebhook).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toMatchObject({ code: 'INVALID_SIGNATURE', status: 401 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/modules/payment/controller.test.js`
Expected: FAIL — `verifyReturn` is not exported from `controller.js`.

- [ ] **Step 3: Add the `verifyReturn` handler**

Append to `server/src/modules/payment/controller.js` (after the `payfast` handler):

```js
export async function verifyReturn(req, res, next) {
  let result;
  try {
    result = paymentProvider.verifyReturn(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('payfast return signature rejected');
    await audit
      .record({
        eventType: 'payment.webhook_rejected',
        actorType: 'system',
        reason: 'bad signature (return)',
      })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Return rejected.', 401),
    );
  }
  try {
    await paymentService.processWebhook(result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 4: Add the patient-session router**

Replace the full contents of `server/src/modules/payment/index.js`:

```js
// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';

export const paymentWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
paymentWebhookRouter.post('/payfast', c.payfast);

export const paymentReturnRouter = Router();
// Patient-session browser-return verification (design §3). Signature is the integrity guard;
// funnels into the same idempotent processWebhook as the webhook.
paymentReturnRouter.post('/verify-return', requireRole('patient'), c.verifyReturn);
```

- [ ] **Step 5: Mount the router in `routes.js`**

In `server/src/routes.js`, update the payment import:

```js
import { paymentWebhookRouter, paymentReturnRouter } from './modules/payment/index.js';
```

and add the mount alongside the other `/api` feature routers (e.g. directly before the webhooks block):

```js
  app.use('/api/payments', paymentReturnRouter); // POST /api/payments/verify-return
```

- [ ] **Step 6: Run the controller test + full payment module**

Run: `npx vitest run server/src/modules/payment`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/payment/controller.js server/src/modules/payment/index.js server/src/modules/payment/controller.test.js server/src/routes.js
git commit -m "feat(payment): dual-channel verify-return route (POST /api/payments/verify-return) (Slice H S1)"
```

---

## Task 6: Caller degradation (quiet manual fallback)

**Files:**
- Modify: `server/src/modules/appointment/service.js` (`initiateRefund`)
- Test: `server/src/modules/appointment/test.js`
- Modify: `server/src/modules/payment/service.js` (`refundInFull`, `reconcileOne`)
- Test: `server/src/modules/payment/test.js`

### 6a — `initiateRefund` manual_required branch

- [ ] **Step 1: Write the failing test**

Add to `server/src/modules/appointment/test.js`, inside the existing `describe('refund retry (F06.03 / edge #30)', ...)` block:

```js
  it('manual_required → no retry, refundStatus set, one audit, one refund_delayed email', async () => {
    prisma.payment.findFirst.mockResolvedValue(failedPayment);
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1', patientUserId: 'u1', slotStart: new Date('2099-01-06T09:00:00Z'), doctorId: 'd1',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    paymentProvider.refund.mockResolvedValue({ status: 'manual_required', refundRef: null });
    const out = await initiateRefund({ appointmentId: 'a1' });
    expect(out).toEqual({ status: 'manual_required', refundRef: null });
    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.refundStatus).toBe('manual_required');
    expect(data.nextRefundRetryAt).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.refund_manual_required', targetRef: 'a1' }),
    );
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund_delayed', appointmentId: 'a1' }),
    );
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/src/modules/appointment/test.js -t "manual_required"`
Expected: FAIL — no `payment.refund_manual_required` audit; success path would set `refundStatus='manual_required'` but emits no audit/email.

- [ ] **Step 3: Add the manual_required branch**

In `server/src/modules/appointment/service.js`, in `initiateRefund`, immediately after the `try/catch` that calls `paymentProvider.refund(...)` and before the existing trailing `await prisma.payment.update({...})` success write, insert:

```js
  if (result.status === 'manual_required') {
    // Gateway exposes no refund API (PayFast PK). Record once, no retry-spin, notify the patient.
    await prisma.payment.update({
      where: { id: payment.id },
      data: { refundIdempotencyKey: key, refundStatus: 'manual_required', nextRefundRetryAt: null },
    });
    await audit
      .record({
        eventType: 'payment.refund_manual_required',
        actorType: 'system',
        targetRef: appointmentId,
        reason: 'gateway exposes no refund API; awaiting manual admin settlement',
        meta: { providerRef: payment.providerRef ?? null },
      })
      .catch(() => {});
    await enqueueRefundDelayed(appointmentId).catch(() => {});
    return result;
  }
```

(The existing success write that follows continues to handle `settled`/`initiated`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/src/modules/appointment/test.js`
Expected: PASS (new test + all existing refund/cancel tests).

### 6b — `refundInFull` manual_required note

- [ ] **Step 5: Write the failing test**

Add to `server/src/modules/payment/test.js`, inside `describe('payment.reconcileUnconfirmed (F04.03)', ...)`:

```js
  it('edge #6a with manual_required refund: lock deleted, status set, manual audit note', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue(null); // locked row already gone → refundInFull
    paymentProvider.refund.mockResolvedValue({ status: 'manual_required', refundRef: null });
    await reconcileUnconfirmed(NOW);
    const data = prisma.payment.update.mock.calls.at(-1)[0].data;
    expect(data.refundStatus).toBe('manual_required');
    expect(data.status).toBe('success'); // money WAS captured at the gateway
    expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'slot_locked' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.reconciliation_refund',
        reason: expect.stringContaining('manual'),
      }),
    );
  });
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run server/src/modules/payment/test.js -t "manual_required refund"`
Expected: FAIL — the audit `reason` does not mention "manual" for the manual_required case.

- [ ] **Step 7: Make the audit reason conditional**

In `server/src/modules/payment/service.js`, in `refundInFull`, change the audit `reason` to reflect the manual case:

```js
    reason:
      result.status === 'manual_required'
        ? 'paid at gateway; slot gone (edge #6a) — manual refund required (no gateway API)'
        : 'paid at gateway; slot no longer available (edge #6a) — refunded in full',
```

(The rest of `refundInFull` is unchanged — it already passes `result.status` through to `refundStatus`, keeps `status:'success'`, deletes the stale lock, and audits `payment.reconciliation_refund`.)

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run server/src/modules/payment/test.js`
Expected: PASS.

### 6c — `reconcileOne` manual-review surfacing on `unknown`

- [ ] **Step 9: Update the existing unknown test + add the prisma.auditLog mock**

In `server/src/modules/payment/test.js`:

First, add `auditLog` to the prisma mock at the top of the file (the `vi.mock('../../lib/prisma/prisma.js', ...)` block). Change the `prisma` object to include:

```js
    auditLog: { findFirst: vi.fn(), count: vi.fn() },
```

Then replace the existing `it('gateway-unknown → leaves the payment for the next pass', ...)` test with:

```js
  it('gateway-unknown → surfaces a one-time manual-review alert, no confirm/refund', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'unknown' });
    prisma.auditLog.findFirst.mockResolvedValue(null); // not yet flagged
    await reconcileUnconfirmed(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.manual_review_required', targetRef: 'a1' }),
    );
  });

  it('gateway-unknown that was already flagged → no duplicate manual-review alert', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'unknown' });
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'prior' }); // already flagged
    await reconcileUnconfirmed(NOW);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.manual_review_required' }),
    );
  });
```

- [ ] **Step 10: Run to verify it fails**

Run: `npx vitest run server/src/modules/payment/test.js -t "manual-review"`
Expected: FAIL — `reconcileOne` currently returns on `unknown` without auditing.

- [ ] **Step 11: Implement the one-time manual-review audit**

In `server/src/modules/payment/service.js`, in `reconcileOne`, replace:

```js
  const q = await paymentProvider.queryPaymentStatus({ providerRef: p.providerRef });
  if (q.status === 'unknown') return; // next hourly pass
```

with:

```js
  const q = await paymentProvider.queryPaymentStatus({ providerRef: p.providerRef });
  if (q.status === 'unknown') {
    // Real PayFast PK has no status-query API (always 'unknown'): surface this stuck payment
    // ONCE for manual review (F12 alert feed), then leave it for the next pass. Idempotent via
    // an existing-audit-row check (Payment has no meta column).
    const already = await prisma.auditLog.findFirst({
      where: { eventType: 'payment.manual_review_required', targetRef: p.appointmentId },
    });
    if (!already) {
      await audit.record({
        eventType: 'payment.manual_review_required',
        actorType: 'system',
        targetRef: p.appointmentId,
        reason: 'no gateway status-query API; payment unconfirmed past the reconciliation window — manual review',
        meta: { providerRef: p.providerRef },
      });
    }
    return;
  }
```

- [ ] **Step 12: Run the full payment + appointment suites**

Run: `npx vitest run server/src/modules/payment server/src/modules/appointment`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add server/src/modules/appointment/service.js server/src/modules/appointment/test.js server/src/modules/payment/service.js server/src/modules/payment/test.js
git commit -m "feat(payment): quiet manual-fallback degradation in initiateRefund/refundInFull/reconcileOne (Slice H S1)"
```

---

## Task 7: Admin backend hook — record manual refund

**Files:**
- Modify: `shared/schemas/admin/admin.js` (`recordRefundSchema`)
- Modify: `server/src/modules/admin/service.js` (`recordManualRefund`)
- Modify: `server/src/modules/admin/controller.js` (`recordRefund`)
- Modify: `server/src/modules/admin/index.js` (route)
- Test: `server/src/modules/admin/test.js`

`POST /api/admin/payments/:appointmentId/record-refund` (requireRole admin) sets `refundRef`, `refundStatus='settled'`, reuses `rf_<appointmentId>`, is idempotent, audits `payment.manual_refund_recorded`, enqueues `refund_confirmation`. No UI in S1.

- [ ] **Step 1: Add the validation schema**

Append to `shared/schemas/admin/admin.js`:

```js
/** POST /api/admin/payments/:appointmentId/record-refund (Slice H S1; manual out-of-band refund). */
export const recordRefundSchema = z.object({
  refundRef: z.string().trim().min(1).max(128),
  /** PKR paisa, positive; optional (the settled payment row already holds the amount). */
  amount: z.number().int().positive().optional(),
});
```

- [ ] **Step 2: Write the failing service tests**

Add to `server/src/modules/admin/test.js`. First extend the prisma mock's `payment` to include the methods used (add to the `vi.mock` prisma object):

```js
    payment: { findFirst: vi.fn(), update: vi.fn() },
```

Add `notification` to the mocks (after the audit mock):

```js
vi.mock('../notification/service.js', () => ({ enqueue: vi.fn().mockResolvedValue({}) }));
```

Import the new function + notification at the top (extend the existing imports):

```js
import * as notification from '../notification/service.js';
import { recordManualRefund } from './service.js';
```

Add the test block:

```js
describe('admin.recordManualRefund (Slice H S1)', () => {
  const paid = {
    id: 'p1', appointmentId: 'a1', status: 'success', amount: 250000,
    refundIdempotencyKey: null, refundStatus: 'manual_required', refundRef: null,
  };

  it('records the refund, reuses rf_<id>, audits, and enqueues refund_confirmation', async () => {
    prisma.payment.findFirst.mockResolvedValue(paid);
    prisma.payment.update.mockResolvedValue({ ...paid, refundStatus: 'settled', refundRef: 'PORTAL-1' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    const out = await recordManualRefund({ appointmentId: 'a1', refundRef: 'PORTAL-1', amount: 244000, actorId: 'admin1' });
    expect(out).toMatchObject({ refundStatus: 'settled', refundRef: 'PORTAL-1' });
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ refundRef: 'PORTAL-1', refundStatus: 'settled', refundIdempotencyKey: 'rf_a1' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.manual_refund_recorded', actorId: 'admin1', targetRef: 'a1',
        meta: { refundRef: 'PORTAL-1', amount: 244000 },
      }),
    );
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund_confirmation', appointmentId: 'a1' }),
    );
  });

  it('is idempotent: a re-POST on an already-settled payment is a no-op', async () => {
    prisma.payment.findFirst.mockResolvedValue({ ...paid, refundStatus: 'settled', refundRef: 'PORTAL-1', refundIdempotencyKey: 'rf_a1' });
    const out = await recordManualRefund({ appointmentId: 'a1', refundRef: 'PORTAL-1', actorId: 'admin1' });
    expect(out).toMatchObject({ refundStatus: 'settled', refundRef: 'PORTAL-1' });
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notification.enqueue).not.toHaveBeenCalled();
  });

  it('no settled payment for the appointment → 404', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    await expect(
      recordManualRefund({ appointmentId: 'nope', refundRef: 'x', actorId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run server/src/modules/admin/test.js -t "recordManualRefund"`
Expected: FAIL — `recordManualRefund` not exported.

- [ ] **Step 4: Implement the service function**

In `server/src/modules/admin/service.js`, add the notification import at the top:

```js
import * as notification from '../notification/service.js';
```

Append the function:

```js
/** Slice H S1: record an out-of-band (portal) manual refund. Idempotent on rf_<appointmentId>.
 *  This is the glossary "admin out-of-band gateway action" the idempotency key was designed for. */
export async function recordManualRefund({ appointmentId, refundRef, amount, actorId }) {
  const payment = await prisma.payment.findFirst({
    where: { appointmentId, status: 'success' },
  });
  if (!payment) throw new AppError('NOT_FOUND', 'No settled payment to record a refund against.', 404);
  // Idempotent re-POST: already settled → no-op (no double audit / double email).
  if (payment.refundStatus === 'settled') {
    return { appointmentId, refundRef: payment.refundRef, refundStatus: 'settled' };
  }
  const key = payment.refundIdempotencyKey ?? `rf_${appointmentId}`;
  await prisma.payment.update({
    where: { id: payment.id },
    data: { refundRef, refundStatus: 'settled', refundIdempotencyKey: key, nextRefundRetryAt: null },
  });
  await audit.record({
    eventType: 'payment.manual_refund_recorded',
    actorType: 'admin',
    actorId,
    targetRef: appointmentId,
    meta: { refundRef, amount: amount ?? null },
  });
  // refund_confirmation merge-vars (doc 14 §5): patientName, amount, refundRef, appointmentRef.
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  const patient = appt
    ? await prisma.user.findUnique({
        where: { id: appt.patientUserId },
        select: { email: true, fullName: true },
      })
    : null;
  if (patient) {
    await notification.enqueue({
      type: 'refund_confirmation',
      appointmentId,
      recipientEmail: patient.email,
      scheduledFor: new Date(),
      vars: { patientName: patient.fullName, amount: amount ?? payment.amount, refundRef, appointmentRef: appointmentId },
    });
  }
  return { appointmentId, refundRef, refundStatus: 'settled' };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run server/src/modules/admin/test.js`
Expected: PASS (new tests + all existing admin tests).

- [ ] **Step 6: Add the controller handler**

Append to `server/src/modules/admin/controller.js`:

```js
export async function recordRefund(req, res, next) {
  try {
    res.json(
      await adminService.recordManualRefund({
        appointmentId: req.params.appointmentId,
        refundRef: req.body.refundRef,
        amount: req.body.amount,
        actorId: req.session.userId,
      }),
    );
  } catch (e) {
    next(e);
  }
}
```

- [ ] **Step 7: Add the route**

In `server/src/modules/admin/index.js`, add `recordRefundSchema` to the schema import and add the route after the settings routes:

Update the import:

```js
import { recordsQuerySchema, auditQuerySchema, settingsUpdateSchema, recordRefundSchema } from '../../../../shared/schemas/index.js';
```

Add the route:

```js
// POST /api/admin/payments/:appointmentId/record-refund  (Slice H S1; manual out-of-band refund)
adminRouter.post('/payments/:appointmentId/record-refund', requireRole('admin'), adminWriteLimiter, validate(recordRefundSchema), c.recordRefund);
```

- [ ] **Step 8: Run the admin module + shared schemas**

Run: `npx vitest run server/src/modules/admin shared`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add shared/schemas/admin/admin.js server/src/modules/admin/service.js server/src/modules/admin/controller.js server/src/modules/admin/index.js server/src/modules/admin/test.js
git commit -m "feat(admin): record-refund backend hook (manual out-of-band refund) (Slice H S1)"
```

---

## Task 8: Full regression + doc-impact verdict

**Files:** none (verification + tracking only).

- [ ] **Step 1: Full server/shared suite**

Run: `npm test`
Expected: ≥ 248 passed (baseline) + the new tests, 0 failed.

- [ ] **Step 2: Client suite (regression only — no client changes in S1)**

Run: `npm --workspace client test`
Expected: green (unchanged from baseline).

- [ ] **Step 3: Lint**

Run: `npx eslint server/src/integrations/payment server/src/modules/payment server/src/modules/admin server/src/config/env`
Expected: no errors.

- [ ] **Step 4: Consolidate the tracked spec-doc impact list** (for the controller — do NOT edit 00–15)

Per design §9 + doc-00 change protocol/matrix. Confirm each against the as-built code:
- **14** — rewrite PayFast section SA→PK (flow/auth/signature/IPN/amount); `PaymentProvider` typedef +`verifyReturn`; `RefundResult.status` +`manual_required`; mark externals researched-not-confirmed.
- **15** — §PayFast env rework: add `PAYFAST_SECURED_KEY`/`PAYFAST_MERCHANT_NAME`/`PAYFAST_STORE_ID`, `PAYFAST_MODE` enum; `PAYMENT_PROVIDER` enum +`payfast`; `PAYFAST_PASSPHRASE` dev-mock-only; drop `PAYFAST_MERCHANT_KEY`.
- **05** — new routes `POST /api/payments/verify-return`, `POST /api/admin/payments/:appointmentId/record-refund`; new audit event types.
- **07** — PayFast-PK §8 merchant-verification checklist as risks/open questions.
- **11** — new ADR: PayFast PK dual-channel confirmation + manual refund/reconcile fallback + researched-API risk.
- **04** — `RefundStatus` enum gained `manual_required` (schema change + migration shipped).
- **13** — status tracker: payment adapter → Built (PK); manual-degradation note.

- [ ] **Step 5: Final commit (if any uncommitted verification artifacts) + report**

Report branch, commit list, files-changed table, decisions/findings, verification counts, and the tracked spec-doc list to the controller. Do NOT push, merge, or edit specs.

---

## Self-Review

- **Spec coverage:** §2 adapter → Task 3; §2 contract change → Task 4; §3 dual-channel → Task 5; §4 caller degradation → Task 6; §5 admin hook → Task 7; §6 config → Task 2; enum prerequisite → Task 1; §7 tests → embedded test-first in every task; §8 checklist → tracked in Task 8 (doc 07).
- **Type consistency:** `payfastReal` export name used in Tasks 3 & 4; `RefundResult.status` union `'settled'|'initiated'|'failed'|'manual_required'` consistent across index.js typedef, adapter, and callers; `verifyReturn(req)` signature identical in adapter, mock, stub, controller; `recordManualRefund({ appointmentId, refundRef, amount, actorId })` consistent across service/controller/test.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO-as-task (the two inline `TODO(payfast-*)` comments are intentional upgrade seams per design §2, not plan placeholders).
