// @ts-check
import { payfastStub } from './payfast.stub.js';
import { payfastMock } from './payfast.mock.js';
import { env } from '../../config/env.js';

/**
 * @typedef {Object} PaymentProvider
 * @property {(args: any) => Promise<any>} createCheckout
 * @property {(req: import('express').Request) => any} verifyWebhook
 * @property {(args: any) => Promise<any>} refund
 * @property {(sinceIso: string) => Promise<any[]>} listUnconfirmed
 */

/** Selected provider. Swap to the concrete PayFast adapter in M2 via a config switch. */
export const paymentProvider = env.PAYMENT_PROVIDER === 'mock' ? payfastMock : payfastStub;
