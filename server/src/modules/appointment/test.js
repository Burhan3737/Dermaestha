import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unified prisma mock covering all six merged suites.
vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    doctor: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    payment: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));
// Cross-module collaborators stay real module-mocks (these seams remain cross-module after the merge).
vi.mock('../doctor/service.js', () => ({ generateSlots: vi.fn() }));
vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('../../integrations/payment/index.js', () => ({ paymentProvider: { refund: vi.fn() } }));
vi.mock('../notification/service.js', () => ({
  enqueue: vi.fn().mockResolvedValue({}),
  enqueueBookingEmails: vi.fn().mockResolvedValue(undefined),
  slotStartLocal: vi.fn().mockReturnValue('Mon, 06 Jan 2099 09:00'),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as availability from '../doctor/service.js';
import * as audit from '../../services/audit/audit.service.js';
import { paymentProvider } from '../../integrations/payment/index.js';
import * as notification from '../notification/service.js';
import * as svc from './service.js';

// Direct (real) handles for functions tested head-on; intra-cluster seams are spied per-suite on `svc`.
const { listForRole, getForRole, lockSlot, transition, quoteRefund, initiateRefund, cancel, evaluateDueAppointments, retryDueRefunds } =
  svc;

// clearAllMocks resets call history but preserves mock IMPLEMENTATIONS, so the cross-module factory
// mocks (audit/email/paymentProvider) keep their resolved values across tests. We deliberately do NOT
// vi.restoreAllMocks() — it would strip those factory impls. Intra-cluster spies are (re)installed in
// each suite's own beforeEach and never reach the direct-call suites (which use real destructured fns).
beforeEach(() => vi.clearAllMocks());

describe('appointment.listForRole', () => {
  it('patient list returns upcoming rows with doctor card fields, no PII leak', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        slotStart: new Date('2099-01-04T13:00:00Z'),
        slotEnd: new Date('2099-01-04T13:30:00Z'),
        state: 'confirmed',
        feeAtBooking: 250000,
        forSelf: true,
        subjectName: null,
        doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
      },
    ]);
    const out = await listForRole({ role: 'patient', userId: 'u1' });
    expect(out[0]).toEqual({
      id: 'a1',
      slotStart: '2099-01-04T13:00:00.000Z',
      slotEnd: '2099-01-04T13:30:00.000Z',
      state: 'confirmed',
      feeAtBooking: 250000,
      forSelf: true,
      subjectName: null,
      doctorName: 'Dr A',
      specialization: 'Acne',
      doctorPhotoUrl: null,
    });
    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { patientUserId: 'u1', state: { in: ['confirmed', 'in_progress'] } },
      }),
    );
  });
});

describe('appointment.getForRole', () => {
  it('returns a confirmed appointment detail with a refundQuote for the owner', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      state: 'confirmed',
      slotStart: new Date('2099-01-04T13:00:00Z'),
      slotEnd: new Date('2099-01-04T13:30:00Z'),
      feeAtBooking: 250000,
      forSelf: true,
      subjectName: null,
      doctorId: 'd1',
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
    });
    vi.spyOn(svc, 'quoteRefund').mockResolvedValue({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
    const out = await getForRole({ id: 'a1', role: 'patient', userId: 'u1' });
    expect(out.refundQuote).toEqual({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
  });

  it("hides another patient's appointment as 404", async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'other',
      state: 'confirmed',
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
    });
    await expect(getForRole({ id: 'a1', role: 'patient', userId: 'u1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('detail exposes role-aware peerJoined + serverNow for a patient', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'p1',
      doctorId: 'd1',
      state: 'in_progress',
      slotStart: new Date('2026-06-04T10:00:00Z'),
      slotEnd: new Date('2026-06-04T10:30:00Z'),
      feeAtBooking: 250000,
      forSelf: true,
      subjectName: null,
      doctorJoinedAt: new Date('2026-06-04T10:01:00Z'),
      patientJoinedAt: null,
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
    });
    const out = await getForRole({ id: 'a1', role: 'patient', userId: 'p1' });
    expect(out.peerJoined).toBe(true); // patient sees the DOCTOR's presence
    expect(typeof out.serverNow).toBe('string');
  });
});

