import { describe, it, expect } from 'vitest';
import { payfastMock, buildSignedIpn, signParams } from './payfast.mock.js';

describe('payfast.mock gateway', () => {
  it('createCheckout returns a dev redirectUrl + providerRef', async () => {
    const out = await payfastMock.createCheckout({
      appointmentId: 'a1', intentKey: 'u1:2026', amount: 250000,
      returnUrl: 'r', cancelUrl: 'c', notifyUrl: 'n',
    });
    expect(out.providerRef).toMatch(/^mock_/);
    expect(out.redirectUrl).toContain('/dev/checkout?ref=');
  });

  it('verifyWebhook accepts a correctly signed IPN and parses it', () => {
    const ipn = buildSignedIpn({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000, gatewayFee: 5000 });
    const result = payfastMock.verifyWebhook({ body: ipn });
    expect(result).toEqual({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000, gatewayFee: 5000 });
  });

  it('verifyWebhook throws 401 on a bad signature', () => {
    const ipn = buildSignedIpn({ event: 'payment.success', providerRef: 'mock_1', intentKey: 'u1:2026', amount: 250000 });
    expect(() => payfastMock.verifyWebhook({ body: { ...ipn, signature: 'tampered' } }))
      .toThrowError(/signature/i);
  });

  it('signParams ignores the signature field and is order-independent', () => {
    const a = signParams({ b: 2, a: 1, signature: 'zzz' });
    const b = signParams({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it('refund returns a settled refundRef keyed by idempotencyKey', async () => {
    const out = await payfastMock.refund({ providerRef: 'mock_1', amount: 240000, idempotencyKey: 'rf_a1' });
    expect(out).toEqual({ refundRef: 'refund_rf_a1', status: 'settled' });
  });
});
