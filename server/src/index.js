// @ts-check
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env/env.js';
import { sessionMiddleware } from './middleware/session/session.js';
import { errorHandler } from './http/errorHandler/errorHandler.js';
import { registerRoutes } from './routes.js';
import { initErrorTracking } from './lib/errorTracking/errorTracking.js';
import { logger } from './lib/logger/logger.js';
import { startWorkers } from './workers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp() {
  const app = express();
  // Behind a TLS-terminating proxy in prod (Railway/PaaS): required so express-session sets the
  // Secure cookie and express-rate-limit keys on the real client IP, not the proxy.
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(sessionMiddleware);

  // All /api + /dev routes (see routes.js).
  registerRoutes(app);

  // Uploaded doctor photos (Slice G). In Docker this path is the dermestha_uploads volume.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    express.static(path.resolve(env.UPLOADS_DIR), { index: false }),
  );

  // Static SPA + catch-all LAST (ARCHITECTURE §14.3).
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));

  app.use(errorHandler);
  return app;
}

// Start the server only when executed directly (not when imported by tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initErrorTracking();
  startWorkers();
  createApp().listen(env.PORT, () => logger.info(`Dermestha listening on :${env.PORT}`));
}
