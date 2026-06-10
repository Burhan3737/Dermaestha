import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findUnique: vi.fn(), update: vi.fn() },
    doctor: { findUnique: vi.fn() },
  },
}));
vi.mock('../../integrations/video/index.js', () => ({
  videoProvider: {
    createRoom: vi.fn(async (id) => ({ roomName: `appt_${id}`, roomUrl: `u/${id}` })),
    issueToken: vi.fn(async () => ({ token: 'tok', expiresAt: '2026-06-04T10:35:00.000Z' })),
  },
}));

import { prisma } from '../../lib/prisma/prisma.js';
import { issueAppointmentToken, recordJoinFromDailyEvent } from './service.js';
import * as videoSvc from './service.js';
import { daily } from './controller.js';

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
  it('issues a token inside the window for the owning patient', async () => {
    prisma.appointment.findUnique.mockResolvedValue(baseAppt);
    const out = await issueAppointmentToken({
      id: 'a1',
      role: 'patient',
      userId: 'p1',
      now: new Date('2026-06-04T09:55:00.000Z'),
    });
    expect(out.token).toBe('tok');
    expect(out.roomName).toBe('appt_a1');
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

  it('404s when the appointment is not confirmed/in_progress', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, state: 'cancelled_refunded' });
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

describe('recordJoinFromDailyEvent', () => {
  it('sets patientJoinedAt on first patient join only', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: null });
    await recordJoinFromDailyEvent({
      type: 'participant.joined',
      room: 'appt_a1',
      user_name: 'patient',
      timestamp: '2026-06-04T10:01:00.000Z',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: { patientJoinedAt: new Date('2026-06-04T10:01:00.000Z') },
      }),
    );
  });

  it('does not overwrite an existing join timestamp', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: SLOT_START });
    await recordJoinFromDailyEvent({
      type: 'participant.joined',
      room: 'appt_a1',
      user_name: 'patient',
      timestamp: '2026-06-04T10:05:00.000Z',
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});

describe('daily webhook', () => {
  it('forwards a participant event to recordJoinFromDailyEvent and 200s', async () => {
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const req = { body: { type: 'participant.joined', room: 'appt_a1', user_name: 'doctor' } };
    const res = { json: vi.fn() };
    const next = vi.fn();
    await daily(req, res, next);
    expect(spy).toHaveBeenCalledWith(req.body);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    spy.mockRestore();
  });
});
