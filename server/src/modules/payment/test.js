import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    payment: { upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../integrations/payment/index.js', () => ({
  paymentProvider: { createCheckout: vi.fn() },
}));
vi.mock('../../integrations/email/index.js', () => ({
  emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) },
}));
vi.mock('../appointment/service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../../lib/prisma/prisma.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import { emailProvider } from '../../integrations/email/index.js';
import * as state from '../appointment/service.js';
import { createIntent, processWebhook } from './service.js';

beforeEach(() => vi.clearAllMocks());

const liveLock = {
  id: 'a1',
  patientUserId: 'u1',
  doctorId: 'd1',
  state: 'slot_locked',
  slotStart: new Date('2099-01-04T13:00:00Z'),
  lockExpiresAt: new Date(Date.now() + 600000),
};

describe('payment.createIntent', () => {
  it('creates an idempotent intent and returns the checkout redirectUrl', async () => {
    prisma.appointment.findUnique.mockResolvedValue(liveLock);
    prisma.doctor.findUnique.mockResolvedValue({ fee: 250000 });
    prisma.payment.upsert.mockResolvedValue({ id: 'p1', providerRef: null });
    paymentProvider.createCheckout.mockResolvedValue({
      redirectUrl: '/dev/checkout?ref=mock_1',
      providerRef: 'mock_1',
    });
    const out = await createIntent({ patientUserId: 'u1', appointmentId: 'a1' });
    expect(out).toEqual({ redirectUrl: '/dev/checkout?ref=mock_1' });
    expect(prisma.payment.upsert).toHaveBeenCalled();
  });

  it('rejects when the lock has expired', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...liveLock,
      lockExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(createIntent({ patientUserId: 'u1', appointmentId: 'a1' })).rejects.toMatchObject({
      code: 'LOCK_EXPIRED',
      status: 409,
    });
  });

  it("hides another patient's appointment as 404", async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...liveLock, patientUserId: 'other' });
    await expect(createIntent({ patientUserId: 'u1', appointmentId: 'a1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});

describe('payment.processWebhook', () => {
  it('on success commits state+payment in one $transaction', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
    });
    prisma.$transaction.mockImplementation(async (fn) => fn({ payment: { update: vi.fn() } }));
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    await processWebhook({
      event: 'payment.success',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: 6000,
    });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'confirmed',
        data: { feeAtBooking: 250000, lockExpiresAt: null },
      }),
    );
  });

  it('on an already-confirmed appointment is an idempotent no-op', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
    });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    await processWebhook({
      event: 'payment.success',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: null,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ignores a payment.failed for an already-successful payment', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
      status: 'success',
    });
    const out = await processWebhook({
      event: 'payment.failed',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: null,
    });
    expect(out).toEqual({ ok: true });
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it('does not block the webhook ack on a hung confirmation email (fire-and-forget)', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
    });
    prisma.$transaction.mockImplementation(async (fn) => fn({ payment: { update: vi.fn() } }));
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    emailProvider.send.mockReturnValue(new Promise(() => {})); // never resolves — a hung provider
    const out = await processWebhook({
      event: 'payment.success',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: 6000,
    });
    expect(out).toEqual({ ok: true });
  }, 2000);
});
