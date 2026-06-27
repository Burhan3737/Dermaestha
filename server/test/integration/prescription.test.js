import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const appointmentService = await import('#src/modules/appointment/service.js');

const app = createApp();
const uniq = () => `slicef_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('prescription flow — immutable submit, corrections, snapshot durability', () => {
  let doctorAgent, patientAgent, otherDoctorAgent;
  let patientEmail, patientUserId, doctorId, appointmentId, medicineId, firstRxId;

  beforeAll(async () => {
    // Seeded doctors (prisma/seed.js): Password123, active.
    const docUser = await prisma.user.findUnique({ where: { email: 'dr.ayesha@dermestha.dev' } });
    const doc = await prisma.doctor.findUnique({ where: { userId: docUser.id } });
    doctorId = doc.id;

    doctorAgent = request.agent(app);
    await doctorAgent
      .post('/api/auth/login')
      .send({ email: 'dr.ayesha@dermestha.dev', password: 'Password123' })
      .expect(200);

    otherDoctorAgent = request.agent(app);
    await otherDoctorAgent
      .post('/api/auth/login')
      .send({ email: 'dr.bilal@dermestha.dev', password: 'Password123' })
      .expect(200);

    patientEmail = uniq();
    patientAgent = request.agent(app);
    const signup = await patientAgent.post('/api/auth/signup').send({
      fullName: 'Rx Parent',
      email: patientEmail,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    expect(signup.status).toBeLessThan(300); // 200/201 — don't pin the exact code here
    patientUserId = (await prisma.user.findUnique({ where: { email: patientEmail } })).id;

    // Dedicated test medicine (repriced later; never mutate seeded rows).
    medicineId = (
      await prisma.medicine.create({
        data: { name: `SliceF Test Med ${Date.now()}`, dosageForms: ['cream'], unitPrice: 50000 },
      })
    ).id;

    // A completed past consultation for a third party (P8 who-for).
    appointmentId = (
      await prisma.appointment.create({
        data: {
          doctorId,
          patientUserId,
          slotStart: new Date(Date.now() - 2 * 3600 * 1000),
          slotEnd: new Date(Date.now() - 90 * 60 * 1000),
          state: 'completed',
          feeAtBooking: 250000,
          forSelf: false,
          subjectName: 'Ali',
          subjectAge: 9,
          subjectRelation: 'son',
        },
      })
    ).id;
  });

  it('doctor submits: prescription + snapshots + state + outbox job, all committed', async () => {
    const res = await doctorAgent.post(`/api/appointments/${appointmentId}/prescriptions`).send({
      items: [
        { medicineId, dosage: '1x daily', duration: '7 days', instructions: 'after meals' },
        { medicineName: 'Custom Balm', dosage: '2x', duration: '5 days', instructions: 'morning' },
      ],
      notes: 'Avoid sun exposure.',
      followUpDate: '2099-01-18',
    });
    expect(res.status).toBe(201);
    firstRxId = res.body.id;
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.find((i) => i.medicineName === 'Custom Balm').price).toBeNull();
    expect(res.body.items.find((i) => i.medicineName !== 'Custom Balm').price).toBe(50000);
    expect(res.body.patientIdSnapshot).toEqual({
      forSelf: false,
      name: 'Ali',
      age: 9,
      relation: 'son',
    });
    // @db.Date round-trip: the calendar date must survive intact.
    expect(String(res.body.followUpDate)).toContain('2099-01-18');

    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('completed'); // prescriptions no longer change appointment state

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'prescription_ready' },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].dedupeKey).toBe(firstRxId);
    expect(jobs[0].vars.prescriptionUrl).toContain(`/appointments/${appointmentId}/prescriptions`);
  });

  it('a correction creates a SECOND prescription + second email job; state unchanged', async () => {
    const res = await doctorAgent.post(`/api/appointments/${appointmentId}/prescriptions`).send({
      items: [{ medicineId, dosage: '2x daily', duration: '10 days', instructions: 'corrected' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(firstRxId);

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'prescription_ready' },
    });
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((j) => j.dedupeKey)).size).toBe(2); // real-DB dedupe semantics: distinct keys → distinct rows
    expect((await prisma.appointment.findUnique({ where: { id: appointmentId } })).state).toBe(
      'completed',
    );
  });

  it('catalogue reprice/rename/deactivate never alters the stored snapshot (#5)', async () => {
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { name: 'RENAMED', unitPrice: 99900, isActive: false },
    });
    const list = await patientAgent.get(`/api/appointments/${appointmentId}/prescriptions`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    const item = list.body.data[0].items.find((i) => i.price !== null);
    expect(item.medicineName).not.toBe('RENAMED');
    expect(item.price).toBe(50000);
  });

  it('deactivated medicine is gone from the builder dropdown', async () => {
    const res = await doctorAgent.get('/api/medicines').query({ search: 'SliceF Test Med' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('a non-owner doctor gets 404 (no-leak); patient cannot POST (403)', async () => {
    const foreign = await otherDoctorAgent
      .post(`/api/appointments/${appointmentId}/prescriptions`)
      .send({ items: [{ medicineName: 'X', dosage: '1', duration: '1', instructions: 'x' }] });
    expect(foreign.status).toBe(404);

    const patientPost = await patientAgent
      .post(`/api/appointments/${appointmentId}/prescriptions`)
      .send({ items: [{ medicineName: 'X', dosage: '1', duration: '1', instructions: 'x' }] });
    expect(patientPost.status).toBe(403);
  });

  it('patient history list shows the appointment with hasPrescription=true', async () => {
    const res = await patientAgent.get('/api/appointments').query({ scope: 'history' });
    expect(res.status).toBe(200);
    const row = res.body.data.find((a) => a.id === appointmentId);
    expect(row.state).toBe('completed');
    expect(row.hasPrescription).toBe(true);
  });

  afterAll(async () => {
    // A partially-failed beforeAll leaves these undefined; an undefined key in a Prisma
    // where is silently dropped → unfiltered deleteMany. Sentinel-bind so deletes stay scoped.
    const apptId = appointmentId ?? '__cleanup_none__';
    const medId = medicineId ?? '__cleanup_none__';
    await prisma.notificationJob.deleteMany({ where: { appointmentId: apptId } });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { appointmentId: apptId } },
    });
    await prisma.prescription.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointment.deleteMany({ where: { id: apptId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: apptId } });
    await prisma.medicine.deleteMany({ where: { id: medId } });
    await prisma.user.deleteMany({ where: { email: patientEmail } });
    await prisma.$disconnect();
  });
});

describe('prescription flow — concurrency race guard + forSelf snapshot', () => {
  let doctorAgent;
  let patientEmail, patientUserId, doctorId, forSelfApptId, raceApptId;

  beforeAll(async () => {
    const docUser = await prisma.user.findUnique({ where: { email: 'dr.ayesha@dermestha.dev' } });
    const doc = await prisma.doctor.findUnique({ where: { userId: docUser.id } });
    doctorId = doc.id;

    doctorAgent = request.agent(app);
    await doctorAgent
      .post('/api/auth/login')
      .send({ email: 'dr.ayesha@dermestha.dev', password: 'Password123' })
      .expect(200);

    patientEmail = uniq();
    const patientAgent = request.agent(app);
    const signup = await patientAgent.post('/api/auth/signup').send({
      fullName: 'Rx Parent',
      email: patientEmail,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    expect(signup.status).toBeLessThan(300);
    patientUserId = (await prisma.user.findUnique({ where: { email: patientEmail } })).id;

    // Appointment for forSelf snapshot test — will receive a normal HTTP submit.
    forSelfApptId = (
      await prisma.appointment.create({
        data: {
          doctorId,
          patientUserId,
          slotStart: new Date(Date.now() - 5 * 3600 * 1000),
          slotEnd: new Date(Date.now() - 4.5 * 3600 * 1000),
          state: 'completed',
          feeAtBooking: 250000,
          forSelf: true,
        },
      })
    ).id;

    // Dedicated appointment for the Postgres-level race test — confirmed → completed.
    raceApptId = (
      await prisma.appointment.create({
        data: {
          doctorId,
          patientUserId,
          slotStart: new Date(Date.now() - 8 * 3600 * 1000),
          slotEnd: new Date(Date.now() - 7.5 * 3600 * 1000),
          state: 'confirmed',
          feeAtBooking: 250000,
          forSelf: true,
        },
      })
    ).id;
  });

  it('the state-guarded transition write loses cleanly when racing (real Postgres row lock)', async () => {
    // T1: open a transaction, move confirmed → completed, then HOLD the row lock.
    let signalT1Wrote, signalRelease;
    const t1Wrote = new Promise((r) => (signalT1Wrote = r));
    const release = new Promise((r) => (signalRelease = r));
    const t1 = prisma.$transaction(async (tx) => {
      await tx.appointment.updateMany({
        where: { id: raceApptId, state: 'confirmed' },
        data: { state: 'completed' },
      });
      signalT1Wrote();
      await release; // keep the tx open so T2 blocks on the row lock
    });

    await t1Wrote;
    // T2: a real transition() racing the held lock. Under READ COMMITTED its initial read
    // still sees 'confirmed' (MVCC), passes LEGAL, then its guarded updateMany blocks on
    // T1's row lock. When T1 commits, the WHERE re-evaluates → 0 rows → clean 409.
    const t2 = appointmentService
      .transition({ appointmentId: raceApptId, to: 'completed', actorType: 'system' })
      .then(
        () => 'won',
        (e) => e.code,
      );
    await new Promise((r) => setTimeout(r, 300)); // let T2 read + block
    signalRelease();
    await t1;
    await expect(t2).resolves.toBe('INVALID_TRANSITION');

    // The loser left nothing behind: no duplicate audit, state stable.
    const audits = await prisma.auditLog.count({
      where: { eventType: 'appointment.completed', targetRef: raceApptId },
    });
    expect(audits).toBe(0); // T1 wrote raw (no audit); the losing T2 must not have audited
    expect((await prisma.appointment.findUnique({ where: { id: raceApptId } })).state).toBe(
      'completed',
    );
  });

  it('forSelf snapshot is captured correctly', async () => {
    const res = await doctorAgent.post(`/api/appointments/${forSelfApptId}/prescriptions`).send({
      items: [{ medicineName: 'ForSelfItem', dosage: '1x', duration: '3d', instructions: 'test' }],
    });
    expect(res.status).toBe(201);

    const rx = await prisma.prescription.findFirst({
      where: { appointmentId: forSelfApptId },
    });
    expect(rx).not.toBeNull();
    expect(rx.patientIdSnapshot).toMatchObject({ forSelf: true, name: 'Rx Parent' });
  });

  afterAll(async () => {
    // A partially-failed beforeAll leaves these undefined; an undefined key in a Prisma
    // where is silently dropped → unfiltered deleteMany. Sentinel-bind so deletes stay scoped.
    const fsId = forSelfApptId ?? '__cleanup_none__';
    const rcId = raceApptId ?? '__cleanup_none__';
    await prisma.notificationJob.deleteMany({ where: { appointmentId: fsId } });
    await prisma.prescriptionItem.deleteMany({
      where: { prescription: { appointmentId: fsId } },
    });
    await prisma.prescription.deleteMany({ where: { appointmentId: fsId } });
    await prisma.appointment.deleteMany({ where: { id: fsId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: fsId } });
    // raceApptId: no prescriptions/jobs; just appointment + audit rows.
    await prisma.appointment.deleteMany({ where: { id: rcId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: rcId } });
    await prisma.user.deleteMany({ where: { email: patientEmail } });
    await prisma.$disconnect();
  });
});
