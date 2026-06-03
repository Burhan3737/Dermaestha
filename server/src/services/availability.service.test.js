import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    doctor: { findUnique: vi.fn() },
    availabilityBlock: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops) => Promise.all(ops)),
  },
}));

import { prisma } from '../lib/prisma.js';
import * as avail from './availability.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-15T06:00:00.000Z')); // 11:00 Karachi, Monday
  prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
  prisma.appointment.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe('generateSlots', () => {
  it('generates future 30-min slots within a block, after the lead-time, in UTC', async () => {
    // Monday block 18:00–19:00 Karachi → 13:00–14:00 UTC → two 30-min slots.
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots).toEqual([
      { slotStart: '2026-06-15T13:00:00.000Z', slotEnd: '2026-06-15T13:30:00.000Z' },
      { slotStart: '2026-06-15T13:30:00.000Z', slotEnd: '2026-06-15T14:00:00.000Z' },
    ]);
  });

  it('excludes slots occupied by an active appointment', async () => {
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    prisma.appointment.findMany.mockResolvedValue([{ slotStart: new Date('2026-06-15T13:00:00.000Z') }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T13:30:00.000Z']);
  });

  it('filters out slots within the lead-time window', async () => {
    // now = 11:00 Karachi; lead 60min → earliest 12:00 Karachi (07:00 UTC). A 11:30 block start is filtered.
    prisma.settings.findUnique.mockResolvedValue({ id: 1, minBookingLeadMinutes: 60 });
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '11:30', endTime: '12:30' }]);
    const slots = await avail.generateSlots('doc1', '2026-06-15');
    expect(slots.map((s) => s.slotStart)).toEqual(['2026-06-15T07:00:00.000Z']); // only the 12:00 Karachi slot
  });
});

describe('replaceWeeklyBlocks', () => {
  it('rejects with BLOCK_HAS_BOOKINGS when an active future appointment would be orphaned', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
    prisma.appointment.findMany.mockResolvedValue([{ id: 'appt1', slotStart: new Date('2026-06-17T13:00:00.000Z') }]); // Wed 18:00 KHI
    // New blocks cover only Monday → Wednesday appointment is orphaned.
    await expect(avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '21:00' }]))
      .rejects.toMatchObject({ code: 'BLOCK_HAS_BOOKINGS', status: 409 });
    expect(prisma.availabilityBlock.deleteMany).not.toHaveBeenCalled();
  });

  it('replaces blocks when no active appointment is orphaned', async () => {
    prisma.doctor.findUnique.mockResolvedValue({ id: 'doc1' });
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '21:00' }]);
    await avail.replaceWeeklyBlocks('user1', [{ weekday: 1, startTime: '18:00', endTime: '21:00' }]);
    expect(prisma.availabilityBlock.deleteMany).toHaveBeenCalledWith({ where: { doctorId: 'doc1' } });
    expect(prisma.availabilityBlock.createMany).toHaveBeenCalled();
  });
});
