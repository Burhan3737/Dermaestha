import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findUnique: vi.fn(), update: vi.fn() },
    doctor: { findUnique: vi.fn() },
  },
}));
vi.mock('#src/integrations/video/index.js', () => ({
  videoProvider: {
    createRoom: vi.fn(async (id) => ({ roomName: `appt_${id}`, roomUrl: `u/${id}` })),
    issueToken: vi.fn(async () => ({ token: 'tok', expiresAt: '2026-06-04T10:35:00.000Z' })),
  },
}));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn(async () => {}) }));
vi.mock('#src/lib/logger/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { prisma } from '#src/lib/prisma/prisma.js';
import { issueAppointmentToken } from '#src/modules/video/service.js';

const SLOT_START = new Date('2026-06-04T10:00:00.000Z');
const SLOT_END = new Date('2026-06-04T10:30:00.000Z');
const baseAppt = {
  id: 'a1',
  state: 'confirmed',
  slotStart: SLOT_START,
  slotEnd: SLOT_END,
  patientUserId: 'p1',
  doctorId: 'd1',
  patient: { fullName: 'Pat' },
  doctor: { user: { fullName: 'Dr A' } },
};

beforeEach(() => vi.clearAllMocks());

describe('issueAppointmentToken', () => {
  it('issues a token inside the window for the owning patient; joinSimUrl is always null', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    const out = await issueAppointmentToken({
      id: 'a1',
      role: 'patient',
      userId: 'p1',
      now: new Date('2026-06-04T09:55:00.000Z'),
    });
    expect(out.token).toBe('tok');
    expect(out.roomName).toBe('appt_a1');
    expect(out.joinSimUrl).toBeNull();
  });

  it('rejects before the window opens with VIDEO_WINDOW_CLOSED (422)', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    await expect(
      issueAppointmentToken({
        id: 'a1',
        role: 'patient',
        userId: 'p1',
        now: new Date('2026-06-04T09:30:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'VIDEO_WINDOW_CLOSED', status: 422 });
  });

  it('404s a non-owning patient (no existence leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    await expect(
      issueAppointmentToken({ id: 'a1', role: 'patient', userId: 'other', now: SLOT_START }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('404s when the appointment is not confirmed', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, state: 'cancelled' });
    await expect(
      issueAppointmentToken({ id: 'a1', role: 'patient', userId: 'p1', now: SLOT_START }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('issues a token for the owning doctor (resolved via their Doctor row)', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    const out = await issueAppointmentToken({
      id: 'a1',
      role: 'doctor',
      userId: 'docUser',
      now: new Date('2026-06-04T09:55:00.000Z'),
    });
    expect(out.token).toBe('tok');
    expect(prisma.doctor.findUnique).toHaveBeenCalledWith({
      where: { userId: 'docUser' },
      select: { id: true },
    });
  });
});
