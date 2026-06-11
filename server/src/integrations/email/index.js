// @ts-check
import { resendEmail } from './resend.js';
import { consoleEmail } from './console.dev.js';
import { env } from '../../config/env/env.js';
import { logger } from '../../lib/logger/logger.js';

/**
 * @typedef {Object} EmailProvider
 * @property {(args: any) => Promise<{ providerId: string }>} send
 * @property {(req: import('express').Request) => any} parseWebhook
 */

/** Key-based fallback: EMAIL_PROVIDER=console forces the dev logger; otherwise a configured
 *  RESEND_API_KEY selects the real adapter, and its absence falls back to console with a
 *  loud warning (no real emails will be delivered). Flip = drop the key in .env + restart. */
function pickProvider() {
  if (env.EMAIL_PROVIDER === 'console') return consoleEmail;
  if (env.RESEND_API_KEY) return resendEmail;
  logger.warn(
    'EMAIL: no RESEND_API_KEY configured — falling back to the console adapter; no real emails will be delivered',
  );
  return consoleEmail;
}

export const emailProvider = pickProvider();
