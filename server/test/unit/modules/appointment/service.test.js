import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unified prisma mock for the appointment service unit suites.
vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    doctor: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn() },
  },
}));
vi.mock('#src/modules/doctor/service.js', () => ({ generateSlots: vi.fn() }));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('#src/modules/analytics/service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));
vi.mock('#src/modules/notification/service.js', () => ({
  enqueue: vi.fn().mockResolvedValue({}),
  enqueueBookingEmails: vi.fn().mockResolvedValue(undefined),
  enqueueBookingConfirmation: vi.fn().mockResolvedValue(undefined),
  enqueuePaymentSubmittedAdmin: vi.fn().mockResolvedValue(undefined),
  enqueuePaymentNotReceived: vi.fn().mockResolvedValue(undefined),
  slotStartLocal: vi.fn().mockReturnValue('Mon, 06 Jan 2099 09:00'),
}));

import { prisma } from '#src/lib/prisma/prisma.js';
import * as availability from '#src/modules/doctor/service.js';
import * as audit from '#src/services/audit/audit.service.js';
import * as analytics from '#src/modules/analytics/service.js';
import * as notification from '#src/modules/notification/service.js';
import * as svc from '#src/modules/appointment/service.js';

const {
  listForRole,
  getForRole,
  lockSlot,
  transition,
  submitPaymentReference,
  adminDecision,
  cancel,
} = svc;

beforeEach(() => vi.clearAllMocks());

describe('appointment.listForRole (patient)', () => {
  it('Upcoming = pending OR confirmed-not-yet-ended, time-based at the DB level', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a1',
        slotStart: new Date('2099-01-04T13:00:00Z'),
        slotEnd: new Date('2099-01-04T13:30:00Z'),
        state: 'confirmed',
        feeAtBooking: 250000,
        paymentReference: null,
        forSelf: true,
        subjectName: null,
        doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
        _count: { prescriptions: 0 },
      },
    ]);
    const out = await listForRole({ role: 'patient', userId: 'u1' });
    expect(out[0]).toEqual({
      id: 'a1',
      slotStart: '2099-01-04T13:00:00.000Z',
      slotEnd: '2099-01-04T13:30:00.000Z',
      state: 'confirmed',
      feeAtBooking: 250000,
      paymentReference: null,
      forSelf: true,
      subjectName: null,
      doctorName: 'Dr A',
      specialization: 'Acne',
      doctorPhotoUrl: null,
      hasPrescription: false,
    });
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.patientUserId).toBe('u1');
    expect(arg.where.OR[0]).toEqual({ state: 'pending' });
    expect(arg.where.OR[1].state).toBe('confirmed');
    expect(arg.where.OR[1].slotEnd.gte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ slotStart: 'asc' });
  });

  it('Past (scope=history) = confirmed-and-ended OR cancelled, newest-first', async () => {
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a2',
        slotStart: new Date('2099-01-02T13:00:00Z'),
        slotEnd: new Date('2099-01-02T13:30:00Z'),
        state: 'confirmed',
        feeAtBooking: 250000,
        paymentReference: 'TXN-1',
        forSelf: true,
        subjectName: null,
        doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
        _count: { prescriptions: 2 },
      },
    ]);
    const out = await listForRole({ role: 'patient', userId: 'u1', scope: 'history' });
    expect(out[0].hasPrescription).toBe(true);
    expect(out[0].state).toBe('confirmed');
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.where.patientUserId).toBe('u1');
    expect(arg.where.OR[0].state).toBe('confirmed');
    expect(arg.where.OR[0].slotEnd.lt).toBeInstanceOf(Date);
    expect(arg.where.OR[1]).toEqual({ state: 'cancelled' });
    expect(arg.orderBy).toEqual({ slotStart: 'desc' });
  });
});

describe('appointment.listForRole (doctor)', () => {
  it("default scope is today's confirmed appointments and rows include patientName", async () => {
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
        _count: { prescriptions: 0 },
      },
    ]);
    const rows = await listForRole({ role: 'doctor', userId: 'docUser' });
    expect(rows[0].patientName).toBe('Parent P');
    const where = prisma.appointment.findMany.mock.calls[0][0].where;
    expect(where.state).toBe('confirmed');
    expect(where.slotStart.lt.getTime() - where.slotStart.gte.getTime()).toBe(24 * 3600 * 1000);
  });
});

