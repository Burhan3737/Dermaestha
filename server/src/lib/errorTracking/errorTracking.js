// @ts-check
import { logger } from '../logger/logger.js';
/** Initialize error tracking. No-op until a DSN is configured (A3 wires this in M4). */
export function initErrorTracking() {
  const dsn = process.env.ERROR_TRACKING_DSN;
  if (!dsn) {
    logger.info('error-tracking disabled (no DSN)');
    return;
  }
  logger.info('error-tracking enabled');
  // Concrete SDK init (e.g. Sentry) added when A3 lands.
}
export function captureException(err) {
  logger.error('captured', { err: String(err) });
}
