// @ts-check
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  EMAIL_PROVIDER: z.enum(['stub', 'console', 'resend']).default('stub'),
  // Daily free tier: room + token only (no participant webhook).
  DAILY_API_KEY: z.string().optional(),
  DAILY_DOMAIN: z.string().optional(),
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
