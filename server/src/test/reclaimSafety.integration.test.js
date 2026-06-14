import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.EMAIL_PROVIDER = 'console';
process.env.PAYFAST_PASSPHRASE = 'test-passphrase';

const request = (await import('supertest')).default;
const { createApp } = await import('../index.js');
const { prisma } = await import('../lib/prisma/prisma.js');
const { formatInTimeZone } = await import('date-fns-tz');
const { SLOT_GRANULARITY_MIN } = await import('../config/constants.js');

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
    .send({ fullName: 'Booker', email, phone: '03001234567', password: 'password1', tosAccepted: true });
  return agent;
}

/** Seed an EXPIRED slot_locked blocker (a different patient's dead hold) + optional Payment. */
async function seedExpiredBlocker(doctorId, slotStart, paymentStatus) {
  const u = await prisma.user.create({
    data: { role: 'patient', email: uniq('blocker'), passwordHash: 'x', fullName: 'Stale Holder' },
  });
  const slotStartDate = new Date(slotStart);
  const appt = await prisma.appointment.create({
    data: {
      doctorId,
      patientUserId: u.id,
      slotStart: slotStartDate,
      slotEnd: new Date(slotStartDate.getTime() + SLOT_GRANULARITY_MIN * 60 * 1000),
      state: 'slot_locked',
      lockExpiresAt: new Date(Date.now() - 60 * 1000), // expired 1 min ago → re-lockable slot
      forSelf: true,
    },
  });
  let payment = null;
  if (paymentStatus) {
    payment = await prisma.payment.create({
      data: {
        appointmentId: appt.id,
        patientUserId: u.id,
        slotStart: slotStartDate,
        amount: 250000,
        status: paymentStatus,
        providerRef: `pr_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
      },
    });
  }
  return { blockerUserId: u.id, appt, payment };
}

// FIX A (Slice H): reclaim-on-conflict (ADR-23) must only reclaim a blocker whose Payment is
// FAILED or absent. A still-PENDING Payment may be a paid-but-lost-IPN — silently deleting it
// would orphan a paying customer, so the booking conflict must stand instead.
describe('FIX A reclaim safety: never delete a PENDING-payment blocker', () => {
  let doctorId;
  let docUserId;

  beforeAll(async () => {
    const u = await prisma.user.create({
      data: { role: 'doctor', email: uniq('fixAdoc'), passwordHash: 'x', fullName: 'Dr FixA' },
    });
    docUserId = u.id;
    const d = await prisma.doctor.create({
      data: {
        userId: u.id,
        pmcNumber: `PMC-FA-${Date.now()}`,
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

  it('reclaims an expired blocker whose Payment is FAILED (slot re-locked, dead intent cleared)', async () => {
    const slotStart = await pickSlot(doctorId);
    const { blockerUserId, appt, payment } = await seedExpiredBlocker(doctorId, slotStart, 'failed');

    const email = uniq('reclaimer');
    const agent = await signup(email);
    const res = await agent.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    expect(res.status).toBe(201); // reclaim succeeds over a FAILED-payment blocker (J1 relies on this)
    expect(res.body.id).not.toBe(appt.id);

    // The dead blocker + its FAILED intent were reclaimed away; the new hold owns the slot.
    expect(await prisma.appointment.findUnique({ where: { id: appt.id } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toBeNull();
    const fresh = await prisma.appointment.findUnique({ where: { id: res.body.id } });
    expect(fresh.state).toBe('slot_locked');

    await prisma.payment.deleteMany({ where: { appointmentId: res.body.id } });
    await prisma.appointment.deleteMany({ where: { id: res.body.id } });
    await prisma.auditLog.deleteMany({ where: { targetRef: { in: [appt.id, res.body.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [blockerUserId] } } });
    await prisma.user.deleteMany({ where: { email } });
  });

  it('refuses to reclaim an expired blocker whose Payment is still PENDING (money is preserved)', async () => {
    const slotStart = await pickSlot(doctorId);
    const { blockerUserId, appt, payment } = await seedExpiredBlocker(doctorId, slotStart, 'pending');

    const email = uniq('blocked');
    const agent = await signup(email);
    const res = await agent.post('/api/appointments/lock').send({ doctorId, slotStart, forSelf: true });
    // The conflict must stand: a PENDING payment may be a lost-IPN paid booking.
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLOT_TAKEN');

    // The blocker appointment + its PENDING Payment survive untouched (left for reconciliation / S1).
    const survivingAppt = await prisma.appointment.findUnique({ where: { id: appt.id } });
    expect(survivingAppt).not.toBeNull();
    expect(survivingAppt.state).toBe('slot_locked');
    const survivingPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(survivingPayment).not.toBeNull();
    expect(survivingPayment.status).toBe('pending');
    // The refused booker created no row.
    expect(await prisma.appointment.findFirst({ where: { patient: { email } } })).toBeNull();

    await prisma.payment.deleteMany({ where: { id: payment.id } });
    await prisma.appointment.deleteMany({ where: { id: appt.id } });
    await prisma.user.deleteMany({ where: { id: blockerUserId } });
    await prisma.user.deleteMany({ where: { email } });
  });
});
