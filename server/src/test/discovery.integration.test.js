import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../lib/prisma.js';

const app = createApp();

describe('discovery + availability integration', () => {
  let doctorId;

  beforeAll(async () => {
    const d = await prisma.doctor.findFirst({ where: { isActive: true, status: 'active' } });
    doctorId = d?.id;
  });

  it('GET /api/doctors lists active doctors with the paginated envelope', async () => {
    const res = await request(app).get('/api/doctors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.page).toMatchObject({ number: 1, size: 20 });
    expect(res.body.data[0]).toHaveProperty('nextAvailableSlot');
    expect(res.body.data[0]).not.toHaveProperty('email'); // safe card shape
  });

  it('GET /api/doctors/:id returns a public profile; unknown id is 404', async () => {
    const ok = await request(app).get(`/api/doctors/${doctorId}`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: doctorId });
    const missing = await request(app).get('/api/doctors/does-not-exist');
    expect(missing.status).toBe(404);
  });

  it('GET /api/doctors/:id/slots returns generated slots for a date', async () => {
    // Pick a near-future Monday (seed blocks are Mon/Wed/Fri).
    const res = await request(app)
      .get(`/api/doctors/${doctorId}/slots`)
      .query({ date: nextMonday() });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length) {
      expect(res.body.data[0]).toHaveProperty('slotStart');
      expect(res.body.data[0]).toHaveProperty('slotEnd');
    }
  });

  it('GET /api/doctors/:id/slots returns 404 for an inactive doctor (parity with profile, no leak)', async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: {
        role: 'doctor',
        email: `inactive_${suffix}@test.local`,
        phone: `0300${String(suffix).slice(-7)}`,
        fullName: 'Dr. Inactive',
        passwordHash: 'x',
        mustChangePassword: false,
      },
    });
    const doc = await prisma.doctor.create({
      data: {
        userId: user.id,
        pmcNumber: `PMC-INACT-${suffix}`,
        specialization: 'Test',
        fee: 250000,
        isActive: false,
        status: 'active',
      },
    });
    try {
      const res = await request(app)
        .get(`/api/doctors/${doc.id}/slots`)
        .query({ date: nextMonday() });
      expect(res.status).toBe(404);
    } finally {
      await prisma.doctor.delete({ where: { id: doc.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('availability requires auth (no session → 401)', async () => {
    const res = await request(app).put('/api/availability').send({ blocks: [] });
    expect(res.status).toBe(401);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});

function nextMonday() {
  const d = new Date();
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() !== 1);
  return d.toISOString().slice(0, 10);
}
