import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');
const { formatInTimeZone } = await import('date-fns-tz');

const app = createApp();
const uniq = () => `booking_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

async function pickSlot(doctorId) {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const date = formatInTimeZone(d, 'Asia/Karachi', 'yyyy-MM-dd');
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date });
    if (res.body.data?.length) return res.body.data[0].slotStart;
  }
  throw new Error('no slot found');
}

describe('booking — manual payment flow', () => {
  let agent, email, doctorId, doctorFee, slotStart, appointmentId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({
      where: { isActive: true, status: 'active', user: { email: 'dr.ayesha@dermestha.dev' } },
    });
    doctorId = d.id;
    doctorFee = d.fee;
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

  it('lock creates a pending appointment with feeAtBooking and no payment redirect', async () => {
    const res = await agent
      .post('/api/appointments/lock')
      .send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201);
    appointmentId = res.body.id;
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('pending');
    expect(appt.feeAtBooking).toBe(doctorFee);
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
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SLOT_NOT_BOOKABLE');
    await prisma.user.deleteMany({ where: { email: email2 } });
  });

  it('pay submits a bank reference, stays pending, and enqueues an admin email', async () => {
    const r = await agent
      .post(`/api/appointments/${appointmentId}/pay`)
      .send({ reference: 'TXN-12345' });
    expect(r.status).toBe(200);
    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt.state).toBe('pending');
    expect(appt.paymentReference).toBe('TXN-12345');
    const jobs = await prisma.notificationJob.findMany({
      where: { appointmentId, type: 'payment_submitted_admin' },
    });
    expect(jobs).toHaveLength(1);
  });

  it('GET /:id for a pending appointment exposes paymentInstructions + paymentReference', async () => {
    const res = await agent.get(`/api/appointments/${appointmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.paymentReference).toBe('TXN-12345');
    expect(res.body.paymentInstructions).toMatchObject({ amountDue: doctorFee });
  });

  it('patient cancels the pending appointment → cancelled, no refund logic', async () => {
    const res = await agent
      .post(`/api/appointments/${appointmentId}/cancel`)
      .send({ reason: 'changed mind' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('cancelled');
  });

  afterAll(async () => {
    await prisma.notificationJob.deleteMany({ where: { appointmentId } });
    await prisma.appointment.deleteMany({ where: { id: appointmentId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: appointmentId } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
