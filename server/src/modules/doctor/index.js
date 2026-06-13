// @ts-check
import { Router } from 'express';
import multer from 'multer';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import { AppError } from '../../http/AppError.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import {
  doctorListQuerySchema,
  slotsQuerySchema,
  availabilityReplaceSchema,
  doctorCreateSchema,
  doctorUpdateSchema,
  adminPasswordResetSchema,
} from '../../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

// PMC/email immutability (#8): presence of either key in a PATCH body is a 409, not a silent strip.
const rejectImmutable = (req, _res, next) => {
  if ('pmcNumber' in (req.body ?? {}) || 'email' in (req.body ?? {})) {
    return next(new AppError('IMMUTABLE_FIELD', 'PMC number and email cannot be changed.', 409));
  }
  next();
};

// 2MB cap (F10.01). multer errors (oversize, wrong part) become the uniform 400 envelope.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const photoUpload = (req, res, next) =>
  upload.single('photo')(req, res, (err) => {
    if (err) return next(new AppError('INVALID_FILE', 'Photo must be a single file of at most 2MB.', 400));
    next();
  });

// Modest throttle on admin doctor writes (house style — same factory as payLimiter).
const adminWriteLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  code: 'RATE_LIMITED',
  keyGenerator: (req) => req.session?.userId ?? req.ip,
});

export const doctorsRouter = Router();
// GET /api/doctors  (public, paginated)
doctorsRouter.get('/', validateQuery(doctorListQuerySchema), (req, res, next) => {
  req.body = req.query; // controller.list reads pagination from req.body for symmetry
  return c.list(req, res, next);
});
// GET /api/doctors/:id  (public)
doctorsRouter.get('/:id', c.getOne);
// GET /api/doctors/:id/slots?date=YYYY-MM-DD  (public)
doctorsRouter.get('/:id/slots', validateQuery(slotsQuerySchema), c.slots);
// GET /api/doctors/:id/availability  (doctor-own / admin)
doctorsRouter.get('/:id/availability', requireRole('doctor', 'admin'), c.getAvailability);

// ── Admin doctor management (F10, doc 05 §F02/F10) ─────────────────────────
doctorsRouter.post('/', requireRole('admin'), adminWriteLimiter, validate(doctorCreateSchema), c.create);
doctorsRouter.patch('/:id', requireRole('admin'), adminWriteLimiter, rejectImmutable, validate(doctorUpdateSchema), c.update);
doctorsRouter.post('/:id/deactivate', requireRole('admin'), adminWriteLimiter, c.deactivate);
doctorsRouter.post('/:id/reactivate', requireRole('admin'), adminWriteLimiter, c.reactivate);
doctorsRouter.post('/:id/reset-password', requireRole('admin'), adminWriteLimiter, validate(adminPasswordResetSchema), c.resetPassword);
doctorsRouter.post('/:id/photo', requireRole('admin'), adminWriteLimiter, photoUpload, c.photo);
doctorsRouter.put('/:id/availability', requireRole('admin'), adminWriteLimiter, validate(availabilityReplaceSchema), c.adminReplaceAvailability);

export const availabilityRouter = Router();
// PUT /api/availability  (doctor; replaces own weekly blocks)
availabilityRouter.put(
  '/',
  requireRole('doctor'),
  validate(availabilityReplaceSchema),
  c.replaceAvailability,
);
