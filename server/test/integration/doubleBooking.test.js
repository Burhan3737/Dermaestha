import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '#src/lib/prisma/prisma.js';

describe('no-double-booking partial index (PRD #1)', () => {
  let doctorId;
  const slotStart = new Date('2099-01-01T10:00:00Z');
  const slotEnd = new Date('2099-01-01T10:30:00Z');

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        role: 'doctor',
        email: `idx-${Date.now()}@t.test`,
        passwordHash: 'x',
        fullName: 'Dr Idx',
      },
    });
    const doc = await prisma.doctor.create({
      data: {
        userId: user.id,
        pmcNumber: `PMC-${Date.now()}`,
        specialization: 'Derm',
        fee: 100000,
      },
    });
    doctorId = doc.id;
  });

  it('rejects a second active-state appointment on the same (doctor, slot)', async () => {
    const patient = await prisma.user.create({
      data: {
        role: 'patient',
        email: `p-${Date.now()}@t.test`,
        passwordHash: 'x',
        fullName: 'Pat',
      },
    });
    await prisma.appointment.create({
      data: { doctorId, patientUserId: patient.id, slotStart, slotEnd, state: 'confirmed' },
    });
    await expect(
      prisma.appointment.create({
        data: { doctorId, patientUserId: patient.id, slotStart, slotEnd, state: 'pending' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
