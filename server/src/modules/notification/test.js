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
