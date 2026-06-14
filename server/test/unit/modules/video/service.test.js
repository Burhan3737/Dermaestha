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
    verifyWebhook: vi.fn(),
  },
}));
vi.mock('#src/services/audit/audit.service.js', () => ({ record: vi.fn(async () => {}) }));
vi.mock('#src/lib/logger/logger.js', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { prisma } from '#src/lib/prisma/prisma.js';
import { issueAppointmentToken, recordJoinFromDailyEvent } from '#src/modules/video/service.js';
import * as videoSvc from '#src/modules/video/service.js';
import { daily } from '#src/modules/video/controller.js';
import { videoProvider } from '#src/integrations/video/index.js';
import * as audit from '#src/services/audit/audit.service.js';
import { AppError } from '#src/http/AppError.js';

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
      appointmentId: 'a1',
      role: 'patient',
      timestamp: '2026-06-04T10:01:00.000Z',
      eventId: 'evt_1',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: { patientJoinedAt: new Date('2026-06-04T10:01:00.000Z') },
      }),
    );
  });

  it('sets doctorJoinedAt from a doctor-role normalized event', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, doctorJoinedAt: null });
    await recordJoinFromDailyEvent({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'doctor',
      timestamp: '2026-06-04T10:00:00.000Z',
      eventId: 'e',
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { doctorJoinedAt: new Date('2026-06-04T10:00:00.000Z') } }),
    );
  });

  it('does not overwrite an existing join timestamp (first-join wins)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...baseAppt, patientJoinedAt: SLOT_START });
    await recordJoinFromDailyEvent({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'patient',
      timestamp: '2026-06-04T10:05:00.000Z',
      eventId: 'e',
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('ignores participant.left (no join column write)', async () => {
    await recordJoinFromDailyEvent({
      type: 'participant.left',
      appointmentId: 'a1',
      role: 'doctor',
      timestamp: 't',
      eventId: 'e',
    });
    expect(prisma.appointment.findUnique).not.toHaveBeenCalled();
  });
});

describe('daily webhook', () => {
  it('records a verified, normalized event and 200s', async () => {
    const evt = {
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'doctor',
      timestamp: 't',
      eventId: 'e',
    };
    videoProvider.verifyWebhook.mockReturnValue(evt);
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const res = { json: vi.fn() };
    const next = vi.fn();
    await daily({ headers: {}, body: {}, rawBody: '{}' }, res, next);
    expect(spy).toHaveBeenCalledWith(evt);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not record when verifyWebhook returns null (test ping / tokenless) but still 200s', async () => {
    videoProvider.verifyWebhook.mockReturnValue(null);
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const res = { json: vi.fn() };
    await daily({ headers: {}, body: { test: 'test' }, rawBody: '{}' }, res, vi.fn());
    expect(spy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    spy.mockRestore();
  });

  it('on a bad signature: audits video.webhook_rejected and forwards a 401, never recording', async () => {
    videoProvider.verifyWebhook.mockImplementation(() => {
      throw new AppError('INVALID_SIGNATURE', 'bad', 401);
    });
    const spy = vi.spyOn(videoSvc, 'recordJoinFromDailyEvent').mockResolvedValue();
    const next = vi.fn();
    await daily({ headers: {}, body: {}, rawBody: 'x' }, { json: vi.fn() }, next);
    expect(spy).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'video.webhook_rejected', actorType: 'system' }),
    );
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_SIGNATURE', status: 401 }),
    );
    spy.mockRestore();
  });
});
