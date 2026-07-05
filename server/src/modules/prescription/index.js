// @ts-check
import { Router } from 'express';
import * as c from './controller.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import { validate } from '../../middleware/validate/validate.js';
import { prescriptionCreateSchema } from '../../../../shared/schemas/index.js';

export const prescriptionsRouter = Router({ mergeParams: true });
// POST /api/appointments/:id/prescriptions  (doctor-owner; immutable submit)
prescriptionsRouter.post('/', requireRole('doctor'), validate(prescriptionCreateSchema), c.create);
// GET /api/appointments/:id/prescriptions  (patient-owner / doctor-owner / admin)
prescriptionsRouter.get('/', requireRole('patient', 'doctor', 'admin', 'superadmin'), c.list);