describe('appointment.getForRole', () => {
  it('exposes paymentInstructions + paymentReference for a pending appointment', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      state: 'pending',
      slotStart: new Date('2099-01-04T13:00:00Z'),
      slotEnd: new Date('2099-01-04T13:30:00Z'),
      feeAtBooking: 250000,
      paymentReference: 'TXN-7',
      paymentSubmittedAt: new Date('2099-01-04T12:00:00Z'),
      forSelf: true,
      subjectName: null,
      doctorId: 'd1',
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
    });
    prisma.settings.findUnique.mockResolvedValue({
      bankName: 'Test Bank',
      bankAccountName: 'Clinic',
      bankAccountNumber: '0123',
      bankInstructions: 'Transfer then enter ref.',
    });
    const out = await getForRole({ id: 'a1', role: 'patient', userId: 'u1' });
    expect(out.paymentReference).toBe('TXN-7');
    expect(out.paymentInstructions).toEqual({
      amountDue: 250000,
      bankName: 'Test Bank',
      bankAccountName: 'Clinic',
      bankAccountNumber: '0123',
      bankInstructions: 'Transfer then enter ref.',
    });
    expect(typeof out.serverNow).toBe('string');
  });

  it('a confirmed appointment has no paymentInstructions', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      patientUserId: 'u1',
      state: 'confirmed',
      slotStart: new Date('2099-01-04T13:00:00Z'),
      slotEnd: new Date('2099-01-04T13:30:00Z'),
      feeAtBooking: 250000,
      paymentReference: 'TXN-7',
      forSelf: true,
      subjectName: null,
      doctorId: 'd1',
      doctor: { id: 'd1', specialization: 'Acne', photoUrl: null, user: { fullName: 'Dr A' } },
    });
    const out = await getForRole({ id: 'a1', role: 'patient', userId: 'u1' });
    expect(out.paymentInstructions).toBeUndefined();
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
});

