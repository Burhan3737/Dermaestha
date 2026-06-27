import { describe, it, expect } from 'vitest';
import { parseEnv } from '#src/config/env/env.js';

const base = {
  NODE_ENV: 'test',
  PORT: '3000',
  APP_BASE_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
  SESSION_SECRET: 'x'.repeat(16),
};

describe('parseEnv', () => {
  it('parses a valid env and coerces PORT to a number', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('test');
  });
  it('throws when a required var is missing', () => {
    const { DATABASE_URL, ...rest } = base;
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL/);
  });
  it('rejects a too-short SESSION_SECRET', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });
  it('defaults EMAIL_PROVIDER to stub and accepts overrides', () => {
    const minimal = {
      APP_BASE_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/d',
      SESSION_SECRET: 'x'.repeat(16),
    };
    expect(parseEnv(minimal).EMAIL_PROVIDER).toBe('stub');
    expect(parseEnv({ ...minimal, EMAIL_PROVIDER: 'console' }).EMAIL_PROVIDER).toBe('console');
  });
  it('defaults VIDEO_PROVIDER to stub and accepts mock/daily', () => {
    expect(parseEnv(base).VIDEO_PROVIDER).toBe('stub');
    expect(parseEnv({ ...base, VIDEO_PROVIDER: 'mock' }).VIDEO_PROVIDER).toBe('mock');
    expect(parseEnv({ ...base, VIDEO_PROVIDER: 'daily' }).VIDEO_PROVIDER).toBe('daily');
  });
});
