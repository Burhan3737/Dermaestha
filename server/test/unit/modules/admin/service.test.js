import { describe, it, expect, vi, beforeEach } from 'vitest';
import { karachiWallTimeToUtc } from '#src/lib/tz/tz.js';

vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    notificationJob: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('#src/services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '#src/lib/prisma/prisma.js';
import * as audit from '#src/services/audit/audit.service.js';
import {
  listRecords,
  getRecordDetail,
  listAuditEntries,
  resendEmail,
  listAlerts,
  getSettings,
  updateSettings,
} from '#src/modules/admin/service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // listRecords runs findMany+count through one $transaction array call.
  prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

const ROW = {
  id: 'a1',
  slotStart: new Date('2099-01-02T13:00:00Z'),
  slotEnd: new Date('2099-01-02T13:30:00Z'),
  state: 'confirmed',
  forSelf: false,
  subjectName: 'Ali',
  feeAtBooking: 250000,
  paymentReference: 'TXN-9',
  paymentSubmittedAt: new Date('2099-01-02T12:00:00Z'),
  patient: { fullName: 'Parent P', email: 'p@t.test' },
  doctor: { user: { fullName: 'Dr A' } },
};

describe('admin.listRecords (F13.01)', () => {
  it('maps doc-02 row columns (manual-payment: feeAtBooking + bank reference)', async () => {
    prisma.appointment.findMany.mockResolvedValue([ROW]);
    prisma.appointment.count.mockResolvedValue(1);
    const out = await listRecords({ page: 1, pageSize: 20 });
    expect(out.data[0]).toEqual({
      id: 'a1',
      slotStart: ROW.slotStart,
      slotEnd: ROW.slotEnd,
      state: 'confirmed',
      patientName: 'Parent P',
      patientEmail: 'p@t.test',
      subjectName: 'Ali',
      doctorName: 'Dr A',
      amountDue: 250000,
      paymentReference: 'TXN-9',
      paymentSubmittedAt: ROW.paymentSubmittedAt,
    });
    expect(out.page).toEqual({ number: 1, size: 20, total: 1 });
  });

  it('composes the filter superset into the where clause', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.count.mockResolvedValue(0);
    await listRecords({
      page: 2,
      pageSize: 10,
      patient: 'p@t.test',
      doctorName: 'Ayesha',
      paymentRef: 'TXN-9',
      state: 'confirmed',
      from: '2099-01-01',
      to: '2099-02-01',
    });
    const arg = prisma.appointment.findMany.mock.calls[0][0];
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
    expect(arg.orderBy).toEqual({ slotStart: 'desc' });
    expect(arg.where.state).toBe('confirmed');
    expect(arg.where.patient.OR[0].email.contains).toBe('p@t.test');
    expect(arg.where.doctor.user.fullName.contains).toBe('Ayesha');
    expect(arg.where.paymentReference.contains).toBe('TXN-9');
    expect(arg.where.slotStart.gte).toEqual(karachiWallTimeToUtc('2099-01-01', '00:00'));
    expect(arg.where.slotStart.lt).toEqual(
      new Date(karachiWallTimeToUtc('2099-02-01', '00:00').getTime() + 24 * 60 * 60 * 1000),
    );
  });
});

describe('admin.getRecordDetail (F13.02)', () => {
  it('returns the appointment + transition history + prescriptions + email jobs', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...ROW,
      prescriptions: [{ id: 'rx1', issuedAt: new Date('2099-01-02T14:00:00Z'), items: [] }],
      notificationJobs: [
        { id: 'n1', type: 'booking_confirmation', status: 'failed', lastError: 'boom' },
      ],
    });
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'e1', at: new Date(), eventType: 'appointment.confirmed', actorType: 'system' },
    ]);
    const out = await getRecordDetail('a1');
    expect(out.appointment.id).toBe('a1');
    expect(out.history[0].eventType).toBe('appointment.confirmed');
    expect(out.prescriptions).toHaveLength(1);
    expect(out.notificationJobs[0].status).toBe('failed');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { targetRef: 'a1' },
      orderBy: { at: 'asc' },
    });
  });

  it('unknown id → 404', async () => {
    prisma.appointment.findUnique.mockResolvedValue(null);
    await expect(getRecordDetail('nope')).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('admin.listAuditEntries (F13.01 audit filters)', () => {
  it('filters by appointmentId/eventType/actorType/date and pages newest-first', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await listAuditEntries({
      page: 1,
      pageSize: 50,
      appointmentId: 'a1',
      eventType: 'login',
      actorType: 'doctor',
      from: '2099-01-01',
    });
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      targetRef: 'a1',
      eventType: 'login',
      actorType: 'doctor',
      at: { gte: karachiWallTimeToUtc('2099-01-01', '00:00') },
    });
    expect(arg.orderBy).toEqual({ at: 'desc' });
  });

  it('email filter resolves the user and filters on actorId; unknown email matches nothing', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await listAuditEntries({ email: 'ghost@t.test' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.actorId).toBe('__no_match__');
  });

  it('to-date boundary is exclusive at the next Karachi midnight', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await listAuditEntries({ to: '2099-01-01' });
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where.at.lt).toEqual(
      new Date(karachiWallTimeToUtc('2099-01-01', '00:00').getTime() + 24 * 60 * 60 * 1000),
    );
  });
});

