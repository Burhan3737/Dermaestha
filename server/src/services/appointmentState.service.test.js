import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: { appointment: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock('./audit.service.js', () => ({ record: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../lib/prisma.js';
import * as audit from './audit.service.js';
import { transition } from './appointmentState.service.js';

beforeEach(() => vi.clearAllMocks());

describe('appointmentState.transition', () => {
  it('applies a legal transition + writes an audit entry', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'slot_locked' });
    prisma.appointment.update.mockResolvedValue({ id: 'a1', state: 'confirmed' });
    const out = await transition({
      appointmentId: 'a1',
      to: 'confirmed',
      actorType: 'system',
      data: { feeAtBooking: 250000 },
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { state: 'confirmed', feeAtBooking: 250000 },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'appointment.confirmed',
        actorType: 'system',
        targetRef: 'a1',
      }),
      prisma,
    );
    expect(out.state).toBe('confirmed');
  });

  it('rejects an illegal transition with INVALID_TRANSITION', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', state: 'completed' });
    await expect(
      transition({ appointmentId: 'a1', to: 'confirmed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION', status: 409 });
  });

  it('throws 404 when the appointment is missing', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(
      transition({ appointmentId: 'x', to: 'confirmed', actorType: 'system' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
