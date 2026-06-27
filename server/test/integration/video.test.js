import { describe, it, expect, beforeAll, afterAll } from 'vitest';
process.env.EMAIL_PROVIDER = 'console';
process.env.VIDEO_PROVIDER = 'mock';

const request = (await import('supertest')).default;
const { createApp } = await import('#src/index.js');
const { prisma } = await import('#src/lib/prisma/prisma.js');

const app = createApp();
const uniq = () => `sliced_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('video integration (free tier; 3-state model, no completion)', () => {
  let agent, email, doctorId, userId, liveId, pastId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({ where: { isActive: true, status: 'active' } });
    doctorId = d.id;
    email = uniq();
    agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
      fullName: 'Vid Patient',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    const me = await agent.get('/api/auth/me');
    userId = me.body.id;

    // A: live appointment (slot active now) → token-window test.
    const liveStart = new Date(Date.now() - 5 * 60000);
    const live = await prisma.appointment.create({
      data: {
        doctorId,
        patientUserId: userId,
        slotStart: liveStart,
        slotEnd: new Date(liveStart.getTime() + 30 * 60000),
        state: 'confirmed',
        feeAtBooking: 250000,
        forSelf: true,
      },
    });
    liveId = live.id;

    // B: fully-past appointment (ended >5min ago) → video-token window is closed.
    const pastStart = new Date(Date.now() - 40 * 60000);
    const past = await prisma.appointment.create({
      data: {
        doctorId,
        patientUserId: userId,
        slotStart: pastStart,
        slotEnd: new Date(pastStart.getTime() + 30 * 60000),
        state: 'confirmed',
        feeAtBooking: 250000,
        forSelf: true,
      },
    });
    pastId = past.id;
  });

  it('issues a video token inside the window; joinSimUrl is null (free tier)', async () => {
    const res = await agent.get(`/api/appointments/${liveId}/video-token`);
    expect(res.status).toBe(200);
    expect(res.body.roomName).toBe(`appt_${liveId}`);
    expect(res.body.joinSimUrl).toBeNull();
  });

  it('rejects a video token outside the window with 422', async () => {
    const res = await agent.get(`/api/appointments/${pastId}/video-token`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VIDEO_WINDOW_CLOSED');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { targetRef: { in: [liveId, pastId] } } });
    await prisma.appointment.deleteMany({ where: { id: { in: [liveId, pastId] } } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });
});
