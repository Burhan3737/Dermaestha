import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('#src/lib/prisma/prisma.js', () => ({
  prisma: { analyticsEvent: { create: vi.fn().mockResolvedValue({ id: 'e1' }) } },
}));

import { prisma } from '#src/lib/prisma/prisma.js';
import * as analytics from '#src/modules/analytics/service.js';
import { analyticsRouter, ANALYTICS_RATE } from '#src/modules/analytics/index.js';
import { errorHandler } from '#src/http/errorHandler/errorHandler.js';

beforeEach(() => vi.clearAllMocks());

function makeApp({ withSession } = {}) {
  const app = express();
  app.use(express.json());
  if (withSession) {
    app.use((req, _res, next) => {
      req.session = { userId: 'u1' };
      next();
    });
  }
  app.use('/api/analytics', analyticsRouter);
  app.use(errorHandler);
  return app;
}

describe('analytics.record', () => {
  it('writes an AnalyticsEvent row', async () => {
    await analytics.record({ type: 'landing_view', networkType: '4g', meta: { a: 1 } });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: { type: 'landing_view', networkType: '4g', meta: { a: 1 } },
    });
  });

  it('never throws (best-effort) when the write fails', async () => {
    prisma.analyticsEvent.create.mockRejectedValueOnce(new Error('db down'));
    await expect(analytics.record({ type: 'booking_started' })).resolves.toBeUndefined();
  });
});

describe('POST /api/analytics/events', () => {
  it('accepts a catalog event and persists it (202)', async () => {
    const res = await request(makeApp())
      .post('/api/analytics/events')
      .send({ type: 'landing_view', networkType: 'wifi', meta: { referrer: 'x' } });
    expect(res.status).toBe(202);
    expect(prisma.analyticsEvent.create).toHaveBeenCalled();
  });

  it('rejects an unknown type with 400 VALIDATION_FAILED', async () => {
    const res = await request(makeApp()).post('/api/analytics/events').send({ type: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('folds the session userId into meta', async () => {
    await request(makeApp({ withSession: true }))
      .post('/api/analytics/events')
      .send({ type: 'booking_started', meta: { doctorId: 'd1' } });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: { type: 'booking_started', networkType: null, meta: { doctorId: 'd1', userId: 'u1' } },
    });
  });

  it('rate-limits after ANALYTICS_RATE.max requests', async () => {
    const app = makeApp();
    // Fire the burst concurrently so all requests land inside the fixed rate window regardless of
    // CPU contention (a sequential awaited loop can span past windowMs under full-suite load and
    // reset the counter). Once the limit is exceeded, at least one response must be 429.
    const responses = await Promise.all(
      Array.from({ length: ANALYTICS_RATE.max + 5 }, () =>
        request(app).post('/api/analytics/events').send({ type: 'landing_view' }),
      ),
    );
    expect(responses.some((r) => r.status === 429)).toBe(true);
  });
});
