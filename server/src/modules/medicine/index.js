// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import {
  medicineSearchQuerySchema,
  medicineCreateSchema,
  medicineUpdateSchema,
} from '../../../../shared/schemas/index.js';

// Validate req.query into req.query (Zod) without a body. Small inline middleware.
const validateQuery = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.query);
  if (!r.success) return next(r.error);
  req.query = r.data;
  next();
};

export const medicinesRouter = Router();
// GET /api/medicines?search=  (doctor/admin: builder dropdown source)
medicinesRouter.get(
  '/',
  requireRole('doctor', 'admin'),
  validateQuery(medicineSearchQuerySchema),
  c.list,
);

export const adminMedicinesRouter = Router();
// POST /api/admin/medicines  (admin; A-02 UI lands in Slice G)
adminMedicinesRouter.post('/', requireRole('admin'), validate(medicineCreateSchema), c.create);
// PATCH /api/admin/medicines/:id  (admin; edit + deactivate)
adminMedicinesRouter.patch('/:id', requireRole('admin'), validate(medicineUpdateSchema), c.update);
