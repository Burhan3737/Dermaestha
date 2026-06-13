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
