// @ts-check
import { AppError } from './http/AppError.js';
import { env } from './config/env/env.js';
import { mustChangePasswordGate } from './middleware/mustChangePassword/mustChangePassword.js';
import { authRouter } from './modules/auth/index.js';
import { doctorsRouter, availabilityRouter } from './modules/doctor/index.js';
import { appointmentsRouter } from './modules/appointment/index.js';
import { medicinesRouter, adminMedicinesRouter } from './modules/medicine/index.js';
import { adminRouter } from './modules/admin/index.js';
import { analyticsRouter } from './modules/analytics/index.js';
import { prescriptionsRouter } from './modules/prescription/index.js';
import { healthRouter } from './health/index.js';
import { devWorkersRouter } from './dev/devWorkers.js';

/** Mount all API + dev routes onto the app, in order (extracted from index.js, behavior unchanged). */
export function registerRoutes(app) {
  // API routes first.
  app.use('/api', mustChangePasswordGate); // DA3 gate, after session, before feature routers
  app.use('/api/auth', authRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/medicines', medicinesRouter);
  app.use('/api/admin/medicines', adminMedicinesRouter);
  app.use('/api/admin', adminRouter);
  // Nested prescription routes; mounted before the appointments router so the
  // two-segment path is owned explicitly (mergeParams carries :id through).
  app.use('/api/appointments/:id/prescriptions', prescriptionsRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/analytics', analyticsRouter); // POST /api/analytics/events (public)
  app.use('/api', healthRouter);
  // Unknown /api path → JSON 404 envelope (never the SPA HTML).
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Not found.', 404)));

  // Dev-only simulators. NEVER mounted in production.
  if (env.NODE_ENV === 'development') app.use('/dev', devWorkersRouter);
}
