import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    notificationJob: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    appointment: { findUnique: vi.fn() },
  },
}));
vi.mock('../../integrations/email/index.js', () => ({
  emailProvider: { send: vi.fn().mockResolvedValue({ providerId: 'x' }) },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import { enqueue, enqueueBookingEmails } from './service.js';

beforeEach(() => vi.clearAllMocks());

const NOW = new Date('2099-01-04T08:00:00Z');

describe('notification.enqueue', () => {
  it('upserts on (appointmentId, type) so a replayed webhook cannot duplicate a job', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({ id: 'n1' });
    await enqueue({
      type: 'booking_confirmation',
      appointmentId: 'a1',
      recipientEmail: 'p@t.test',
      scheduledFor: NOW,
      vars: { patientName: 'P' },
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: { appointmentId_type: { appointmentId: 'a1', type: 'booking_confirmation' } },
      update: {},
      create: {
        type: 'booking_confirmation',
        appointmentId: 'a1',
        recipientEmail: 'p@t.test',
        scheduledFor: NOW,
        vars: { patientName: 'P' },
      },
    });
  });

  it('uses the provided transaction client (outbox atomicity)', async () => {
    const tx = { notificationJob: { upsert: vi.fn().mockResolvedValue({}) } };
    await enqueue({
      type: 'refund_delayed',
      appointmentId: 'a1',
      recipientEmail: 'p@t.test',
      scheduledFor: NOW,
      client: tx,
    });
    expect(tx.notificationJob.upsert).toHaveBeenCalled();
    expect(prisma.notificationJob.upsert).not.toHaveBeenCalled();
  });
});

describe('notification.enqueueBookingEmails (F07.02 cadence + short-lead skip)', () => {
  const appointment = { id: 'a1', slotStart: new Date('2099-01-06T09:00:00Z') }; // 49h out

  it('enqueues confirmation now + 24h and 1h reminders at slot-relative times', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment,
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation', 'reminder_24h', 'reminder_1h']);
    const r24 = prisma.notificationJob.upsert.mock.calls[1][0].create;
    expect(r24.scheduledFor).toEqual(new Date('2099-01-05T09:00:00Z'));
    const r1 = prisma.notificationJob.upsert.mock.calls[2][0].create;
    expect(r1.scheduledFor).toEqual(new Date('2099-01-06T08:00:00Z'));
  });

  it('skips the 24h reminder when confirmed <24h before slot start', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment: { id: 'a1', slotStart: new Date('2099-01-04T18:00:00Z') }, // 10h out
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation', 'reminder_1h']);
  });

  it('skips both reminders when confirmed <1h before slot start', async () => {
    prisma.notificationJob.upsert.mockResolvedValue({});
    await enqueueBookingEmails({
      appointment: { id: 'a1', slotStart: new Date('2099-01-04T08:30:00Z') }, // 30m out
      patient: { email: 'p@t.test', fullName: 'P' },
      doctorName: 'Dr. D',
      fee: 250000,
      now: NOW,
    });
    const types = prisma.notificationJob.upsert.mock.calls.map((c) => c[0].create.type);
    expect(types).toEqual(['booking_confirmation']);
  });
});

import { emailProvider } from '../../integrations/email/index.js';
import * as audit from '../../services/audit/audit.service.js';
import { dispatchDueNotifications } from './service.js';

const baseJob = {
  id: 'n1',
  type: 'booking_confirmation',
  appointmentId: 'a1',
  recipientEmail: 'p@t.test',
  vars: { patientName: 'P' },
  status: 'pending',
  attempts: 0,
};

describe('notification.dispatchDueNotifications', () => {
  beforeEach(() => {
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationJob.update.mockResolvedValue({});
  });

  it('sends a due job and marks it sent', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalledWith({
      template: 'booking_confirmation',
      to: 'p@t.test',
      vars: { patientName: 'P' },
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) }),
    );
  });

  it('suppresses a reminder whose appointment left confirmed/in_progress (F07.03 invalidation)', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, type: 'reminder_24h' }]);
    prisma.appointment.findUnique.mockResolvedValue({ state: 'cancelled_refunded' });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).not.toHaveBeenCalled();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'suppressed' } }),
    );
  });

  it('still sends a reminder while the appointment is confirmed', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, type: 'reminder_1h' }]);
    prisma.appointment.findUnique.mockResolvedValue({ state: 'confirmed' });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalled();
  });

  it('on failure schedules an exponential-backoff retry', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    emailProvider.send.mockRejectedValueOnce(new Error('smtp down'));
    await dispatchDueNotifications(NOW);
    const update = prisma.notificationJob.update.mock.calls[0][0];
    expect(update.data.attempts).toBe(1);
    // EMAIL_BACKOFF_BASE_SEC=60 default: 60s * 2^1 = 120s after NOW
    expect(update.data.nextAttemptAt).toEqual(new Date(NOW.getTime() + 120_000));
    expect(update.data.status).toBeUndefined();
  });

  it('at EMAIL_MAX_ATTEMPTS marks failed and writes the email.send_failed_final audit alert', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([{ ...baseJob, attempts: 2 }]); // 3rd try
    emailProvider.send.mockRejectedValueOnce(new Error('smtp down'));
    await dispatchDueNotifications(NOW);
    expect(prisma.notificationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed', attempts: 3 }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'email.send_failed_final', targetRef: 'a1' }),
    );
  });

  it('skips a job another pass already claimed (lease flip returned count 0)', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([baseJob]);
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  it('one poisoned job does not starve the batch', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      { ...baseJob, id: 'n1' },
      { ...baseJob, id: 'n2' },
    ]);
    prisma.notificationJob.updateMany
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValue({ count: 1 });
    await dispatchDueNotifications(NOW);
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
  });
});
