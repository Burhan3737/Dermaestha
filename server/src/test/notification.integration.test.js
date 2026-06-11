import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma/prisma.js');
const { buildSignedIpn } = await import('../integrations/payment/payfast.mock.js');
const { formatInTimeZone } = await import('date-fns-tz');
const { dispatchDueNotifications } = await import('../modules/notification/service.js');

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

describe('notification outbox — atomicity, idempotency, suppression', () => {
  let agent, email, doctorId, slotStart, appointmentId, payment;

  beforeAll(async () => {
    // Second seeded doctor (dr.bilal): booking.integration uses findFirst (dr.ayesha);
    // distinct doctors keep the two parallel files from racing for the same slot.
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
  });

  it('locks a slot (≥3 days out)', async () => {
    const res = await agent
      .post('/api/appointments/lock')
      .send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201);
    appointmentId = res.body.id;
  });

  it('pay + signed IPN → appointment confirmed + cadence of 3 outbox jobs', async () => {
    const pay = await agent.post(`/api/appointments/${appointmentId}/pay`);
    expect(pay.status).toBe(200);

    payment = await prisma.payment.findFirst({ where: { appointmentId } });

    const ipn = buildSignedIpn({
      event: 'payment.success',
      providerRef: payment.providerRef,
      intentKey: 'x',
      amount: payment.amount,
      gatewayFee: 5000,
    });
    const wh = await request(app).post('/api/webhooks/payfast').send(ipn);
    expect(wh.status).toBe(200);

    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('confirmed');

    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId },
      orderBy: { scheduledFor: 'asc' },
    });
    expect(jobs.map((j) => j.type)).toEqual([
      'booking_confirmation',
      'reminder_24h',
      'reminder_1h',
    ]);
    expect(jobs[0].status).toBe('pending');
  });

  it('replay of identical IPN is idempotent — job count stays at 3', async () => {
    const ipn = buildSignedIpn({
      event: 'payment.success',
      providerRef: payment.providerRef,
      intentKey: 'x',
      amount: payment.amount,
      gatewayFee: 5000,
    });
    const wh = await request(app).post('/api/webhooks/payfast').send(ipn);
    expect(wh.status).toBe(200);

    const after = await prisma.notificationJob.findMany({ where: { appointmentId } });
    expect(after).toHaveLength(3);
  });

  it('cancel + dispatch → reminder_24h suppressed, refund_confirmation exists', async () => {
    const cancel = await agent.post(`/api/appointments/${appointmentId}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.state).toBe('cancelled_refunded');

    // Clock: slot−23h, which is after slot−24h (reminder_24h due) but before slot−1h.
    const slotStartDate = new Date(slotStart);
    await dispatchDueNotifications(new Date(slotStartDate.getTime() - 23 * 3600 * 1000));

    const post = await prisma.notificationJob.findMany({ where: { appointmentId } });
    expect(post.find((j) => j.type === 'reminder_24h').status).toBe('suppressed');
    expect(post.some((j) => j.type === 'refund_confirmation')).toBe(true);
  });

  afterAll(async () => {
    await prisma.notificationJob.deleteMany({ where: { appointmentId } });
    await prisma.payment.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
