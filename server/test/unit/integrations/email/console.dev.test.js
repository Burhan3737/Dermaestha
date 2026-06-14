import { describe, it, expect, vi } from 'vitest';
import { consoleEmail } from '#src/integrations/email/console.dev.js';
import { logger } from '#src/lib/logger/logger.js';

describe('consoleEmail dev adapter', () => {
  it('send resolves with a providerId and never throws', async () => {
    const out = await consoleEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P', fee: 250000, dashboardUrl: 'https://app' },
    });
    expect(out.providerId).toMatch(/^dev_/);
  });

  it('logs the rendered subject + body (the real email), not the raw vars', async () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    await consoleEmail.send({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P', fee: 250000, dashboardUrl: 'https://app' },
    });
    const [, payload] = spy.mock.calls[0];
    expect(payload.to).toBe('p@t.test');
    expect(payload.subject).toMatch(/confirmed/i);
    expect(payload.text).toContain('Hi P,');
    expect(payload).not.toHaveProperty('vars');
    spy.mockRestore();
  });
});
