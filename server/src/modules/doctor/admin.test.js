import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../lib/password/password.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
}));
vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
vi.mock('./service.js', () => ({ replaceBlocksForDoctor: vi.fn().mockResolvedValue([]) }));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { createDoctor, listAllDoctors } from './admin.service.js';

beforeEach(() => vi.clearAllMocks());

function arrangeTx() {
  const tx = {
    user: { create: vi.fn().mockResolvedValue({ id: 'u-new' }) },
    doctor: { create: vi.fn().mockResolvedValue({ id: 'd-new', userId: 'u-new' }) },
    availabilityBlock: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

const CREATE_DATA = {
  fullName: 'Dr New',
  email: 'new@dermestha.dev',
  phone: '03001234567',
  pmcNumber: 'PMC-9999',
  specialization: 'Acne',
  fee: 250000,
  bio: 'New consultant.',
  initialPassword: 'Password123',
};

describe('createDoctor (F10.01 / DA1)', () => {
  it('creates User(doctor, mustChangePassword=true) + Doctor(pending, inactive) in one tx', async () => {
    const tx = arrangeTx();
    await createDoctor({ data: CREATE_DATA, actorId: 'admin1' });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        role: 'doctor',
        email: 'new@dermestha.dev',
        phone: '03001234567',
        fullName: 'Dr New',
        passwordHash: 'hashed-pw',
        mustChangePassword: true,
      },
    });
    expect(tx.doctor.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-new',
        pmcNumber: 'PMC-9999',
        specialization: 'Acne',
        fee: 250000,
        bio: 'New consultant.',
        isActive: false,
        status: 'pending',
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.created', actorType: 'admin', actorId: 'admin1', targetRef: 'd-new' }),
    );
  });

  it('persists the optional weekly template blocks in the same tx', async () => {
    const tx = arrangeTx();
    const blocks = [{ weekday: 1, startTime: '18:00', endTime: '21:00' }];
    await createDoctor({ data: { ...CREATE_DATA, blocks }, actorId: 'admin1' });
    expect(tx.availabilityBlock.createMany).toHaveBeenCalledWith({
      data: [{ doctorId: 'd-new', weekday: 1, startTime: '18:00', endTime: '21:00' }],
    });
  });

  it('maps P2002 on email to 409 EMAIL_TAKEN and on pmc_number to 409 PMC_TAKEN', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['email'] } });
    await expect(createDoctor({ data: CREATE_DATA, actorId: 'a' })).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
      status: 409,
    });
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002', meta: { target: ['pmc_number'] } });
    await expect(createDoctor({ data: CREATE_DATA, actorId: 'a' })).rejects.toMatchObject({
      code: 'PMC_TAKEN',
      status: 409,
    });
  });
});

describe('listAllDoctors (A-01)', () => {
  it('returns every doctor with contact fields and a future-confirmed count', async () => {
    prisma.doctor.findMany.mockResolvedValue([
      {
        id: 'd1',
        pmcNumber: 'PMC-1001',
        specialization: 'Acne',
        fee: 250000,
        bio: 'b',
        photoUrl: null,
        isActive: false,
        status: 'active',
        user: { fullName: 'Dr A', email: 'a@x.dev', phone: '0300' },
        _count: { appointments: 2 },
      },
    ]);
    const out = await listAllDoctors();
    expect(out[0]).toEqual({
      id: 'd1',
      fullName: 'Dr A',
      email: 'a@x.dev',
      phone: '0300',
      pmcNumber: 'PMC-1001',
      specialization: 'Acne',
      fee: 250000,
      bio: 'b',
      photoUrl: null,
      isActive: false,
      status: 'active',
      upcomingConfirmedCount: 2,
    });
    const arg = prisma.doctor.findMany.mock.calls[0][0];
    expect(arg.where).toBeUndefined(); // ALL doctors, not just active
    expect(arg.include._count.select.appointments.where.state).toBe('confirmed');
  });
});
