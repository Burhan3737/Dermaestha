import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../lib/prisma/prisma.js';
import * as auth from '../modules/auth/service.js';

const app = createApp();
const uniq = () => `slicea_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`;

describe('auth integration', () => {
  const created = [];

  it('signup issues an HttpOnly, SameSite=Lax session cookie and returns the safe shape', async () => {
    const email = uniq();
    const res = await request(app).post('/api/auth/signup').send({
      fullName: 'Test P',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      role: 'patient',
      fullName: 'Test P',
      mustChangePassword: false,
    });
    const cookie = res.headers['set-cookie']?.join(';') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    created.push(email);
  });

  it('signup → /me round-trips the session', async () => {
    const email = uniq();
    const agent = request.agent(app);
    await agent.post('/api/auth/signup').send({
      fullName: 'Me',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.email === undefined).toBe(true); // safe shape — no email leaked
    expect(me.body).toMatchObject({ role: 'patient', fullName: 'Me' });
    created.push(email);
  });

  it('login with wrong password returns the generic 401', async () => {
    const email = uniq();
    await request(app).post('/api/auth/signup').send({
      fullName: 'L',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    const res = await request(app).post('/api/auth/login').send({ email, password: 'WRONG' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    created.push(email);
  });

  it('forgot → reset round-trip works and the token is single-use', async () => {
    const email = uniq();
    await request(app).post('/api/auth/signup').send({
      fullName: 'R',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    // Drive the service directly to obtain the raw token (it is never returned over HTTP).
    const { rawToken } = await auth.requestPasswordReset(email);
    const first = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'newpassw0rd' });
    expect(first.status).toBe(200);
    // New password works:
    const ok = await request(app).post('/api/auth/login').send({ email, password: 'newpassw0rd' });
    expect(ok.status).toBe(200);
    // Same token cannot be reused (single-use):
    const second = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: rawToken, newPassword: 'another0ne' });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_RESET_TOKEN');
    created.push(email);
  });

  it('login ignores a mismatched body `role` — the stored role is authoritative (ISSUE-12)', async () => {
    const email = uniq();
    await request(app).post('/api/auth/signup').send({
      fullName: 'Role P',
      email,
      phone: '03001234567',
      password: 'password1',
      tosAccepted: true,
    });
    // Patient account; a hostile/incorrect body role must NOT change the resolved role
    // (enumeration-safety + F15.02 stored-role routing). doc 05 §1 documents `role` in the body,
    // but it is accepted-and-ignored — this locks that contract.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password1', role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('patient');
    created.push(email);
  });

  it('GET /auth/me returns 200 with null for an anonymous caller (ISSUE-13 — no 401 console noise)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('forgot-password returns an identical 200 for unknown and known emails', async () => {
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: uniq() });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ ok: true });
  });

  afterAll(async () => {
    if (created.length) await prisma.user.deleteMany({ where: { email: { in: created } } });
    await prisma.$disconnect();
  });
});
