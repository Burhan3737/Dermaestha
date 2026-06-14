import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { buildSignedIpn } = await import('#src/integrations/payment/payfast.mock.js');
const { formatInTimeZone } = await import('date-fns-tz');

const app = createApp();
const uniq = () => `slicec_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

async function pickSlot(doctorId) {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const date = formatInTimeZone(d, 'Asia/Karachi', 'yyyy-MM-dd');
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date });
    if (res.body.data?.length) return res.body.data[0].slotStart;
  }
  throw new Error('no slot found');
}

describe('booking + payment integration', () => {
  let agent, email, doctorId, slotStart, appointmentId;

  beforeAll(async () => {
    // First seeded doctor (dr.ayesha): notification.integration pins dr.bilal;
    // explicit pins on both sides keep the parallel files off each other's slots.
    const d = await prisma.doctor.findFirst({
      where: { isActive: true, status: 'active', user: { email: 'dr.ayesha@dermestha.dev' } },
    });
    doctorId = d.id;
    slotStart = await pickSlot(doctorId);
    email = uniq();
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
      fullName: 'Booker',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
  });

  it('locks a slot', async () => {
    const res = await agent
      .post('/api/appointments/lock')
      .send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201);
    appointmentId = res.body.id;
  });

  it('a second lock on the same slot is rejected (slot already occupied)', async () => {
    const email2 = uniq();
    const agent2 = request.agent(app);
    await agent2.post('/api/auth/signup').send({
      fullName: 'B2',
      email: email2,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    const res = await agent2
      .post('/api/appointments/lock')
      .send({ doctorId, slotStart, forSelf: true });
    // generateSlots excludes slot_locked rows from ACTIVE_APPOINTMENT_STATES, so the second
    // patient sees the slot as SLOT_NOT_BOOKABLE (422) rather than SLOT_TAKEN (409).
    // SLOT_TAKEN (409) is only reachable via a concurrent DB-level unique-constraint race.
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SLOT_NOT_BOOKABLE');
    await prisma.user.deleteMany({ where: { email: email2 } });
  });

  it('creates a pay intent then confirms via a signed webhook', async () => {
    const pay = await agent.post(`/api/appointments/${appointmentId}/pay`);
    expect(pay.status).toBe(200);
    expect(pay.body.redirectUrl).toContain('/dev/checkout?ref=');
    const payment = await prisma.payment.findFirst({ where: { appointmentId } });
    const ipn = buildSignedIpn({
      event: 'payment.success',
      providerRef: payment.providerRef,
      intentKey: `x`,
      amount: payment.amount,
      gatewayFee: 5000,
    });
    const wh = await request(app).post('/api/webhooks/payfast').send(ipn);
    expect(wh.status).toBe(200);
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('confirmed');
    expect(appt.feeAtBooking).toBe(payment.amount);
  });

  it('rejects a webhook with a bad signature (401)', async () => {
    const res = await request(app)
      .post('/api/webhooks/payfast')
      .send({ event: 'payment.success', providerRef: 'x', signature: 'bad' });
    expect(res.status).toBe(401);
  });

  it('shows the appointment in the patient upcoming list', async () => {
    const res = await agent.get('/api/appointments');
    expect(res.status).toBe(200);
    expect(res.body.data.some((a) => a.id === appointmentId && a.state === 'confirmed')).toBe(true);
  });

  it('cancels ≥2h before → cancelled_refunded with a refund recorded', async () => {
    const res = await agent.post(`/api/appointments/${appointmentId}/cancel`).send({});
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('cancelled_refunded');
    const payment = await prisma.payment.findFirst({ where: { appointmentId } });
    expect(payment.refundStatus).toBe('settled');
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
