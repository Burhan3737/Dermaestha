// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { recordsQuerySchema, auditQuerySchema, settingsUpdateSchema } from '../../../../shared/schemas/index.js';
import { validate } from '../../middleware/validate/validate.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
// Follows house pattern (same as doctor/index.js and medicine/index.js).
// next(r.error) is correct: r.error is a ZodError and errorHandler maps it to 400 VALIDATION_FAILED.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const adminRouter = Router();
// GET /api/admin/alerts  (A-03 feed, F12.01)
adminRouter.get('/alerts', requireRole('admin', 'superadmin'), c.alerts);
// GET /api/admin/records  (A-04 unified records, F13.01)
adminRouter.get('/records', requireRole('admin', 'superadmin'), validateQuery(recordsQuerySchema), c.records);
// GET /api/admin/records/:id  (A-04 detail: history + prescriptions + email jobs, F13.02)
adminRouter.get('/records/:id', requireRole('admin', 'superadmin'), c.recordDetail);
// GET /api/admin/audit  (A-04 audit tab, F13.01)
adminRouter.get('/audit', requireRole('admin', 'superadmin'), validateQuery(auditQuerySchema), c.auditEntries);
// POST /api/admin/emails/:jobId/resend  (F12.02; :jobId = notification_jobs.id)
adminRouter.post('/emails/:jobId/resend', requireRole('admin', 'superadmin'), adminWriteLimiter, c.resendEmail);
// GET/PUT /api/admin/settings  (A-05, F14; lead-time floor 30 enforced by the DTO)
adminRouter.get('/settings', requireRole('admin', 'superadmin'), c.getSettings);
adminRouter.put('/settings', requireRole('admin', 'superadmin'), adminWriteLimiter, validate(settingsUpdateSchema), c.putSettings);
// POST /api/admin/appointments/:id/accept|reject  (manual-payment review → confirm/cancel)
adminRouter.post('/appointments/:id/accept', requireRole('admin', 'superadmin'), adminWriteLimiter, c.acceptAppointment);
adminRouter.post('/appointments/:id/reject', requireRole('admin', 'superadmin'), adminWriteLimiter, c.rejectAppointment);
