import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn(), findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
  },
}));
vi.mock('./refund.service.js', () => ({ quoteRefund: vi.fn() }));

import { prisma } from '../lib/prisma.js';
import { quoteRefund } from './refund.service.js';
import { listForRole, getForRole } from './appointment.service.js';

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
    quoteRefund.mockResolvedValue({ amountPaid: 250000, gatewayFee: 6000, refund: 244000 });
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
