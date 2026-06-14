import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('#src/services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));
vi.mock('#src/lib/password/password.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('#src/modules/doctor/service.js', () => ({
  replaceBlocksForDoctor: vi.fn().mockResolvedValue([]),
}));

import { prisma } from '#src/lib/prisma/prisma.js';
import * as audit from '#src/services/audit/audit.service.js';
import {
  createDoctor,
  listAllDoctors,
  updateDoctor,
  setDoctorActive,
  resetDoctorPassword,
  adminReplaceBlocks,
  saveDoctorPhoto,
  sniffImageExt,
} from '#src/modules/doctor/admin.service.js';
import { hashPassword } from '#src/lib/password/password.js';
import { replaceBlocksForDoctor } from '#src/modules/doctor/service.js';
import { mkdir, writeFile, unlink } from 'node:fs/promises';

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
      expect.objectContaining({
        eventType: 'doctor.created',
        actorType: 'admin',
        actorId: 'admin1',
        targetRef: 'd-new',
      }),
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
    expect(audit.record).not.toHaveBeenCalled();
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

describe('updateDoctor (F10.02)', () => {
  beforeEach(() => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
  });

  it('splits user fields (fullName/phone) from doctor fields and audits the changed keys', async () => {
    const tx = {
      user: { update: vi.fn().mockResolvedValue({}) },
      doctor: { update: vi.fn().mockResolvedValue({ id: 'd1' }) },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));
    await updateDoctor({
      id: 'd1',
      data: { fullName: 'Dr Renamed', fee: 300000 },
      actorId: 'admin1',
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { fullName: 'Dr Renamed' },
    });
    expect(tx.doctor.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { fee: 300000 } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'doctor.updated',
        targetRef: 'd1',
        meta: { fields: ['fullName', 'fee'] },
      }),
    );
  });

  it('unknown id → 404 NOT_FOUND', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    await expect(
      updateDoctor({ id: 'nope', data: { fee: 1 }, actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('setDoctorActive (F10.03 / #9)', () => {
  it('deactivate sets isActive=false ONLY — no cascade fields touched', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.doctor.update.mockResolvedValue({ id: 'd1', isActive: false });
    await setDoctorActive({ id: 'd1', isActive: false, actorId: 'admin1' });
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.deactivated', targetRef: 'd1' }),
    );
  });

  it('reactivate restores listing AND promotes a pending doctor to active status', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', status: 'pending' });
    prisma.doctor.update.mockResolvedValue({ id: 'd1', isActive: true });
    await setDoctorActive({ id: 'd1', isActive: true, actorId: 'admin1' });
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { isActive: true, status: 'active' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.reactivated' }),
    );
  });
});

describe('resetDoctorPassword (DA5)', () => {
  it('hashes the admin-set password and re-arms mustChangePassword', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.user.update.mockResolvedValue({});
    await resetDoctorPassword({ id: 'd1', newPassword: 'NewPass123', actorId: 'admin1' });
    expect(hashPassword).toHaveBeenCalledWith('NewPass123');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'hashed-pw', mustChangePassword: true },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.password_reset', targetRef: 'd1' }),
    );
  });
});

describe('adminReplaceBlocks (F10.01/.02 weekly template)', () => {
  it('delegates to the doctorId-keyed core and audits', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    await adminReplaceBlocks({ doctorId: 'd1', blocks: [], actorId: 'admin1' });
    expect(replaceBlocksForDoctor).toHaveBeenCalledWith('d1', []);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.availability_updated', targetRef: 'd1' }),
    );
  });

  it('unknown doctor → 404', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    await expect(
      adminReplaceBlocks({ doctorId: 'nope', blocks: [], actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('sniffImageExt (magic bytes — extension and client MIME are never trusted)', () => {
  it('detects jpeg / png / webp and rejects everything else (incl. SVG)', () => {
    expect(sniffImageExt(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImageExt(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'png',
    );
    expect(
      sniffImageExt(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])),
    ).toBe('webp');
    expect(sniffImageExt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageExt(Buffer.from([0x00, 0x01]))).toBeNull();
  });
});

describe('saveDoctorPhoto (F10.01 photo upload)', () => {
  it('writes uploads/doctors/<id>.<ext>, updates photoUrl, audits', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1', photoUrl: null });
    prisma.doctor.update.mockResolvedValue({ id: 'd1' });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const out = await saveDoctorPhoto({ id: 'd1', buffer: jpeg, actorId: 'admin1' });
    expect(mkdir).toHaveBeenCalledWith(expect.stringContaining('doctors'), { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('d1.jpg'), jpeg);
    expect(unlink).not.toHaveBeenCalled();
    expect(prisma.doctor.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { photoUrl: '/uploads/doctors/d1.jpg' },
    });
    expect(out).toEqual({ photoUrl: '/uploads/doctors/d1.jpg' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'doctor.photo_updated', targetRef: 'd1' }),
    );
  });

  it('rejects a non-image buffer with 400 INVALID_FILE and writes nothing', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    await expect(
      saveDoctorPhoto({ id: 'd1', buffer: Buffer.from('<svg/>'), actorId: 'a' }),
    ).rejects.toMatchObject({ code: 'INVALID_FILE', status: 400 });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('unlinks the old photo when extension changes (e.g. png → jpg)', async () => {
    prisma.doctor.findUnique.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      photoUrl: '/uploads/doctors/d1.png',
    });
    prisma.doctor.update.mockResolvedValue({ id: 'd1' });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    await saveDoctorPhoto({ id: 'd1', buffer: jpeg, actorId: 'admin1' });
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('d1.png'));
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('d1.jpg'), jpeg);
  });

  it('unknown id → 404 NOT_FOUND', async () => {
    prisma.doctor.findUnique.mockResolvedValue(null);
    await expect(
      saveDoctorPhoto({
        id: 'missing',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        actorId: 'a',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
