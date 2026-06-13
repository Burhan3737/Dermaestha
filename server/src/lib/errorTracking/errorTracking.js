// @ts-check
import * as Sentry from '@sentry/node';
import { env } from '../../config/env/env.js';
import { logger } from '../logger/logger.js';

let active = false;

/**
 * Sentry beforeSend hook (doc 08 control): strip PII before any event leaves the process —
 * request bodies, cookies, auth headers, and user identity (emails / patient identifiers).
 * @param {any} event
 */
export function beforeSend(event) {
  if (event?.request) {
    delete event.request.data; // request body
    delete event.request.cookies;
    if (event.request.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
  }
  delete event?.user; // emails / patient identifiers
  return event;
}

/** Initialize error tracking. No-op until a DSN is configured. */
export function initErrorTracking(dsn = env.SENTRY_DSN) {
  if (!dsn) {
    logger.info('error-tracking disabled (no DSN)');
    return;
  }
  Sentry.init({ dsn, sendDefaultPii: false, beforeSend });
  active = true;
  logger.info('error-tracking enabled');
}

export function captureException(err) {
  if (active) {
    Sentry.captureException(err);
    return;
  }
  logger.error('captured', { err: String(err) });
}
