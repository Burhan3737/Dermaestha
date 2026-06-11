import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    medicine: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { list, create, update } from './service.js';

beforeEach(() => vi.clearAllMocks());

describe('medicine.list (F11.01)', () => {
  it('returns active-only, name-sorted; search hits name and genericName', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({ search: 'ada' });
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        OR: [
          { name: { contains: 'ada', mode: 'insensitive' } },
          { genericName: { contains: 'ada', mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
    });
  });

  it('without search filters only on isActive', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await list({});
    expect(prisma.medicine.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });
});

describe('medicine.create / update (F11.02/.03)', () => {
  it('create persists and writes the medicine.created audit row', async () => {
    prisma.medicine.create.mockResolvedValue({ id: 'm1' });
    const data = { name: 'Tretinoin', dosageForms: ['cream'], unitPrice: 20000 };
    await create({ data, actorId: 'admin1' });
    expect(prisma.medicine.create).toHaveBeenCalledWith({ data });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'medicine.created',
        actorType: 'admin',
        actorId: 'admin1',
        targetRef: 'm1',
      }),
    );
  });

  it('update edits in place (incl. isActive=false) and audits the changed fields', async () => {
    prisma.medicine.update.mockResolvedValue({ id: 'm1', isActive: false });
    await update({ id: 'm1', data: { isActive: false }, actorId: 'admin1' });
    expect(prisma.medicine.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { isActive: false },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'medicine.updated',
        targetRef: 'm1',
        meta: { fields: ['isActive'] },
      }),
    );
  });

  it('update of an unknown id maps to 404 NOT_FOUND', async () => {
    prisma.medicine.update.mockRejectedValue(new Error('P2025'));
    await expect(update({ id: 'nope', data: { unitPrice: 1 }, actorId: 'a' })).rejects.toMatchObject(
      { code: 'NOT_FOUND', status: 404 },
    );
  });
});