describe('appointment.listForRole (doctor)', () => {
  it('doctor list rows include patientName', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        slotStart: new Date(),
        slotEnd: new Date(),
        state: 'confirmed',
        forSelf: false,
        subjectName: 'Child',
        patient: { fullName: 'Parent P' },
      },
    ]);
    const rows = await listForRole({ role: 'doctor', userId: 'docUser' });
    expect(rows[0].patientName).toBe('Parent P');
  });
});

describe('listForRole doctor scope (F05.02)', () => {
  it("default scope is bounded to today's Karachi day", async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    await listForRole({ role: 'doctor', userId: 'u-doc' });
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.state).toEqual({ in: ['confirmed', 'in_progress'] });
    expect(where.slotStart.gte).toBeInstanceOf(Date);
    expect(where.slotStart.lt).toBeInstanceOf(Date);
    expect(where.slotStart.lt.getTime() - where.slotStart.gte.getTime()).toBe(24 * 3600 * 1000);
  });
});

describe('booking.lockSlot', () => {
  const slotStart = '2099-01-04T13:00:00.000Z';
  const bookable = () =>
    availability.generateSlots.mockResolvedValue([
      { slotStart, slotEnd: '2099-01-04T13:30:00.000Z' },
    ]);

  beforeEach(() => {
    prisma.appointment.findFirst.mockResolvedValue(null); // no existing lock / no overlap by default
    prisma.doctor.findFirst.mockResolvedValue({ id: 'd1' }); // active doctor by default
  });

  it('rejects a slot that is not bookable', async () => {
    availability.generateSlots.mockResolvedValue([]);
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'SLOT_NOT_BOOKABLE', status: 422 });
  });

  it('rejects when the patient already holds a live lock (single-lock)', async () => {
    bookable();
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'lock1' }); // existing live lock
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'ACTIVE_LOCK_EXISTS', status: 409 });
  });

  it('inserts a slot_locked row on the happy path', async () => {
    bookable();
    prisma.appointment.create.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    const out = await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(out).toMatchObject({ id: 'a1', state: 'slot_locked' });
    expect(prisma.appointment.create).toHaveBeenCalledOnce();
  });

  it('reclaims an expired lock on P2002 then retries', async () => {
    bookable();
    prisma.appointment.create
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'a2', state: 'slot_locked' });
    prisma.appointment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'expired1' });
    prisma.appointment.delete.mockResolvedValue({});
    const out = await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'expired1' } });
    expect(out).toMatchObject({ id: 'a2' });
  });

  it('returns SLOT_TAKEN on P2002 when the blocker is NOT an expired lock', async () => {
    bookable();
    prisma.appointment.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.appointment.findFirst
      .mockResolvedValueOnce(null) // live lock
      .mockResolvedValueOnce(null) // overlap
      .mockResolvedValueOnce(null); // no expired blocker
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 });
  });

  it('rejects locking a slot of an inactive/unknown doctor with 404 (invariant #9, no leak)', async () => {
    prisma.doctor.findFirst.mockResolvedValue(null); // inactive or missing — same answer
    await expect(
      lockSlot({
        patientUserId: 'u1',
        doctorId: 'd-gone',
        slotStart: '2099-01-06T09:00:00.000Z',
        forSelf: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('appointmentState.transition', () => {
  it('applies a legal transition + writes an audit entry', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    const out = await transition({
      appointmentId: 'a1',
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: 250000 },
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { state: 'confirmed', feeAtBooking: 250000 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'appointment.confirmed',
        actorType: 'system',
        targetRef: 'a1',
      }),
      prisma,
    );
    expect(out.state).toBe('confirmed');
  });

  it('rejects an illegal transition with INVALID_TRANSITION', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'completed' });
    await expect(
      transition({ appointmentId: 'a1', to: 'confirmed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('throws 404 when the appointment is missing', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(
      transition({ appointmentId: 'x', to: 'confirmed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('allows confirmed → in_progress', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'in_progress' });
    const out = await transition({ appointmentId: 'a1', to: 'in_progress', actorType: 'system' });
    expect(out.state).toBe('in_progress');
  });

  it.each(['completed', 'patient_no_show', 'doctor_no_show'])(
    'allows in_progress → %s',
    async (to) => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'in_progress' });
      prisma.appointment.update.mockResolvedValue({ id: 'a1', state: to });
      const out = await transition({ appointmentId: 'a1', to, actorType: 'system' });
      expect(out.state).toBe(to);
    },
  );
});

describe('refund.quoteRefund', () => {
  it('uses the reported gateway fee when present', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: 6000 });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 250, fallbackFeeFixed: 0 });
    expect(await quoteRefund('a1')).toEqual({
      amountPaid: 250000,
      gatewayFee: 6000,
      refund: 244000,
    });
  });

  it('falls back to the Settings fee model when none reported', async () => {
    prisma.payment.findFirst.mockResolvedValue({ amount: 250000, gatewayFee: null });
    prisma.settings.findUnique.mockResolvedValue({
      fallbackFeePctBps: 250,
      fallbackFeeFixed: 1000,
    });
    expect(await quoteRefund('a1')).toEqual({
      amountPaid: 250000,
      gatewayFee: 7250,
      refund: 242750,
    });
  });
});

