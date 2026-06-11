import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: {
    doctor: { findUnique: vi.fn() },
    appointment: { findUnique: vi.fn() },
    medicine: { findMany: vi.fn() },
    prescription: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../appointment/service.js', () => ({ transition: vi.fn().mockResolvedValue({}) }));
vi.mock('../notification/service.js', () => ({ enqueue: vi.fn().mockResolvedValue({}) }));

import { prisma } from '../../lib/prisma/prisma.js';
import * as appointmentState from '../appointment/service.js';
import * as notification from '../notification/service.js';
import { submit, listByAppointment } from './service.js';

beforeEach(() => vi.clearAllMocks());

const DOCTOR = {
  id: 'd1',
  pmcNumber: 'PMC-1001',
  specialization: 'Acne',
  user: { fullName: 'Dr A' },
};
const APPT = {
  id: 'a1',
  doctorId: 'd1',
  patientUserId: 'u1',
  state: 'completed',
  forSelf: false,
  subjectName: 'Ali',
  subjectAge: 9,
  subjectRelation: 'son',
  patient: { email: 'p@t.test', fullName: 'Parent P' },
};

function arrangeTx() {
  const tx = {
    prescription: {
      create: vi.fn().mockResolvedValue({ id: 'rx1', items: [] }),
    },
  };
  prisma.$transaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

describe('prescription.submit (F08.02)', () => {
  beforeEach(() => {
    prisma.doctor.findUnique.mockResolvedValue(DOCTOR);
    prisma.appointment.findUnique.mockResolvedValue(APPT);
    prisma.medicine.findMany.mockResolvedValue([
      { id: 'm1', name: 'Adapalene Gel', unitPrice: 30000 },
    ]);
  });

  it('snapshots catalogue name+price server-side; free-text gets price null (#5)', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [
        { medicineId: 'm1', dosage: '1x', duration: '7 days', instructions: 'at night' },
        { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning' },
      ],
    });
    const data = tx.prescription.create.mock.calls[0][0].data;
    expect(data.items.create).toEqual([
      {
        medicineName: 'Adapalene Gel',
        dosage: '1x',
        duration: '7 days',
        instructions: 'at night',
        price: 30000,
      },
      {
        medicineName: 'Custom Balm',
        dosage: '2x',
        duration: '5 days',
        instructions: 'morning',
        price: null,
      },
    ]);
    expect(data.doctorSnapshot).toEqual({
      name: 'Dr A',
      pmcNumber: 'PMC-1001',
      specialization: 'Acne',
    });
    expect(data.patientIdSnapshot).toEqual({
      forSelf: false,
      name: 'Ali',
      age: 9,
      relation: 'son',
    });
  });

  it('first issue transitions completed → prescription_issued inside the tx', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(appointmentState.transition).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a1', to: 'prescription_issued', client: tx }),
    );
  });

  it('a correction (state already prescription_issued) does NOT transition but DOES enqueue', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, state: 'prescription_issued' });
    arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(appointmentState.transition).not.toHaveBeenCalled();
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'prescription_ready', dedupeKey: 'rx1' }),
    );
  });

  it('enqueues prescription_ready in the SAME tx with the doc 14 §5 vars', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(notification.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'prescription_ready',
        appointmentId: 'a1',
        recipientEmail: 'p@t.test',
        dedupeKey: 'rx1',
        client: tx,
        vars: expect.objectContaining({
          patientName: 'Parent P',
          doctorName: 'Dr A',
          prescriptionUrl: expect.stringContaining('/appointments/a1/prescriptions'),
        }),
      }),
    );
  });

  it('forSelf appointment snapshots the account-holder name', async () => {
    prisma.appointment.findUnique.mockResolvedValue({
      ...APPT,
      forSelf: true,
      subjectName: null,
      subjectAge: null,
      subjectRelation: null,
    });
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    expect(tx.prescription.create.mock.calls[0][0].data.patientIdSnapshot).toEqual({
      forSelf: true,
      name: 'Parent P',
    });
  });

  it('rejects a non-owner doctor with 404 (no-leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, doctorId: 'd-other' });
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });

  it('rejects wrong state (confirmed) with 409 INVALID_STATE', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ ...APPT, state: 'confirmed' });
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  it('rejects an unknown medicineId with 400 (race / hand-crafted request)', async () => {
    prisma.medicine.findMany.mockResolvedValue([]);
    await expect(
      submit({
        appointmentId: 'a1',
        doctorUserId: 'u-doc',
        items: [{ medicineId: 'm-gone', dosage: '1x', duration: '7d', instructions: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
  });

  it('maps notes and followUpDate onto the created row (date-only → Date, absent → null)', async () => {
    const tx = arrangeTx();
    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
      notes: 'Avoid sun.',
      followUpDate: '2099-01-18',
    });
    const data = tx.prescription.create.mock.calls[0][0].data;
    expect(data.notes).toBe('Avoid sun.');
    expect(data.followUpDate).toEqual(new Date('2099-01-18'));

    await submit({
      appointmentId: 'a1',
      doctorUserId: 'u-doc',
      items: [{ medicineId: 'm1', dosage: '1x', duration: '7d', instructions: 'x' }],
    });
    const data2 = tx.prescription.create.mock.calls[1][0].data;
    expect(data2.notes).toBeNull();
    expect(data2.followUpDate).toBeNull();
  });
});

describe('prescription.listByAppointment (F08.01)', () => {
  const RX = [{ id: 'rx1', issuedAt: new Date('2099-01-01T10:00:00Z'), items: [] }];

  it('patient-owner reads chronologically (issuedAt asc) with items', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1', doctorId: 'd1' });
    prisma.prescription.findMany.mockResolvedValue(RX);
    const out = await listByAppointment({ appointmentId: 'a1', role: 'patient', userId: 'u1' });
    expect(out).toEqual(RX);
    expect(prisma.prescription.findMany).toHaveBeenCalledWith({
      where: { appointmentId: 'a1' },
      orderBy: { issuedAt: 'asc' },
      include: { items: true },
    });
  });

  it('doctor-owner and admin read; a stranger gets 404 (no-leak)', async () => {
    prisma.appointment.findUnique.mockResolvedValue({ id: 'a1', patientUserId: 'u1', doctorId: 'd1' });
    prisma.prescription.findMany.mockResolvedValue(RX);
    prisma.doctor.findUnique.mockResolvedValue({ id: 'd1' });
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'doctor', userId: 'u-doc' }),
    ).resolves.toEqual(RX);
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'admin', userId: 'u-adm' }),
    ).resolves.toEqual(RX);
    await expect(
      listByAppointment({ appointmentId: 'a1', role: 'patient', userId: 'u-other' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
