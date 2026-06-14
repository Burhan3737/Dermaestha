import { describe, it, expect } from 'vitest';
import { mustChangePasswordGate } from '#src/middleware/mustChangePassword/mustChangePassword.js';

// Mounted on '/api', so req.path is relative to that mount (e.g. '/auth/me').
function ctx(session, path) {
  let err;
  const req = { session, path };
  const next = (e) => {
    err = e;
  };
  return { req, next, getErr: () => err };
}

describe('mustChangePassword gate (DA3)', () => {
  it('lets a normal session through', () => {
    const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: false }, '/doctors');
    mustChangePasswordGate(req, {}, next);
    expect(getErr()).toBeUndefined();
  });
  it('blocks a flagged session on a non-allowlisted route with 403 MUST_CHANGE_PASSWORD', () => {
    const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: true }, '/doctors');
    mustChangePasswordGate(req, {}, next);
    expect(getErr()).toMatchObject({ code: 'MUST_CHANGE_PASSWORD', status: 403 });
  });
  it.each(['/auth/me', '/auth/change-password', '/auth/logout'])(
    'allows %s even when flagged',
    (path) => {
      const { req, next, getErr } = ctx({ userId: 'u1', mustChangePassword: true }, path);
      mustChangePasswordGate(req, {}, next);
      expect(getErr()).toBeUndefined();
    },
  );
});