describe('refund.initiateRefund', () => {
  it('calls the provider net-of-fee + persists an idempotency key, ref, status', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      amount: 250000,
      gatewayFee: 6000,
      providerRef: 'mock_1',
      refundIdempotencyKey: null,
    });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 0, fallbackFeeFixed: 0 });
    paymentProvider.refund.mockResolvedValue({ refundRef: 'refund_rf_a1', status: 'settled' });
    await initiateRefund({ appointmentId: 'a1' });
    expect(paymentProvider.refund).toHaveBeenCalledWith({
      providerRef: 'mock_1',
      amount: 244000,
      idempotencyKey: 'rf_a1',
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { refundIdempotencyKey: 'rf_a1', refundRef: 'refund_rf_a1', refundStatus: 'settled', nextRefundRetryAt: null },
    });
  });

  it('is a no-op when there is no successful payment', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    expect(await initiateRefund({ appointmentId: 'a1' })).toBeNull();
    expect(paymentProvider.refund).not.toHaveBeenCalled();
  });

  it('marks refundStatus=retrying (idempotency-keyed) on first failure and re-throws', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'p1',
      appointmentId: 'a1',
      amount: 250000,
      gatewayFee: 6000,
      providerRef: 'mock_1',
      refundIdempotencyKey: null,
      refundAttempts: 0,
    });
    prisma.settings.findUnique.mockResolvedValue({ fallbackFeePctBps: 0, fallbackFeeFixed: 0 });
    paymentProvider.refund.mockRejectedValue(new Error('provider down'));
    await expect(initiateRefund({ appointmentId: 'a1' })).rejects.toThrow('provider down');
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ refundIdempotencyKey: 'rf_a1', refundStatus: 'retrying', refundAttempts: 1 }),
      }),
    );
  });
});

