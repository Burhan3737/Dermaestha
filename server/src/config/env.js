// @ts-check
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  PAYFAST_MERCHANT_ID: z.string().optional(),
  PAYFAST_PASSPHRASE: z.string().optional(),
  PAYMENT_PROVIDER: z.enum(['stub', 'mock']).default('stub'),
  EMAIL_PROVIDER: z.enum(['stub', 'console']).default('stub'),
  DAILY_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  ERROR_TRACKING_DSN: z.string().optional(),
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
