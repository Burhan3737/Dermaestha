import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Unified prisma mock covering all three merged suites (doctor + availability + lazy-expiry).
vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    availabilityBlock: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

import { prisma } from '#src/lib/prisma/prisma.js';
import * as doctor from '#src/modules/doctor/service.js';
import * as avail from '#src/modules/doctor/service.js';
import { generateSlots } from '#src/modules/doctor/service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // doctor.listActiveDoctors mocks $transaction's RETURN; availability.replaceWeeklyBlocks relies on
  // it EXECUTING the ops. Re-establish the executing default each test so the per-test override
  // (mockResolvedValue) in the doctor suite does not leak into the availability suite.
  prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});
afterEach(() => vi.restoreAllMocks()); // remove the nextAvailableSlot spy between tests

describe('doctor.service', () => {
  it('listActiveDoctors returns card data + pagination and includes nextAvailableSlot', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 'd1',
          specialization: 'Acne',
          fee: 250000,
          photoUrl: null,
          user: { fullName: 'Dr A' },
        },
      ],
      1,
    ]);
    vi.spyOn(doctor, 'nextAvailableSlot').mockResolvedValue('2026-06-15T13:00:00.000Z');
    const out = await doctor.listActiveDoctors({ page: 1, pageSize: 20 });
    expect(out.page).toEqual({ number: 1, size: 20, total: 1 });
    expect(out.data[0]).toEqual({
      id: 'd1',
      fullName: 'Dr A',
      specialization: 'Acne',
      fee: 250000,
      photoUrl: null,
      nextAvailableSlot: '2026-06-15T13:00:00.000Z',
    });
  });

  it('getPublicDoctor returns an active doctor profile', async () => {
    prisma.doctor.findFirst.mockResolvedValue({
      id: 'd1',
      specialization: 'Acne',
      fee: 250000,
      bio: 'b',
      photoUrl: null,
      user: { fullName: 'Dr A' },
    });
    const out = await doctor.getPublicDoctor('d1');
    expect(out).toEqual({
      id: 'd1',
      fullName: 'Dr A',
      specialization: 'Acne',
      fee: 250000,
      bio: 'b',
      photoUrl: null,
    });
  });

  it('getPublicDoctor throws 404 for a missing/inactive doctor (no existence leak)', async () => {
    prisma.doctor.findFirst.mockResolvedValue(null);
    await expect(doctor.getPublicDoctor('nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});

describe('availability', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T06:00:00.000Z')); // 11:00 Karachi, Monday
    prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
    prisma.appointment.findMany.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  describe('generateSlots', () => {
    it('generates future 30-min slots within a block, after the lead-time, in UTC', async () => {
      // Monday block 18:00–19:00 Karachi → 13:00–14:00 UTC → two 30-min slots.
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '18:00', endTime: '19:00' },
      ]);
      const slots = await avail.generateSlots('doc1', '2026-06-15');
      expect(slots).toEqual([
        { slotStart: '2026-06-15T13:00:00.000Z', slotEnd: '2026-06-15T13:30:00.000Z' },
        { slotStart: '2026-06-15T13:30:00.000Z', slotEnd: '2026-06-15T14:00:00.000Z' },
      ]);
    });

    it('excludes slots occupied by an active appointment', async () => {
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '18:00', endTime: '19:00' },
      ]);
      prisma.appointment.findMany.mockResolvedValue([
        { slotStart: new Date('2026-06-15T13:00:00.000Z') },
      ]);
      const slots = await avail.generateSlots('doc1', '2026-06-15');
      expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T13:30:00.000Z']);
    });

    it('filters out slots within the lead-time window', async () => {
      // now = 11:00 Karachi; lead 60min → earliest 12:00 Karachi (07:00 UTC). A 11:30 block start is filtered.
      prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '11:30', endTime: '12:30' },
      ]);
      const slots = await avail.generateSlots('doc1', '2026-06-15');
      expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T07:00:00.000Z']); // only the 12:00 Karachi slot
    });
  });

  describe('replaceWeeklyBlocks', () => {
    it('rejects with BLOCK_HAS_BOOKINGS when an active future appointment would be orphaned', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
      prisma.appointment.findMany.mockResolvedValue([
        { id: 'appt1', slotStart: new Date('2026-06-17T13:00:00.000Z') },
      ]); // Wed 18:00 KHI
      // New blocks cover only Monday → Wednesday appointment is orphaned.
      await expect(
        avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '21:00' }]),
      ).rejects.toMatchObject({ code: 'BLOCK_HAS_BOOKINGS', status: 409 });
      expect(prisma.availabilityBlock.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces blocks when no active appointment is orphaned', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
      prisma.appointment.findMany.mockResolvedValue([]);
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '18:00', endTime: '21:00' },
      ]);
      await avail.replaceWeeklyBlocks('user1', [
        { weekday: 1, startTime: '18:00', endTime: '21:00' },
      ]);
      expect(prisma.availabilityBlock.deleteMany).toHaveBeenCalledWith({
        where: { doctorId: 'doc1' },
      });
      expect(prisma.availabilityBlock.createMany).toHaveBeenCalled();
    });

    it('excludes expired slot_locked holds from the orphan check (lazy expiry, ADR-23)', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
      prisma.appointment.findMany.mockResolvedValue([]);
      await avail.replaceWeeklyBlocks('user1', [
        { weekday: 1, startTime: '18:00', endTime: '21:00' },
      ]);
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            NOT: { state: 'slot_locked', lockExpiresAt: { lt: expect.any(Date) } },
          }),
        }),
      );
    });

    it('rejects with BLOCK_HAS_BOOKINGS when a shortened block no longer fully fits an existing slot', async () => {
      prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
      // Existing appointment at 20:30 Karachi Monday (15:30 UTC) — a full 20:30–21:00 slot.
      prisma.appointment.findMany.mockResolvedValue([
        { id: 'appt1', slotStart: new Date('2026-06-15T15:30:00.000Z') },
      ]);
      // New block ends 20:45 — the 20:30–21:00 slot no longer fully fits.
      await expect(
        avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '20:45' }]),
      ).rejects.toMatchObject({ code: 'BLOCK_HAS_BOOKINGS', status: 409 });
      expect(prisma.availabilityBlock.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getWeeklyBlocks', () => {
    it('returns blocks ordered by weekday then startTime', async () => {
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '18:00', endTime: '21:00' },
      ]);
      const result = await avail.getWeeklyBlocks('doc1');
      expect(prisma.availabilityBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { doctorId: 'doc1' },
          orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        }),
      );
      expect(result).toEqual([{ weekday: 1, startTime: '18:00', endTime: '21:00' }]);
    });
  });

  describe('nextAvailableSlot', () => {
    it('returns null when no slots exist in the lookahead window', async () => {
      prisma.availabilityBlock.findMany.mockResolvedValue([]); // no blocks any day
      const result = await avail.nextAvailableSlot('doc1', 14);
      expect(result).toBeNull();
    });

    it('returns the first available slot it finds', async () => {
      // Monday block 18:00–19:00 → first slot 13:00 UTC. Day 0 of the loop is 2026-06-15 (Monday).
      prisma.availabilityBlock.findMany.mockResolvedValue([
        { weekday: 1, startTime: '18:00', endTime: '19:00' },
      ]);
      const result = await avail.nextAvailableSlot('doc1', 14);
      expect(result).toBe('2026-06-15T13:00:00.000Z');
    });
  });
});

describe('generateSlots lazy-expiry', () => {
  it('queries active appointments while excluding expired slot_locked rows', async () => {
    prisma.availabilityBlock.findMany.mockResolvedValue([
      { weekday: 1, startTime: '18:00', endTime: '19:00' },
    ]);
    prisma.settings.findUnique.mockResolvedValue({ minBookingLeadMinutes: 0 });
    prisma.appointment.findMany.mockResolvedValue([]);
    const date = '2099-01-04'; // a Monday
    await generateSlots('d1', date);
    const call = prisma.appointment.findMany.mock.calls[0][0];
    expect(call.where.NOT).toEqual({
      state: 'slot_locked',
      lockExpiresAt: { lt: expect.any(Date) },
    });
  });
});
