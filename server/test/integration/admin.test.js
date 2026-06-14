import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { hashPassword } = await import('#src/lib/password/password.js');

const app = createApp();
const uniq = (tag) => `sliceg_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe('admin journey — onboard → DA3 → immutability → deactivate (#9) → settings → records/alerts/resend', () => {
  let adminAgent;
  let adminEmail, adminUserId, doctorEmail, doctorId, doctorUserId;
  let patientEmail, patientId, apptId;
  let jobId;
  let nosyEmail;
  let originalSettings;

  beforeAll(async () => {
    // Dedicated admin (bootstrap-admin pattern; never mutate seeded rows).
    adminEmail = `${uniq('admin')}@test.local`;
    const adminUser = await prisma.user.create({
      data: {
        role: 'admin',
        email: adminEmail,
        fullName: 'Test Admin',
        passwordHash: await hashPassword('AdminPass123'),
      },
    });
    adminUserId = adminUser.id;
    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: adminEmail, password: 'AdminPass123' })
      .expect(200);
    const settingsRes = await adminAgent.get('/api/admin/settings');
    originalSettings = settingsRes.body;
  });

  it('onboards a doctor: pending+inactive, hidden from public listing, audit row written', async () => {
    doctorEmail = `${uniq('doc')}@test.local`;
    const res = await adminAgent.post('/api/doctors').send({
      fullName: 'Dr Slice G',
      email: doctorEmail,
      phone: '03009998877',
      pmcNumber: uniq('PMC'),
      specialization: 'Acne',
      fee: 250000,
      bio: 'Integration-test doctor.',
      initialPassword: 'InitPass123',
      blocks: [{ weekday: 1, startTime: '18:00', endTime: '21:00' }],
    });
    expect(res.status).toBe(201);
    doctorId = res.body.id;
    doctorUserId = res.body.userId;
    expect(res.body.status).toBe('pending');
    expect(res.body.isActive).toBe(false);

    const pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeUndefined();

    const auditRow = await prisma.auditLog.findFirst({
      where: { eventType: 'doctor.created', targetRef: doctorId },
    });
    expect(auditRow).not.toBeNull();
  });

  it('closes the DA1→DA3 loop: the new doctor must change the password before the panel', async () => {
    const docAgent = request.agent(app);
    const login = await docAgent
      .post('/api/auth/login')
      .send({ email: doctorEmail, password: 'InitPass123' })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);

    // The DA3 gate blocks protected routes until the change…
    // mustChangePasswordGate is mounted at app.use('/api', ...) so req.path is relative to /api.
    // It returns 403 MUST_CHANGE_PASSWORD for any non-allowlisted path.
    const blocked = await docAgent.get('/api/appointments');
    expect(blocked.status).toBe(403);

    // /auth/change-password is in the gate allowlist — proceeds despite mustChangePassword flag.
    await docAgent
      .post('/api/auth/change-password')
      .send({ currentPassword: 'InitPass123', newPassword: 'OwnPass123' })
      .expect(200);
    await docAgent.get('/api/appointments').expect(200);
  });

  it('admin list includes the pending doctor; PATCH of pmcNumber → 409 IMMUTABLE_FIELD (#8)', async () => {
    const list = await adminAgent.get('/api/doctors?includeInactive=true').expect(200);
    expect(list.body.data.find((d) => d.id === doctorId)).toBeTruthy();

    const patch = await adminAgent
      .patch(`/api/doctors/${doctorId}`)
      .send({ pmcNumber: 'PMC-HACK' });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe('IMMUTABLE_FIELD');

    await adminAgent.patch(`/api/doctors/${doctorId}`).send({ fee: 300000 }).expect(200);
  });

  it('reactivate publishes; deactivate hides but PRESERVES a confirmed appointment (#9)', async () => {
    await adminAgent.post(`/api/doctors/${doctorId}/reactivate`).expect(200);
    let pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeTruthy();

    // A real confirmed future appointment under this doctor.
    patientEmail = `${uniq('pat')}@test.local`;
    const patient = await prisma.user.create({
      data: {
        role: 'patient',
        email: patientEmail,
        fullName: 'G Patient',
        phone: '03001112222',
        passwordHash: await hashPassword('PatPass123'),
        tosAcceptedAt: new Date(),
      },
    });
    patientId = patient.id;
    const appt = await prisma.appointment.create({
      data: {
        doctorId,
        patientUserId: patient.id,
        slotStart: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        slotEnd: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 30 * 60 * 1000),
        state: 'confirmed',
        feeAtBooking: 250000,
      },
    });
    apptId = appt.id;

    const deact = await adminAgent.post(`/api/doctors/${doctorId}/deactivate`).expect(200);
    expect(deact.body.isActive).toBe(false);

    pub = await request(app).get('/api/doctors?page=1&pageSize=50');
    expect(pub.body.data.find((d) => d.id === doctorId)).toBeUndefined();
    const kept = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(kept.state).toBe('confirmed'); // no cancellation cascade

    // The count surfaces in the admin list for the warning modal.
    const list = await adminAgent.get('/api/doctors?includeInactive=true');
    expect(list.body.data.find((d) => d.id === doctorId).upcomingConfirmedCount).toBe(1);
  });

  it('DA5 reset re-arms mustChangePassword', async () => {
    await adminAgent
      .post(`/api/doctors/${doctorId}/reset-password`)
      .send({ newPassword: 'ResetPass123' })
      .expect(200);
    const user = await prisma.user.findUnique({ where: { id: doctorUserId } });
    expect(user.mustChangePassword).toBe(true);
  });

  it('settings PUT takes effect and floor-validates (F14)', async () => {
    const tooLow = await adminAgent.put('/api/admin/settings').send({
      minBookingLeadMinutes: 15,
      fallbackFeePctBps: 0,
      fallbackFeeFixed: 0,
    });
    expect(tooLow.status).toBe(400); // floor 30 enforced by Zod schema (min(30))

    await adminAgent
      .put('/api/admin/settings')
      .send({ minBookingLeadMinutes: 45, fallbackFeePctBps: 250, fallbackFeeFixed: 0 })
      .expect(200);
    const after = await adminAgent.get('/api/admin/settings').expect(200);
    expect(after.body.minBookingLeadMinutes).toBe(45);
    // restore is deferred to afterAll so it survives test failures
  });

  it('records + audit + alerts + email resend round-trip (F13/F12)', async () => {
    const records = await adminAgent.get('/api/admin/records?doctorName=Slice%20G');
    expect(records.status).toBe(200);
    expect(records.body.data.length).toBeGreaterThanOrEqual(1);
    // apptId is captured from the 'reactivate' test; confirm it surfaces in records.
    expect(records.body.data.some((r) => r.id === apptId)).toBe(true);

    // dispute toggle is audit-logged and surfaces in the detail
    await adminAgent
      .post(`/api/appointments/${apptId}/dispute`)
      .send({ disputed: true })
      .expect(200);
    const detail = await adminAgent.get(`/api/admin/records/${apptId}`).expect(200);
    expect(detail.body.appointment.disputed).toBe(true);
    expect(detail.body.history.some((h) => h.eventType === 'appointment.disputed')).toBe(true);

    const auditRes = await adminAgent
      .get(`/api/admin/audit?appointmentId=${apptId}&eventType=appointment.disputed`)
      .expect(200);
    expect(auditRes.body.data).toHaveLength(1);

    // a forced-failed email job → appears via alerts enrichment → resend resets it
    // dedupeKey must be unique per [appointmentId, type, dedupeKey] index.
    const job = await prisma.notificationJob.create({
      data: {
        type: 'booking_confirmation',
        appointmentId: apptId,
        recipientEmail: 'p@t.test',
        scheduledFor: new Date(),
        status: 'failed',
        attempts: 5,
        lastError: 'forced for test',
        dedupeKey: uniq('dk'),
      },
    });
    jobId = job.id;
    await prisma.auditLog.create({
      data: {
        eventType: 'email.send_failed_final',
        actorType: 'system',
        targetRef: apptId,
        reason: 'booking_confirmation: forced for test',
      },
    });
    const alerts = await adminAgent.get('/api/admin/alerts').expect(200);
    const emailAlert = alerts.body.data.find(
      (a) => a.kind === 'email.send_failed_final' && a.targetRef === apptId,
    );
    expect(emailAlert.failedJobs.map((j) => j.id)).toContain(job.id);

    await adminAgent.post(`/api/admin/emails/${job.id}/resend`).expect(200);
    const reset = await prisma.notificationJob.findUnique({ where: { id: job.id } });
    expect(reset.status).toBe('pending');
    expect(reset.attempts).toBe(0);

    // second resend: job is now pending (not failed) → 409 INVALID_STATE
    const second = await adminAgent.post(`/api/admin/emails/${job.id}/resend`);
    expect(second.status).toBe(409); // no longer failed
  });

  it('every admin route 403s for a non-admin (DA6)', async () => {
    nosyEmail = `${uniq('nosy')}@test.local`;
    const stranger = request.agent(app);
    await stranger.post('/api/auth/signup').send({
      fullName: 'Nosy P',
      email: nosyEmail,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    await stranger.get('/api/admin/records').expect(403);
    await stranger.get('/api/admin/alerts').expect(403);
    await stranger.get('/api/admin/settings').expect(403);
    await stranger.post('/api/doctors').send({}).expect(403);
    await stranger.get('/api/doctors?includeInactive=true').expect(403);
  });

  afterAll(async () => {
    // Restore settings first so it survives any test failure above.
    if (originalSettings) await adminAgent.put('/api/admin/settings').send(originalSettings);
    // Delete in FK-safe order, scoped to rows created by this suite.
    if (jobId) await prisma.notificationJob.deleteMany({ where: { id: jobId } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { targetRef: { in: [doctorId, apptId].filter(Boolean) } },
          { actorId: { in: [adminUserId, doctorUserId, patientId].filter(Boolean) } },
        ],
      },
    });
    if (apptId) await prisma.appointment.deleteMany({ where: { id: apptId } });
    if (doctorId) await prisma.availabilityBlock.deleteMany({ where: { doctorId } });
    if (doctorId) await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, doctorEmail, patientEmail, nosyEmail].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });
});
