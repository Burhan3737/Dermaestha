import { describe, it, expect, vi, beforeEach } from 'vitest';
import { karachiWallTimeToUtc } from '../../lib/tz/tz.js';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    auditLog: { findMany: vi.fn(), count: vi.fn() },
    notificationJob: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    settings: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../services/audit/audit.service.js', () => ({
  record: vi.fn().mockResolvedValue({}),
}));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import { listRecords, getRecordDetail } from './service.js';

beforeEach(() => {
  vi.clearAllMocks();
  // listRecords runs findMany+count through one $transaction array call.
  prisma.$transaction.mockImplementation(async (ops) => Promise.all(ops));
});

const ROW = {
  id: 'a1',
  slotStart: new Date('2099-01-02T13:00:00Z'),
  slotEnd: new Date('2099-01-02T13:30:00Z'),
  state: 'prescription_issued',
  disputed: false,
  forSelf: false,
  subjectName: 'Ali',
  patient: { fullName: 'Parent P', email: 'p@t.test' },
  doctor: { user: { fullName: 'Dr A' } },
  payments: [
    { status: 'failed', amount: 250000, providerRef: 'pf_bad', refundRef: null, refundStatus: null },
    { status: 'success', amount: 250000, providerRef: 'pf_ok', refundRef: 'rf_1', refundStatus: 'settled' },
  ],
};

describe('admin.listRecords (F13.01)', () => {
  it('maps doc-02 row columns; the SUCCESS payment wins (enum is success, not paid)', async () => {
    prisma.appointment.findMany.mockResolvedValue([ROW]);
    prisma.appointment.count.mockResolvedValue(1);
    const out = await listRecords({ page: 1, pageSize: 20 });
    expect(out.data[0]).toEqual({
      id: 'a1',
      slotStart: ROW.slotStart,
      slotEnd: ROW.slotEnd,
      state: 'prescription_issued',
      disputed: false,
      patientName: 'Parent P',
      patientEmail: 'p@t.test',
      subjectName: 'Ali',
      doctorName: 'Dr A',
      amountPaid: 250000,
      paymentRef: 'pf_ok',
      refundRef: 'rf_1',
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
      paymentRef: 'pf_ok',
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
    expect(arg.where.payments.some.OR).toEqual([
      { providerRef: 'pf_ok' },
      { refundRef: 'pf_ok' },
    ]);
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
      feeAtBooking: 250000,
      prescriptions: [{ id: 'rx1', issuedAt: new Date('2099-01-02T14:00:00Z'), items: [] }],
      notificationJobs: [{ id: 'n1', type: 'booking_confirmation', status: 'failed', lastError: 'boom' }],
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