describe('booking.lockSlot', () => {
  const slotStart = '2099-01-04T13:00:00.000Z';
  const bookable = () =>
    availability.generateSlots.mockResolvedValue([
      { slotStart, slotEnd: '2099-01-04T13:30:00.000Z' },
    ]);

  beforeEach(() => {
    prisma.appointment.findFirst.mockResolvedValue(null); // no overlap by default
    prisma.doctor.findFirst.mockResolvedValue({ id: 'd1', fee: 250000 }); // active doctor
  });

  it('rejects a slot that is not bookable', async () => {
    availability.generateSlots.mockResolvedValue([]);
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'SLOT_NOT_BOOKABLE', status: 422 });
  });

  it('inserts a pending row with the snapshotted fee on the happy path', async () => {
    bookable();
    prisma.appointment.create.mockResolvedValue({ id: 'a1', state: 'pending', feeAtBooking: 250000 });
    const out = await lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true });
    expect(out).toMatchObject({ id: 'a1', state: 'pending', feeAtBooking: 250000 });
    expect(prisma.appointment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: 'pending', feeAtBooking: 250000 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.pending', targetRef: 'a1' }),
    );
  });

  it('rejects an overlapping appointment with OVERLAP (409)', async () => {
    bookable();
    prisma.appointment.findFirst.mockResolvedValueOnce({ id: 'ov1' });
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'OVERLAP', status: 409 });
  });

  it('maps a unique-index collision (P2002) to SLOT_TAKEN (409)', async () => {
    bookable();
    prisma.appointment.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd1', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 });
  });

  it('rejects locking a slot of an inactive/unknown doctor with 404 (invariant #9, no leak)', async () => {
    prisma.doctor.findFirst.mockResolvedValue(null);
    await expect(
      lockSlot({ patientUserId: 'u1', doctorId: 'd-gone', slotStart, forSelf: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('appointmentState.transition', () => {
  it('applies a legal transition (pending → confirmed) + writes an audit entry', async () => {
    prisma.appointment.findUnique
      .mockResolvedValueOnce({ id: 'a1', state: 'pending' })
      .mockResolvedValueOnce({ id: 'a1', state: 'confirmed' });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    const out = await transition({ appointmentId: 'a1', to: 'confirmed', actorType: 'admin' });
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', state: 'pending' },
      data: { state: 'confirmed' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'appointment.confirmed', targetRef: 'a1' }),
      prisma,
    );
    expect(out.state).toBe('confirmed');
  });

  it('allows confirmed → cancelled (the only legal move from confirmed)', async () => {
    prisma.appointment.findUnique
      .mockResolvedValueOnce({ id: 'a1', state: 'confirmed' })
      .mockResolvedValueOnce({ id: 'a1', state: 'cancelled' });
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    const out = await transition({ appointmentId: 'a1', to: 'cancelled', actorType: 'system' });
    expect(out.state).toBe('cancelled');
  });

  it('rejects an illegal transition (confirmed → pending) with INVALID_TRANSITION', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    await expect(
      transition({ appointmentId: 'a1', to: 'pending', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('throws 404 when the appointment is missing', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(
      transition({ appointmentId: 'x', to: 'confirmed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('a concurrent transition that already moved the row fails 409 instead of double-applying', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    prisma.appointment.updateMany.mockResolvedValue({ count: 0 }); // raced
    await expect(
      transition({ appointmentId: 'a1', to: 'cancelled', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('submitPaymentReference', () => {
  it('records the reference, stays pending, audits, and alerts the admin', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'pending',
      patientUserId: 'u1',
    });
    prisma.appointment.update.mockResolvedValue({});
    const out = await submitPaymentReference({
      patientUserId: 'u1',
      appointmentId: 'a1',
      reference: 'TXN-12345',
    });
    expect(out).toEqual({ ok: true });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ paymentReference: 'TXN-12345' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'payment.submitted', targetRef: 'a1' }),
    );
    expect(notification.enqueuePaymentSubmittedAdmin).toHaveBeenCalled();
  });

  it('404s for a non-owner', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'pending', patientUserId: 'other' });
    await expect(
      submitPaymentReference({ patientUserId: 'u1', appointmentId: 'a1', reference: 'x123' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('409s when no longer pending', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed', patientUserId: 'u1' });
    await expect(
      submitPaymentReference({ patientUserId: 'u1', appointmentId: 'a1', reference: 'x123' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });
});

describe('adminDecision', () => {
  beforeEach(() => {
    vi.spyOn(svc, 'transition').mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'Pat' });
    prisma.doctor.findUnique.mockResolvedValue({ user: { fullName: 'Dr A' } });
  });

  it('accept → confirmed + booking confirmation + analytics event', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'pending',
      patientUserId: 'u1',
      doctorId: 'd1',
      feeAtBooking: 250000,
    });
    const out = await adminDecision({ appointmentId: 'a1', accept: true, actorId: 'admin1' });
    expect(out).toEqual({ state: 'confirmed' });
    expect(svc.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'confirmed', actorType: 'admin' }),
    );
    expect(notification.enqueueBookingConfirmation).toHaveBeenCalled();
    expect(analytics.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'booking_confirmed' }),
    );
  });

  it('reject → cancelled + payment_not_received email', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'pending',
      patientUserId: 'u1',
      doctorId: 'd1',
    });
    const out = await adminDecision({ appointmentId: 'a1', accept: false, actorId: 'admin1' });
    expect(out).toEqual({ state: 'cancelled' });
    expect(svc.transition).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cancelled', reason: 'payment not received' }),
    );
    expect(notification.enqueuePaymentNotReceived).toHaveBeenCalled();
  });

  it('409s when the appointment is not pending', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    await expect(
      adminDecision({ appointmentId: 'a1', accept: true, actorId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });
});

describe('cancellation.cancel', () => {
  beforeEach(() => {
    vi.spyOn(svc, 'transition').mockResolvedValue({});
    prisma.user.findUnique.mockResolvedValue({ email: 'p@t.test', fullName: 'P' });
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', user: { fullName: 'Dr A' } });
  });

  it('patient cancels a confirmed appointment → cancelled + cancellation email (no refund)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(svc.transition).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'cancelled', actorType: 'patient' }),
    );
    expect(out.state).toBe('cancelled');
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cancellation', appointmentId: 'a1' }),
    );
  });

  it('patient can cancel a pending appointment', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'pending',
      patientUserId: 'u1',
      doctorId: 'd1',
      slotStart: new Date('2099-01-06T09:00:00Z'),
    });
    const out = await cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' });
    expect(out.state).toBe('cancelled');
  });

  it("patient cancelling someone else's appointment → 404", async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'confirmed',
      patientUserId: 'other',
    });
    await expect(
      cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('cancelling an already-cancelled appointment → 409', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      id: 'a1',
      state: 'cancelled',
      patientUserId: 'u1',
    });
    await expect(
      cancel({ appointmentId: 'a1', actorType: 'patient', actorId: 'u1' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });
});
