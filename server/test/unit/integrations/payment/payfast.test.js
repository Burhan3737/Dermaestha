import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

vi.mock('#src/config/env/env.js', () => ({
  env: {
    PAYFAST_MERCHANT_ID: 'M123',
    PAYFAST_SECURED_KEY: 'sk_secret',
    PAYFAST_MERCHANT_NAME: 'Dermestha',
    PAYFAST_MODE: 'sandbox',
    APP_BASE_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

import { payfastReal } from '#src/integrations/payment/payfast.js';

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

    const [tokenUrl, tokenInit] = fetch.mock.calls[0];
    expect(tokenUrl).toBe('https://ipguat.apps.net.pk/Ecommerce/api/Transaction/GetAccessToken');
    const tokenBody = new URLSearchParams(tokenInit.body);
    expect(tokenBody.get('MERCHANT_ID')).toBe('M123');
    expect(tokenBody.get('SECURED_KEY')).toBe('sk_secret');
    expect(tokenBody.get('TXNAMT')).toBe('2500.00');
    expect(tokenBody.get('CURRENCY_CODE')).toBe('PKR');
    expect(tokenBody.get('BASKET_ID')).toBe('appt_1');

    expect(out.providerRef).toBe('appt_1');

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
    expect(url.searchParams.get('SUCCESS_URL')).toBe(
      'http://localhost:3000/pay/return?appt=appt_1',
    );
    expect(url.searchParams.get('FAILURE_URL')).toBe('http://localhost:3000/book/d1');
    expect(url.searchParams.get('CHECKOUT_URL')).toBe('http://localhost:3000/api/webhooks/payfast');
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
      amount: 250000,
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
    const out = await payfastReal.refund({
      providerRef: 'appt_1',
      amount: 1000,
      idempotencyKey: 'rf_appt_1',
    });
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
