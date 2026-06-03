import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { doctor: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock('./availability.service.js', () => ({ nextAvailableSlot: vi.fn(async () => null) }));

import { prisma } from '../lib/prisma.js';
import * as nav from './availability.service.js';
import * as doctor from './doctor.service.js';

beforeEach(() => vi.clearAllMocks());

describe('doctor.service', () => {
  it('listActiveDoctors returns card data + pagination and includes nextAvailableSlot', async () => {
    prisma.$transaction.mockResolvedValue([
      [{ id: 'd1', specialization: 'Acne', fee: 250000, photoUrl: null, user: { fullName: 'Dr A' } }],
      1,
    ]);
    nav.nextAvailableSlot.mockResolvedValue('2026-06-15T13:00:00.000Z');
    const out = await doctor.listActiveDoctors({ page: 1, pageSize: 20 });
    expect(out.page).toEqual({ number: 1, size: 20, total: 1 });
    expect(out.data[0]).toEqual({
      id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, photoUrl: null,
      nextAvailableSlot: '2026-06-15T13:00:00.000Z',
    });
  });

  it('getPublicDoctor returns an active doctor profile', async () => {
    prisma.doctor.findFirst.mockResolvedValue({ id: 'd1', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null, user: { fullName: 'Dr A' } });
    const out = await doctor.getPublicDoctor('d1');
    expect(out).toEqual({ id: 'd1', fullName: 'Dr A', specialization: 'Acne', fee: 250000, bio: 'b', photoUrl: null });
  });

  it('getPublicDoctor throws 404 for a missing/inactive doctor (no existence leak)', async () => {
    prisma.doctor.findFirst.mockResolvedValue(null);
    await expect(doctor.getPublicDoctor('nope')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
