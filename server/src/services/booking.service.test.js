import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));
vi.mock('./availability.service.js', () => ({ generateSlots: vi.fn() }));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../lib/prisma.js';
import * as availability from './availability.service.js';
import { lockSlot } from './booking.service.js';

const slotStart = '2099-01-04T13:00:00.000Z';
const bookable = () =>
  availability.generateSlots.mockResolvedValue([
    { slotStart, slotEnd: '2099-01-04T13:30:00.000Z' },
  ]);

beforeEach(() => {
  vi.clearAllMocks();
  prisma.appointment.findFirst.mockResolvedValue(null); // no existing lock / no overlap by default
});

describe('booking.lockSlot', () => {
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
});
