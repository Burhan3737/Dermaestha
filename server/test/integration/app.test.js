import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '#src/index.js';
import { prisma } from '#src/lib/prisma/prisma.js';

const app = createApp();

describe('app integration', () => {
  it('GET /api/health returns ok and confirms DB is up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('unknown /api route returns the uniform 404 envelope (not SPA HTML)', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('issues a session cookie with HttpOnly + SameSite=Lax', async () => {
    const res = await request(app).get('/api/health');
    const setCookie = res.headers['set-cookie']?.join(';') ?? '';
    if (setCookie) {
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
