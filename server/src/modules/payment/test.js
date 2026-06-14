import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findUnique: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    doctor: { findUnique: vi.fn() },
    payment: { upsert: vi.fn(), update: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    auditLog: { findFirst: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../integrations/payment/index.js', () => ({
  paymentProvider: { createCheckout: vi.fn(), refund: vi.fn(), queryPaymentStatus: vi.fn() },
}));
vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('../../integrations/email/index.js', () => ({
  emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) },
}));
vi.mock('../appointment/service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('../notification/service.js', () => ({
  enqueueBookingEmails: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../analytics/service.js', () => ({ record: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '../../lib/prisma/prisma.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import { emailProvider } from '../../integrations/email/index.js';
import * as state from '../appointment/service.js';
import * as notification from '../notification/service.js';
import * as audit from '../../services/audit/audit.service.js';
import * as analytics from '../analytics/service.js';
import { createIntent, processWebhook, reconcileUnconfirmed } from './service.js';

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
  it('on success commits state+payment+outbox in one $transaction', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const tx = {
      payment: { update: vi.fn() },
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'p@t.test', fullName: 'P' }),
      },
      doctor: {
        findUnique: vi.fn().mockResolvedValue({ user: { fullName: 'Dr. D' } }),
      },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await processWebhook({
      event: 'payment.success',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: 6000,
    });
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'confirmed',
        data: { feeAtBooking: 250000, lockExpiresAt: null },
      }),
    );
    expect(notification.enqueueBookingEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        appointment: expect.objectContaining({ id: 'a1' }),
        patient: { email: 'p@t.test', fullName: 'P' },
        doctorName: 'Dr. D',
        fee: 250000,
        client: tx,
      }),
    );
    expect(emailProvider.send).not.toHaveBeenCalled(); // no direct send path remains
    expect(analytics.record).toHaveBeenCalledWith({
      type: 'booking_confirmed',
      meta: { doctorId: 'd1', fee: 250000 },
    });
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

  it('on payment.failed (pending) marks the intent failed and force-expires the lock (no delete)', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      providerRef: 'mock_1',
      status: 'pending',
    });
    const before = Date.now();
    const out = await processWebhook({
      event: 'payment.failed',
      providerRef: 'mock_1',
      amount: 250000,
      gatewayFee: null,
    });
    expect(out).toEqual({ ok: true });
    // Option B: never delete (Payment FK is RESTRICT) — keep the Payment, mark it failed.
    expect(prisma.appointment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'failed' },
    });
    // Lock force-expired so the slot is reclaimable (ADR-23 lazy expiry).
    const upd = prisma.appointment.updateMany.mock.calls.at(-1)[0];
    expect(upd.where).toEqual({ id: 'a1', state: 'slot_locked' });
    expect(upd.data.lockExpiresAt.getTime()).toBeGreaterThanOrEqual(before);
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

});

describe('payment.reconcileUnconfirmed (F04.03)', () => {
  const NOW = new Date('2099-01-04T12:00:00Z');
  const pendingPayment = {
    id: 'p1',
    appointmentId: 'a1',
    providerRef: 'mock_1',
    amount: 250000,
    refundIdempotencyKey: null,
    createdAt: new Date('2099-01-04T10:00:00Z'), // 2h old: inside [1h, 24h]
  };

  beforeEach(() => {
    prisma.payment.findMany.mockResolvedValue([pendingPayment]);
  });

  it('confirms a gateway-paid payment via the shared atomic commit', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({
      status: 'paid',
      amount: 250000,
      gatewayFee: 6000,
    });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const tx = {
      payment: { update: vi.fn() },
      user: { findUnique: vi.fn().mockResolvedValue({ email: 'p@t.test', fullName: 'P' }) },
      doctor: { findUnique: vi.fn().mockResolvedValue({ user: { fullName: 'Dr. D' } }) },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await reconcileUnconfirmed(NOW);
    expect(state.transition).toHaveBeenCalledWith(expect.objectContaining({ to: 'confirmed' }));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciled_confirmed', targetRef: 'a1' }),
    );
    expect(analytics.record).toHaveBeenCalledWith({
      type: 'booking_confirmed',
      meta: { doctorId: 'd1', fee: 250000 },
    });
  });

  it('edge #6a: slot conflict → full gross refund, no second appointment, admin alert', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await reconcileUnconfirmed(NOW);
    expect(paymentProvider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250000, idempotencyKey: 'rf_a1' }), // FULL amount
    );
    expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'slot_locked' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciliation_refund', targetRef: 'a1' }),
    );
  });

  it('edge #6a variant: locked appointment row already gone → full refund', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await reconcileUnconfirmed(NOW);
    expect(paymentProvider.refund).toHaveBeenCalled();
  });

  it('edge #6a with manual_required refund: lock deleted, status set, manual audit note', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'paid', amount: 250000 });
    prisma.appointment.findUnique.mockResolvedValue(null); // locked row already gone → refundInFull
    paymentProvider.refund.mockResolvedValue({ status: 'manual_required', refundRef: null });
    await reconcileUnconfirmed(NOW);
    const data = prisma.payment.update.mock.calls.at(-1)[0].data;
    expect(data.refundStatus).toBe('manual_required');
    expect(data.status).toBe('success');
    expect(prisma.appointment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'slot_locked' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'payment.reconciliation_refund',
        reason: expect.stringContaining('manual'),
      }),
    );
  });

  it('gateway-failed → same Option-B cleanup as the failed-IPN path (mark failed + free lock)', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'failed' });
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    await reconcileUnconfirmed(NOW);
    // No delete (Payment FK is RESTRICT): the lock is force-expired instead.
    expect(prisma.appointment.deleteMany).not.toHaveBeenCalled();
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1', state: 'slot_locked' } }),
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'failed' } }),
    );
  });

  it('gateway-unknown → surfaces a one-time manual-review alert, no confirm/refund', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'unknown' });
    prisma.auditLog.findFirst.mockResolvedValue(null); // not yet flagged
    await reconcileUnconfirmed(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.manual_review_required', targetRef: 'a1' }),
    );
  });

  it('gateway-unknown that was already flagged → no duplicate manual-review alert', async () => {
    paymentProvider.queryPaymentStatus.mockResolvedValue({ status: 'unknown' });
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'prior' }); // already flagged
    await reconcileUnconfirmed(NOW);
    expect(audit.record).not.toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.manual_review_required' }),
    );
  });

  it('a provider query error audits a reconciliation mismatch and continues', async () => {
    paymentProvider.queryPaymentStatus.mockRejectedValue(new Error('gateway down'));
    await reconcileUnconfirmed(NOW);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.reconciliation_mismatch' }),
    );
  });
});
