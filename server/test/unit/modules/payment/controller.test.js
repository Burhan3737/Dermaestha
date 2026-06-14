import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/integrations/payment/index.js', () => ({
  paymentProvider: { verifyReturn: vi.fn(), verifyWebhook: vi.fn() },
}));
vi.mock('#src/modules/payment/service.js', () => ({
  processWebhook: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { paymentProvider } from '#src/integrations/payment/index.js';
import * as paymentService from '#src/modules/payment/service.js';
import * as audit from '#src/services/audit/audit.service.js';
import { AppError } from '#src/http/AppError.js';
import { verifyReturn } from '#src/modules/payment/controller.js';

const mkRes = () => ({ json: vi.fn() });

beforeEach(() => vi.clearAllMocks());

describe('payment.verifyReturn controller', () => {
  it('on a good signature parses the return and drives processWebhook', async () => {
    const parsed = {
      event: 'payment.success',
      providerRef: 'appt_1',
      amount: 250000,
      gatewayFee: null,
    };
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
