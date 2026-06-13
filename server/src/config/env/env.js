// @ts-check
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  PAYFAST_MERCHANT_ID: z.string().optional(),
  PAYFAST_SECURED_KEY: z.string().optional(),
  PAYFAST_MERCHANT_NAME: z.string().optional(),
  PAYFAST_STORE_ID: z.string().optional(),
  // Dev-mock signing only (ADR-22). Real PayFast PK signature does not use a passphrase.
  PAYFAST_PASSPHRASE: z.string().optional(),
  PAYFAST_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYMENT_PROVIDER: z.enum(['stub', 'mock', 'payfast']).default('stub'),
  EMAIL_PROVIDER: z.enum(['stub', 'console', 'resend']).default('stub'),
  DAILY_API_KEY: z.string().optional(),
  DAILY_DOMAIN: z.string().optional(),
  // Daily webhook HMAC secret (the `hmac` returned by POST /v1/webhooks). Base64; optional until
  // the webhook is registered. See server/scripts/register-daily-webhook.mjs.
  DAILY_WEBHOOK_SECRET: z.string().optional(),
  VIDEO_PROVIDER: z.enum(['stub', 'mock', 'daily']).default('stub'),
  VIDEO_MOCK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  UPLOADS_DIR: z.string().default('./uploads'),
});

/** @param {NodeJS.ProcessEnv | Record<string,string|undefined>} raw */
export function parseEnv(raw) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
