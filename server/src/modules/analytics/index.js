// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { validate } from '../../middleware/validate/validate.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { analyticsEventSchema } from '../../../../shared/schemas/index.js';

/** Public endpoint: keyed on IP (landing fires pre-auth). */
export const ANALYTICS_RATE = { windowMs: 60 * 1000, max: 60 };

const analyticsLimiter = makeRateLimiter({
  ...ANALYTICS_RATE,
  keyGenerator: (req) => req.ip,
});

export const analyticsRouter = Router();
// POST /api/analytics/events — public, rate-limited, catalog-validated.
analyticsRouter.post('/events', analyticsLimiter, validate(analyticsEventSchema), c.ingest);
