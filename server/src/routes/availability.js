// @ts-check
import { Router } from 'express';
import * as c from '../controllers/doctor.controller.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { availabilityReplaceSchema } from '../../../shared/schemas/index.js';

export const availabilityRouter = Router();
// PUT /api/availability  (doctor; replaces own weekly blocks)
availabilityRouter.put('/', requireRole('doctor'), validate(availabilityReplaceSchema), c.replaceAvailability);
