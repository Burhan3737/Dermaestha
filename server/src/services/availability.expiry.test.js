import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    availabilityBlock: { findMany: vi.fn() },
    settings: { findUnique: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}));

import { prisma } from '../lib/prisma.js';
import { generateSlots } from './availability.service.js';

beforeEach(() => vi.clearAllMocks());

describe('generateSlots lazy-expiry', () => {
  it('queries active appointments while excluding expired slot_locked rows', async () => {
    prisma.availabilityBlock.findMany.mockResolvedValue([{ weekday: 1, startTime: '18:00', endTime: '19:00' }]);
    prisma.settings.findUnique.mockResolvedValue({ minBookingLeadMinutes: 0 });
    prisma.appointment.findMany.mockResolvedValue([]);
    const date = '2099-01-04'; // a Monday
    await generateSlots('d1', date);
    const call = prisma.appointment.findMany.mock.calls[0][0];
    expect(call.where.NOT).toEqual({ state: 'slot_locked', lockExpiresAt: { lt: expect.any(Date) } });
  });
});