describe('cancellation.cancel', () => {
  const state = svc;
  const refund = svc;
  beforeEach(() => {
    vi.spyOn(svc, 'transition').mockResolvedValue({});
    vi.spyOn(svc, 'initiateRefund').mockResolvedValue({ refundRef: 'r', status: 'settled' });
  });
  const future = (mins) => new Date(Date.now() + mins * 60000);

  it('patient ≥2h before → cancelled_refunded + refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'u1',
      slotStart: future(180),
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cancelled_refunded' }),
    );
    expect(refund.initiateRefund).toHaveBeenCalledWith({ appointmentId: 'a1' });
    expect(out.state).toBe('cancelled_refunded');
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund_confirmation', appointmentId: 'a1' }),
    );
  });

  it('patient <2h before → cancelled_no_refund, no refund', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'u1',
      slotStart: future(60),
    });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cancelled_no_refund' }),
    );
    expect(refund.initiateRefund).not.toHaveBeenCalled();
    expect(out.state).toBe('cancelled_no_refund');
  });

  it('doctor cancel → doctor_cancelled + refund (reason required)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      doctorId: 'd1',
      patientUserId: 'u1',
      slotStart: future(30),
    });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    const out = await cancel({
      appointmentId: 'a1',
      actorType: 'doctor',
      actorId: 'docUser',
      reason: 'sick',
    });
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'doctor_cancelled', reason: 'sick' }),
    );
    expect(refund.initiateRefund).toHaveBeenCalled();
    expect(out.state).toBe('doctor_cancelled');
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancellation_apology', appointmentId: 'a1' }),
    );
  });

  it('doctor cancel without a reason → 400', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      doctorId: 'd1',
      slotStart: future(30),
    });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(
      cancel({ appointmentId: 'a1', actorType: 'doctor', actorId: 'docUser' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("patient cancelling someone else's appointment → 404", async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'other',
      slotStart: future(180),
    });
    await expect(
      cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('cancelling a non-confirmed appointment → 409', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'slot_locked',
      patientUserId: 'u1',
      slotStart: future(180),
    });
    await expect(
      cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('patient ≥2h: a refund provider failure does not fail the cancellation', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'u1',
      slotStart: future(180),
    });
    refund.initiateRefund.mockRejectedValueOnce(new Error('provider down'));
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(out.state).toBe('cancelled_refunded');
  });
});

describe('evaluateDueAppointments', () => {
  const state = svc;
  let safeRefund;
  const start = new Date('2026-06-04T10:00:00.000Z');
  const end = new Date('2026-06-04T10:30:00.000Z');
  function mockQueues({ confirmed = [], inProgress = [] }) {
    prisma.appointment.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.state === 'confirmed' ? confirmed : inProgress),
    );
  }
  beforeEach(() => {
    vi.spyOn(svc, 'transition').mockResolvedValue({});
    safeRefund = vi.spyOn(svc, 'safeRefund').mockResolvedValue(undefined);
    prisma.user.findUnique.mockResolvedValue({ email: 'p@x', fullName: 'Pat' });
  });

  it('activates confirmed appts whose slot has started', async () => {
    mockQueues({ confirmed: [{ id: 'a1', slotStart: start, slotEnd: end }] });
    await evaluateDueAppointments(new Date('2026-06-04T10:00:30.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'in_progress', actorType: 'system' }),
    );
  });

  it('marks doctor_no_show at grace when doctor never joined', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: null,
          patientJoinedAt: start,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }),
    );
    expect(safeRefund).toHaveBeenCalledWith('a1');
  });

  it('marks patient_no_show at grace when doctor joined but patient did not', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: start,
          patientJoinedAt: null,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:16:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'patient_no_show' }),
    );
    expect(safeRefund).not.toHaveBeenCalled();
    expect(notification.enqueue).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('completes at slot-end+5 when both joined', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: start,
          patientJoinedAt: start,
          patientUserId: 'p1',
        },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'completed' }),
    );
  });

  it('at the hard cutoff resolves a never-joined appt to doctor_no_show + a data-gap alert', async () => {
    mockQueues({
      inProgress: [
        {
          id: 'a1',
          slotStart: start,
          slotEnd: end,
          doctorJoinedAt: null,
          patientJoinedAt: null,
          patientUserId: 'p1',
        },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    await evaluateDueAppointments(new Date('2026-06-04T10:36:00.000Z'));
    expect(state.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'doctor_no_show' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.evaluation_data_gap' }),
    );
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancellation_apology' }),
    );
  });

  it('does nothing before the grace window', async () => {
    mockQueues({
      inProgress: [
        { id: 'a1', slotStart: start, slotEnd: end, doctorJoinedAt: null, patientJoinedAt: null },
      ],
    });
    await evaluateDueAppointments(new Date('2026-06-04T10:05:00.000Z'));
    expect(state.transition).not.toHaveBeenCalled();
  });
});