describe('admin.resendEmail (F12.02 Email-Only Re-Trigger)', () => {
  it('resets ONLY a failed job back to pending for the worker to pick up, and audits', async () => {
    prisma.notificationJob.findUnique.mockResolvedValue({
      id: 'n1',
      appointmentId: 'a1',
      type: 'booking_confirmation',
      status: 'failed',
    });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 1 });
    const out = await resendEmail({ jobId: 'n1', actorId: 'admin1' });
    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', status: 'failed' },
      data: { status: 'pending', attempts: 0, nextAttemptAt: null, lastError: null },
    });
    expect(out).toEqual({ id: 'n1', status: 'pending' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'admin.email_resend',
        actorId: 'admin1',
        targetRef: 'a1',
        meta: { jobId: 'n1', type: 'booking_confirmation' },
      }),
    );
  });

  it('a non-failed job → 409 INVALID_STATE; unknown job → 404', async () => {
    prisma.notificationJob.findUnique.mockResolvedValue({ id: 'n1', status: 'sent' });
    await expect(resendEmail({ jobId: 'n1', actorId: 'a' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
    prisma.notificationJob.findUnique.mockResolvedValue(null);
    await expect(resendEmail({ jobId: 'nope', actorId: 'a' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('concurrent flip after the read loses cleanly with 409', async () => {
    prisma.notificationJob.findUnique.mockResolvedValue({
      id: 'n1',
      appointmentId: 'a1',
      type: 'booking_confirmation',
      status: 'failed',
    });
    prisma.notificationJob.updateMany.mockResolvedValue({ count: 0 });
    await expect(resendEmail({ jobId: 'n1', actorId: 'admin1' })).rejects.toMatchObject({
      code: 'INVALID_STATE',
      status: 409,
    });
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('admin settings (F14)', () => {
  const SETTINGS = {
    id: 1,
    minBookingLeadMinutes: 60,
    bankName: 'Test Bank',
    bankAccountName: 'Clinic',
    bankAccountNumber: '0123',
    bankInstructions: 'Transfer then enter ref.',
  };

  it('getSettings reads the singleton row (bank fields)', async () => {
    prisma.settings.findUnique.mockResolvedValue(SETTINGS);
    const out = await getSettings();
    expect(prisma.settings.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(out).toEqual({
      minBookingLeadMinutes: 60,
      bankName: 'Test Bank',
      bankAccountName: 'Clinic',
      bankAccountNumber: '0123',
      bankInstructions: 'Transfer then enter ref.',
    });
  });

  it('getSettings returns null when the singleton row is missing (unseeded DB)', async () => {
    prisma.settings.findUnique.mockResolvedValue(null);
    expect(await getSettings()).toBeNull();
  });

  it('updateSettings writes the tunables and audits before→after (F14.03)', async () => {
    prisma.settings.findUnique.mockResolvedValue(SETTINGS);
    const after = { ...SETTINGS, minBookingLeadMinutes: 30, bankName: 'New Bank' };
    prisma.settings.update.mockResolvedValue(after);
    const data = { minBookingLeadMinutes: 30, bankName: 'New Bank' };
    await updateSettings({ data, actorId: 'admin1' });
    expect(prisma.settings.update).toHaveBeenCalledWith({ where: { id: 1 }, data });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'settings.updated',
        actorType: 'admin',
        actorId: 'admin1',
        meta: expect.objectContaining({
          before: expect.objectContaining({ minBookingLeadMinutes: 60, bankName: 'Test Bank' }),
          after: expect.objectContaining({ minBookingLeadMinutes: 30, bankName: 'New Bank' }),
        }),
      }),
    );
  });
});

describe('admin.listAlerts (F12.01 — audit sources + awaiting-prescription)', () => {
  it('merges audit-row alerts with derived awaiting-prescription rows, newest first', async () => {
    const NOW = new Date('2099-01-10T12:00:00Z');
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'e1',
        at: new Date('2099-01-10T11:00:00Z'),
        eventType: 'email.send_failed_final',
        actorType: 'system',
        targetRef: 'a1',
        reason: 'prescription_ready: boom',
        meta: null,
      },
      {
        id: 'e2',
        at: new Date('2099-01-09T10:00:00Z'),
        eventType: 'payment.submitted',
        actorType: 'patient',
        targetRef: 'a2',
        reason: null,
        meta: { reference: 'TXN-1' },
      },
    ]);
    prisma.appointment.findMany.mockResolvedValue([
      {
        id: 'a3',
        slotEnd: new Date('2099-01-09T18:00:00Z'),
        doctor: { user: { fullName: 'Dr A' } },
      },
    ]);
    prisma.notificationJob.findMany.mockResolvedValue([
      { id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' },
    ]);
    const out = await listAlerts(NOW);
    expect(out.map((a) => a.kind)).toEqual([
      'email.send_failed_final',
      'awaiting_prescription',
      'payment.submitted',
    ]);
    // the email alert is enriched with its resendable failed jobs
    expect(out[0].failedJobs).toEqual([
      { id: 'n9', appointmentId: 'a1', type: 'prescription_ready', status: 'failed' },
    ]);
    // the derived predicate: confirmed, no prescription, slot ended >12h before now
    const apptArg = prisma.appointment.findMany.mock.calls[0][0];
    expect(apptArg.where.state).toBe('confirmed');
    expect(apptArg.where.prescriptions).toEqual({ none: {} });
    expect(apptArg.where.slotEnd.lte).toEqual(new Date('2099-01-10T00:00:00Z')); // NOW − 12h
    expect(apptArg.take).toBe(100);
    // the audit-source list is the manual-payment alert set
    const auditArg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(auditArg.where.eventType.in).toEqual([
      'payment.submitted',
      'email.send_failed_final',
      'system.unhandled_exception',
    ]);
  });
});
