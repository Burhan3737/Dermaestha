import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const { prisma } = await import('#src/lib/prisma/prisma.js');
const { completeDueAppointments } = await import('#src/modules/appointment/service.js');
const { hashPassword } = await import('#src/lib/password/password.js');

describe('completeDueAppointments — time-based completion (manual-payment)', () => {
  let doctorId, patientId, confirmedId, pendingId, slotEnd, email;

  beforeAll(async () => {
    const docUser = await prisma.user.findUnique({ where: { email: 'dr.ayesha@dermestha.dev' } });
    doctorId = (await prisma.doctor.findUnique({ where: { userId: docUser.id } })).id;
    email = `completion_${Date.now()}@test.local`;
    const patient = await prisma.user.create({
      data: {
        role: 'patient',
        email,
        fullName: 'Completion Patient',
        passwordHash: await hashPassword('password1'),
        tosAcceptedAt: new Date(),
      },
    });
    patientId = patient.id;
    const start = new Date(Date.now() - 60 * 60 * 1000); // an hour ago
    slotEnd = new Date(start.getTime() + 30 * 60 * 1000);
    const mk = (state, offsetMin) =>
      prisma.appointment.create({
        data: {
          doctorId,
          patientUserId: patientId,
          slotStart: new Date(start.getTime() + offsetMin * 60000),
          slotEnd: new Date(slotEnd.getTime() + offsetMin * 60000),
          state,
          feeAtBooking: 250000,
        },
      });
    confirmedId = (await mk('confirmed', 0)).id;
    pendingId = (await mk('pending', 90)).id; // distinct slot to avoid the unique-active-slot index
  });

  it('completes a confirmed appointment past slotEnd + POST_MIN', async () => {
    await completeDueAppointments(new Date(slotEnd.getTime() + 6 * 60000));
    expect((await prisma.appointment.findUnique({ where: { id: confirmedId } })).state).toBe(
      'completed',
    );
  });

  it('does NOT complete a pending appointment past its slot', async () => {
    const pendingEnd = new Date(slotEnd.getTime() + 90 * 60000);
    await completeDueAppointments(new Date(pendingEnd.getTime() + 6 * 60000));
    expect((await prisma.appointment.findUnique({ where: { id: pendingId } })).state).toBe('pending');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetRef: { in: [confirmedId, pendingId] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [confirmedId, pendingId] } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