describe('refund retry (F06.03 / edge #30)', () => {
  // The cancellation suite's beforeEach stubs svc.initiateRefund via vi.spyOn+mockResolvedValue.
  // vi.clearAllMocks() (global) keeps that stub alive. Restore and re-install a call-through spy
  // so self.initiateRefund inside retryDueRefunds hits the real implementation. Factory mocks
  // (paymentProvider.refund, notification.enqueue, etc.) are unaffected.
  beforeEach(() => {
    svc.initiateRefund.mockRestore?.();       // remove stub spy if present, restore real fn
    // Re-install as a call-through spy: any existing stub's mockResolvedValue is gone; the spy
    // delegates to the real initiateRefund so self.initiateRefund inside retryDueRefunds works.
    vi.spyOn(svc, 'initiateRefund').mockImplementation((...args) => initiateRefund(...args));
  });

  const failedPayment = {
    id: 'p1',
    appointmentId: 'a1',
    providerRef: 'mock_1',
    amount: 250000,
    gatewayFee: 6000,
    refundIdempotencyKey: null,
    refundAttempts: 0,
  };

  it('on provider failure marks retrying with attempts+1 and a backoff schedule', async () => {
    prisma.payment.findFirst.mockResolvedValue(failedPayment);
    prisma.settings.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockRejectedValue(new Error('gateway 500'));
    await expect(initiateRefund({ appointmentId: 'a1' })).rejects.toThrow('gateway 500');
    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.refundStatus).toBe('retrying');
    expect(data.refundAttempts).toBe(1);
    expect(data.nextRefundRetryAt).toBeInstanceOf(Date);
  });

  it('at REFUND_MAX_ATTEMPTS marks failed, audits exhaustion, and enqueues refund_delayed', async () => {
    prisma.payment.findFirst.mockResolvedValue({ ...failedPayment, refundAttempts: 4 }); // 5th try
    prisma.settings.findUnique.mockResolvedValue(null);
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
      doctorId: 'd1',
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    paymentProvider.refund.mockRejectedValue(new Error('gateway 500'));
    await expect(initiateRefund({ appointmentId: 'a1' })).rejects.toThrow();
    const data = prisma.payment.update.mock.calls[0][0].data;
    expect(data.refundStatus).toBe('failed');
    expect(data.nextRefundRetryAt).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.refund_exhausted', targetRef: 'a1' }),
    );
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refund_delayed', appointmentId: 'a1' }),
    );
  });

  it('retryDueRefunds re-runs initiateRefund for due retrying payments', async () => {
    prisma.payment.findMany.mockResolvedValue([{ ...failedPayment, refundStatus: 'retrying' }]);
    prisma.payment.findFirst.mockResolvedValue({ ...failedPayment, refundAttempts: 1 });
    prisma.settings.findUnique.mockResolvedValue(null);
    paymentProvider.refund.mockResolvedValue({ refundRef: 'r1', status: 'settled' });
    await retryDueRefunds(new Date('2099-01-04T08:00:00Z'));
    expect(paymentProvider.refund).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'rf_a1' }),
    );
    const success = prisma.payment.update.mock.calls.at(-1)[0].data;
    expect(success.refundStatus).toBe('settled');
    expect(success.nextRefundRetryAt).toBeNull();
  });
});

describe('transition: prescription issuance (F08.02)', () => {
  it('allows completed → prescription_issued', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'completed' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'prescription_issued' });
    const out = await transition({
      appointmentId: 'a1',
      to: 'prescription_issued',
      actorType: 'doctor',
    });
    expect(out.state).toBe('prescription_issued');
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: expect.objectContaining({ state: 'prescription_issued' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'appointment.prescription_issued',
        actorType: 'doctor',
        targetRef: 'a1',
      }),
      prisma,
    );
  });

  it.each(['completed', 'confirmed', 'in_progress'])(
    'rejects prescription_issued → %s (terminal state)',
    async (to) => {
      prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'prescription_issued' });
      await expect(transition({ appointmentId: 'a1', to, actorType: 'system' })).rejects.toMatchObject(
        { code: 'INVALID_TRANSITION', status: 409 },
      );
    },
  );
});
