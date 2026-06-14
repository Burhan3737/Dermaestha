import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma/prisma.js');
const { buildSignedIpn } = await import('../integrations/payment/payfast.mock.js');
const { paymentProvider } = await import('../integrations/payment/index.js');
const { reconcileUnconfirmed } = await import('../modules/payment/service.js');
const { formatInTimeZone } = await import('date-fns-tz');

const app = createApp();
const uniq = (p) => `${p}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

async function pickSlot(doctorId) {
  for (let i = 1; i <= 14; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const date = formatInTimeZone(d, 'Asia/Karachi', 'yyyy-MM-dd');
    const res = await request(app).get(`/api/doctors/${doctorId}/slots`).query({ date });
    if (res.body.data?.length) return res.body.data[0].slotStart;
  }
  throw new Error('no slot found');
}

async function signup(email) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/signup')
    .send({ fullName: 'Failer', email, phone: '03001234567', password: 'password1', tosAccepted: true });
  return agent;
}

// BUG-1 (Slice H S7): the payment.failed path must NOT FK-crash and must release the slot.
// Pre-fix it deleted the slot_locked appointment while a pending Payment FK-referenced it
// (Payment.appointment is ON DELETE RESTRICT) → P2003 → 500, lock never released.
// Option B: mark the Payment `failed` + force-expire the lock (no delete, no migration).
describe('BUG-1 payment.failed releases the slot without FK-crashing (Option B)', () => {
  let doctorId;
  let docUserId;

  beforeAll(async () => {
    // Own, isolated doctor + wide availability — no slot contention with the parallel files
    // that pin dr.ayesha (booking) / dr.bilal (notification).
    const u = await prisma.user.create({
      data: { role: 'doctor', email: uniq('bug1doc'), passwordHash: 'x', fullName: 'Dr Bug1' },
    });
    docUserId = u.id;
    const d = await prisma.doctor.create({
      data: {
        userId: u.id,
        pmcNumber: `PMC-B1-${Date.now()}`,
        specialization: 'Derm',
        fee: 250000,
        isActive: true,
        status: 'active',
      },
    });
    doctorId = d.id;
    await prisma.availabilityBlock.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        doctorId,
        weekday,
        startTime: '09:00',
        endTime: '17:00',
      })),
    });
  });

  afterAll(async () => {
    await prisma.availabilityBlock.deleteMany({ where: { doctorId } });
    await prisma.doctor.deleteMany({ where: { id: doctorId } });
    await prisma.user.deleteMany({ where: { id: docUserId } });
    await prisma.$disconnect();
  });

  it('webhook path: failed IPN → 200, Payment failed, lock expired, appointment kept, slot re-lockable', async () => {
    const email = uniq('webhookfail');
    const agent = await signup(email);
    const slotStart = await pickSlot(doctorId);

    const lock = await agent.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(lock.status).toBe(201);
    const apptId = lock.body.id;

    // Pay-intent → a real, pending Payment row that FK-references the slot_locked appointment.
    const pay = await agent.post(`/api/appointments/${apptId}/pay`);
    expect(pay.status).toBe(200);
    const payment = await prisma.payment.findFirst({ where: { appointmentId: apptId } });
    expect(payment.status).toBe('pending');

    // Deliver a signed payment.failed IPN through the real webhook route.
    const ipn = buildSignedIpn({
      event: 'payment.failed',
      providerRef: payment.providerRef,
      intentKey: 'x',
      amount: payment.amount,
    });
    const wh = await request(app).post('/api/webhooks/payfast').send(ipn);
    expect(wh.status).toBe(200); // NOT 500 (was P2003 pre-fix)

    // Payment marked failed; appointment NOT deleted; lock force-expired (reclaimable).
    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('failed');
    const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(appt).not.toBeNull();
    expect(appt.state).toBe('slot_locked');
    expect(appt.lockExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());

    // The slot is genuinely free again: a fresh booker re-locks the SAME (doctor, slot),
    // which exercises reclaim-on-conflict over the payment-attached expired blocker.
    const email2 = uniq('relock');
    const agent2 = await signup(email2);
    const relock = await agent2.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(relock.status).toBe(201);
    expect(relock.body.id).not.toBe(apptId);
    // The old blocker (and its dead Payment) were reclaimed away.
    expect(await prisma.appointment.findUnique({ where: { id: apptId } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toBeNull();

    // cleanup
    await prisma.payment.deleteMany({ where: { appointmentId: relock.body.id } });
    await prisma.appointment.deleteMany({ where: { id: relock.body.id } });
    await prisma.auditLog.deleteMany({ where: { targetRef: { in: [apptId, relock.body.id] } } });
    await prisma.user.deleteMany({ where: { email: { in: [email, email2] } } });
  });

  it('reconcileOne path: gateway-failed query → Payment failed + lock freed, no delete/crash', async () => {
    const email = uniq('reconfail');
    const agent = await signup(email);
    const slotStart = await pickSlot(doctorId);

    const lock = await agent.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(lock.status).toBe(201);
    const apptId = lock.body.id;
    await agent.post(`/api/appointments/${apptId}/pay`);
    const payment = await prisma.payment.findFirst({ where: { appointmentId: apptId } });

    // Age the pending payment into the reconciliation window (createdAt 2h ago).
    await prisma.payment.update({
      where: { id: payment.id },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const spy = vi.spyOn(paymentProvider, 'queryPaymentStatus').mockResolvedValue({ status: 'failed' });
    await expect(reconcileUnconfirmed(new Date())).resolves.toBeUndefined(); // no throw
    spy.mockRestore();

    const afterPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(afterPayment.status).toBe('failed');
    const appt = await prisma.appointment.findUnique({ where: { id: apptId } });
    expect(appt).not.toBeNull();
    expect(appt.state).toBe('slot_locked');
    expect(appt.lockExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());

    // cleanup
    await prisma.payment.deleteMany({ where: { appointmentId: apptId } });
    await prisma.appointment.deleteMany({ where: { id: apptId } });
    await prisma.auditLog.deleteMany({ where: { targetRef: apptId } });
    await prisma.user.deleteMany({ where: { email } });
  });
});
