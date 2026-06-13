import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/env/env.js', () => ({
  env: {
    RESEND_API_KEY: 'rk_test',
    RESEND_FROM: 'no-reply@dermestha.example',
    EMAIL_PROVIDER: 'stub',
    NODE_ENV: 'test',
  },
}));

import { resendEmail } from './resend.js';

describe('resendEmail.send', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the Resend API with auth header and the rendered subject + body', async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 're_123' }) });
    const out = await resendEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: {
        patientName: 'P',
        doctorName: 'Dr. K',
        slotStartLocal: 'Mon 14:00',
        fee: 250000,
        dashboardUrl: 'https://app',
      },
    });
    expect(out).toEqual({ providerId: 're_123' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk_test');
    const body = JSON.parse(init.body);
    expect(body.from).toBe('no-reply@dermestha.example');
    expect(body.to).toEqual(['p@t.test']);
    expect(body.subject).toMatch(/confirmed/i);
    expect(body.text).toContain('Hi P,');
    expect(body.text).toContain('PKR 2,500');
    expect(body.text).toContain('— Dermestha');
  });

  it('maps a non-2xx response to EMAIL_SEND_FAILED so the outbox retry machinery engages', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    await expect(
      resendEmail.send({ template: 'reminder_1h', to: 'p@t.test', vars: {} }),
    ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED', status: 502 });
  });
});
