import { describe, it, expect, beforeAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { hashPassword } = await import('#src/lib/password/password.js');

const app = createApp();
const uniq = (t) => `superadmin_${t}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const MIN = 60 * 1000;

describe('superadmin — functional admin clone (explicit dual-listing)', () => {
  let saAgent, saEmail, saUserId;
  let apptId;

  beforeAll(async () => {
    // Superadmin account (bootstrap-admin pattern; never mutate seeded rows).
    saEmail = `${uniq('sa')}@test.local`;
    const sa = await prisma.user.create({
      data: {
        role: 'superadmin',
        email: saEmail,
        fullName: 'Test Superadmin',
        passwordHash: await hashPassword('SaPass123'),
      },
    });
    saUserId = sa.id;

    // A patient + a doctor + a confirmed appointment + a prescription, created directly via Prisma
    // so the superadmin's read visibility (in-body checks) can be exercised.
    const patient = await prisma.user.create({
      data: {
        role: 'patient',
        email: `${uniq('pat')}@test.local`,
        fullName: 'SA Test Patient',
        phone: '03001112223',
        passwordHash: await hashPassword('PatPass123'),
        tosAcceptedAt: new Date(),
      },
    });
    const doctorUser = await prisma.user.create({
      data: {
        role: 'doctor',
        email: `${uniq('doc')}@test.local`,
        fullName: 'Dr SA Test',
        phone: '03001110001',
        passwordHash: await hashPassword('DocPass123'),
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        pmcNumber: uniq('PMC'),
        specialization: 'Acne',
        fee: 250000,
        isActive: true,
        status: 'active',
      },
    });
    const now = Date.now();
    const appt = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientUserId: patient.id,
        slotStart: new Date(now - 180 * MIN),
        slotEnd: new Date(now - 150 * MIN),
        state: 'confirmed',
        feeAtBooking: 250000,
        forSelf: true,
      },
    });
    apptId = appt.id;
    await prisma.prescription.create({
      data: {
        appointmentId: appt.id,
        doctorSnapshot: {
          name: doctorUser.fullName,
          pmcNumber: doctor.pmcNumber,
          specialization: doctor.specialization,
        },
        patientIdSnapshot: { forSelf: true, name: patient.fullName },
        notes: 'Superadmin visibility fixture.',
        items: {
          create: [
            { medicineName: 'Test Cream', dosage: 'thin layer', duration: '2 weeks', price: 30000 },
          ],
        },
      },
    });

    saAgent = request.agent(app);
    await saAgent.post('/api/auth/login').send({ email: saEmail, password: 'SaPass123' }).expect(200);
  });

  // Task 4 — requireRole dual-listing.
  it('reaches an /api/admin/* route (alerts feed) — 200, not 403', async () => {
    const res = await saAgent.get('/api/admin/alerts');
    expect(res.status).toBe(200);
  });

  // Task 5 — in-body visibility checks.
  it('GET /appointments/:id returns the appointment (no 404) for superadmin', async () => {
    const res = await saAgent.get(`/api/appointments/${apptId}`);
    expect(res.status).toBe(200);
  });
  it('GET /appointments/:id/prescriptions returns the list (no 404) for superadmin', async () => {
    const res = await saAgent.get(`/api/appointments/${apptId}/prescriptions`);
    expect(res.status).toBe(200);
  });
  it('includeInactive doctors listing is allowed (no 403) for superadmin', async () => {
    const res = await saAgent.get('/api/doctors?includeInactive=true');
    expect(res.status).toBe(200);
  });
  it('includeInactive medicines listing is allowed (no 403) for superadmin', async () => {
    const res = await saAgent.get('/api/medicines?includeInactive=true');
    expect(res.status).toBe(200);
  });

  // Task 6 — audit actorType coercion.
  it('superadmin login succeeded and wrote an audit row with actor_type=admin', async () => {
    const row = await prisma.auditLog.findFirst({
      where: { eventType: 'login', actorId: saUserId },
      orderBy: { at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row.actorType).toBe('admin');
  });
});
