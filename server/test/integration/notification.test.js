import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { formatInTimeZone } = await import('date-fns-tz');
const { dispatchDueNotifications } = await import('#src/modules/notification/service.js');

const app = createApp();
const uniq = () => `slicee_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

/** Start at i=3 so the slot is always ≥3 days out, guaranteeing both reminders are future. */
async function pickFutureSlot(doctorId) {
  for (let i = 3; i <= 21; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const date = formatInTimeZone(d, 'Asia/Karachi', 'yyyy-MM-dd');
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date });
    if (res.body.data?.length) return res.body.data[0].slotStart;
  }
  throw new Error('no slot ≥3 days out found');
}

describe('notification outbox — atomicity, idempotency, suppression (manual payment)', () => {
  let agent, adminAgent, email, doctorId, slotStart, appointmentId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({
      where: { isActive: true, status: 'active', user: { email: 'dr.bilal@dermestha.dev' } },
    });
    doctorId = d.id;
    slotStart = await pickFutureSlot(doctorId);
    email = uniq();
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
      fullName: 'Notifier',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    adminAgent = request.agent(app);
    await adminAgent
      .post('/api/auth/login')
      .send({ email: 'admin@dermestha.dev', password: 'Password123' })
      .expect(200);
  });

  it('locks a slot (≥3 days out)', async () => {
    const res = await agent
      .post('/api/appointments/lock')
      .send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201);
    appointmentId = res.body.id;
  });

  it('submit reference → admin alert email enqueued; stays pending', async () => {
    await agent.post(`/api/appointments/${appointmentId}/pay`).send({ reference: 'TXN-99' }).expect(200);
    const adminJobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'payment_submitted_admin' },
    });
    expect(adminJobs).toHaveLength(1);
    expect((await prisma.appointment.findUnique({ where: { id: appointmentId } })).state).toBe(
      'pending',
    );
  });

  it('admin accept → confirmed + cadence of 3 patient outbox jobs', async () => {
    await adminAgent.post(`/api/admin/appointments/${appointmentId}/accept`).expect(200);
    expect((await prisma.appointment.findUnique({ where: { id: appointmentId } })).state).toBe(
      'confirmed',
    );
    const patientJobs = await prisma.notificationJob.findMany({
      where: {
        appointmentId,
        type: { in: ['booking_confirmation', 'reminder_24h', 'reminder_1h'] },
      },
      orderBy: { scheduledFor: 'asc' },
    });
    expect(patientJobs.map((j) => j.type)).toEqual([
      'booking_confirmation',
      'reminder_24h',
      'reminder_1h',
    ]);
  });

  it('re-accepting a confirmed appointment is rejected (409)', async () => {
    const res = await adminAgent.post(`/api/admin/appointments/${appointmentId}/accept`);
    expect(res.status).toBe(409);
  });

  it('cancel + dispatch → reminder_24h suppressed, cancellation email exists', async () => {
    const cancel = await agent.post(`/api/appointments/${appointmentId}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.state).toBe('cancelled');

    // Clock: slot−23h, which is after slot−24h (reminder_24h due) but before slot−1h.
    const slotStartDate = new Date(slotStart);
    await dispatchDueNotifications(new Date(slotStartDate.getTime() - 23 * 3600 * 1000));

    const post = await prisma.notificationJob.findMany({ where: { appointmentId } });
    expect(post.find((j) => j.type === 'reminder_24h').status).toBe('suppressed');
    expect(post.some((j) => j.type === 'cancellation')).toBe(true);
  });

  afterAll(async () => {
    await prisma.notificationJob.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
