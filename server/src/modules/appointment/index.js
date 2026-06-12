// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { lockSchema, cancelSchema, disputeSchema } from '../../../../shared/schemas/index.js';
import { PAYMENT_INTENT_MAX_PER_PATIENT_HOUR } from '../../config/constants.js';

const payLimiter = makeRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: PAYMENT_INTENT_MAX_PER_PATIENT_HOUR,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const appointmentsRouter = Router();
appointmentsRouter.post('/lock', requireRole('patient'), validate(lockSchema), c.lock);
appointmentsRouter.post('/:id/pay', requireRole('patient'), payLimiter, c.pay);
appointmentsRouter.get('/', requireRole('patient', 'doctor'), c.list);
appointmentsRouter.get('/:id', requireRole('patient', 'doctor', 'admin'), c.detail);
appointmentsRouter.post(
  '/:id/cancel',
  requireRole('patient', 'doctor'),
  validate(cancelSchema),
  c.cancel,
);
// POST /api/appointments/:id/dispute  (admin; flag set/clear — not a transition) (F13.02)
appointmentsRouter.post('/:id/dispute', requireRole('admin'), adminWriteLimiter, validate(disputeSchema), c.dispute);
appointmentsRouter.get('/:id/video-token', requireRole('patient', 'doctor'), c.videoToken);
