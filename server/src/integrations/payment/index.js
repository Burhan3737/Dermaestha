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
