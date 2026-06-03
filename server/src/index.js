// @ts-check
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './http/errorHandler.js';
import { AppError } from './http/AppError.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { doctorsRouter } from './routes/doctors.js';
import { availabilityRouter } from './routes/availability.js';
import { mustChangePasswordGate } from './middleware/mustChangePassword.js';
import { initErrorTracking } from './lib/errorTracking.js';
import { logger } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  // Behind a TLS-terminating proxy in prod (Railway/PaaS): required so express-session sets the
  // Secure cookie and express-rate-limit keys on the real client IP, not the proxy.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(sessionMiddleware);

  // API routes first.
  app.use('/api', mustChangePasswordGate);   // DA3 gate, after session, before feature routers
  app.use('/api/auth', authRouter);
  app.use('/api/doctors', doctorsRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api', healthRouter);
  // Unknown /api path → JSON 404 envelope (never the SPA HTML).
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 'Not found.', 404)));

  // Static SPA + catch-all LAST (ARCHITECTURE §14.3).
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

  app.use(errorHandler);
  return app;
}

// Start the server only when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initErrorTracking();
  createApp().listen(env.PORT, () => logger.info(`Dermestha listening on :${env.PORT}`));
}
