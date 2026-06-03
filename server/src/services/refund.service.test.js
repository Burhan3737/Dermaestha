import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { payment: { findFirst: vi.fn(), update: vi.fn() }, settings: { findUnique: vi.fn() } },
}));
vi.mock('../integrations/payment/index.js', () => ({
  paymentProvider: { refund: vi.fn() },
}));

import { prisma } from '../lib/prisma.js';
import { paymentProvider } from '../integrations/payment/index.js';
import { quoteRefund, initiateRefund } from './refund.service.js';

beforeEach(() => vi.clearAllMocks());

describe('refund.quoteRefund', () => {
  it('uses the reported gateway fee when present', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: 6000 });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 250, fallbackFeeFixed: 0 });
    expect(await quoteRefund('a1')).toEqual({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
  });

  it('falls back to the Settings fee model when none reported', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: null });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 250, fallbackFeeFixed: 1000 });
    expect(await quoteRefund('a1')).toEqual({ amountPaid: 250000, gatewayFee: 7250, refund: 242750 });
  });
});

describe('refund.initiateRefund', () => {
  it('calls the provider net-of-fee + persists an idempotency key, ref, status', async () => {
    prisma.payment.findFirst.mockResolvedValue({ id: 'p1', appointmentId: 'a1', amount: 250000, gatewayFee: 6000, providerRef: 'mock_1', refundIdempotencyKey: null });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 0, fallbackFeeFixed: 0 });
    paymentProvider.refund.mockResolvedValue({ refundRef: 'refund_rf_a1', status: 'settled' });
    await initiateRefund({ appointmentId: 'a1' });
    expect(paymentProvider.refund).toHaveBeenCalledWith({ providerRef: 'mock_1', amount: 244000, idempotencyKey: 'rf_a1' });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { refundIdempotencyKey: 'rf_a1', refundRef: 'refund_rf_a1', refundStatus: 'settled' },
    });
  });

  it('is a no-op when there is no successful payment', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    expect(await initiateRefund({ appointmentId: 'a1' })).toBeNull();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
  });
});
