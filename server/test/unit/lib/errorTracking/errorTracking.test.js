import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({ init: vi.fn(), captureException: vi.fn() }));
import * as Sentry from '@sentry/node';
import { initErrorTracking, beforeSend } from '#src/lib/errorTracking/errorTracking.js';

beforeEach(() => vi.clearAllMocks());

describe('initErrorTracking', () => {
  it('no-ops when no DSN is provided', () => {
    initErrorTracking(undefined);
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initializes Sentry when a DSN is provided', () => {
    initErrorTracking('https://abc@o1.ingest.sentry.io/1');
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const opts = Sentry.init.mock.calls[0][0];
    expect(opts.dsn).toBe('https://abc@o1.ingest.sentry.io/1');
    expect(opts.sendDefaultPii).toBe(false);
    expect(typeof opts.beforeSend).toBe('function');
  });
});

describe('beforeSend PII scrubbing', () => {
  it('strips request body, cookies, auth headers, and user identity', () => {
    const scrubbed = beforeSend({
      request: {
        data: { email: 'p@x.io', password: 'secret', subjectName: 'Jane' },
        cookies: 'session=abc',
        headers: { authorization: 'Bearer t', cookie: 'session=abc', 'user-agent': 'UA' },
      },
      user: { email: 'p@x.io', id: 'u1' },
    });
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.headers.authorization).toBeUndefined();
    expect(scrubbed.request.headers.cookie).toBeUndefined();
    expect(scrubbed.request.headers['user-agent']).toBe('UA');
    expect(scrubbed.user).toBeUndefined();
  });
});
