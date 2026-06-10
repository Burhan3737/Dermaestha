// @ts-check
import crypto from 'node:crypto';
import { env } from '../../config/env/env.js';
import { AppError } from '../../http/AppError.js';

const PASSPHRASE = env.PAYFAST_PASSPHRASE || 'dev-mock-passphrase';

/** Deterministic HMAC over the IPN params (sorted key=value joined by &), excluding `signature`/nullish. */
export function signParams(params) {
  const base = Object.keys(params)
    .filter((k) => k !== 'signature' && params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHmac('sha256', PASSPHRASE).update(base).digest('hex');
}

/** Build a signed IPN body (used by the dev checkout-complete handler and tests). */
export function buildSignedIpn({ event, providerRef, intentKey, amount, gatewayFee = null }) {
  const params = { event, providerRef, intentKey, amount, gatewayFee };
  return { ...params, signature: signParams(params) };
}

/** @type {import('./index.js').PaymentProvider} */
export const payfastMock = {
  async createCheckout({
    appointmentId,
    intentKey,
    amount,
    returnUrl,
    cancelUrl,
    notifyUrl,
    providerRef,
  } = {}) {
    const ref = providerRef || `mock_${crypto.randomUUID()}`;
    return {
      redirectUrl: `${env.APP_BASE_URL}/dev/checkout?ref=${encodeURIComponent(ref)}`,
      providerRef: ref,
    };
  },
  verifyWebhook(req) {
    const b = req.body ?? {};
    if (!b.signature || b.signature !== signParams(b)) {
      throw new AppError('INVALID_SIGNATURE', 'Webhook signature verification failed.', 401);
    }
    return {
      event: b.event,
      providerRef: b.providerRef,
      intentKey: b.intentKey,
      amount: Number(b.amount),
      gatewayFee: b.gatewayFee == null ? null : Number(b.gatewayFee),
    };
  },
  async refund({ idempotencyKey }) {
    return { refundRef: `refund_${idempotencyKey}`, status: 'settled' };
  },
  async listUnconfirmed() {
    return [];
  },
};
