// @ts-check
import { Router } from 'express';
import * as c from '../controllers/doctor.controller.js';
import { requireRole } from '../middleware/requireRole.js';
import { doctorListQuerySchema, slotsQuerySchema } from '../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

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
