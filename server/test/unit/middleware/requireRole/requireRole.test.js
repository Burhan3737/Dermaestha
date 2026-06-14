import { describe, it, expect } from 'vitest';
import { requireRole } from '#src/middleware/requireRole/requireRole.js';

function ctx(session) {
  let nextErr;
  const req = { session };
  const res = {};
  const next = (e) => {
    nextErr = e;
  };
  return { req, res, next, getErr: () => nextErr };
}

describe('requireRole (DA6)', () => {
  it('passes through a session with an allowed role', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'doctor' });
    requireRole('doctor', 'admin')(req, res, next);
    expect(getErr()).toBeUndefined();
  });
  it('401 UNAUTHENTICATED when no session user', () => {
    const { req, res, next, getErr } = ctx({});
    requireRole('admin')(req, res, next);
    expect(getErr()).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
  });
  it('403 FORBIDDEN when role not allowed', () => {
    const { req, res, next, getErr } = ctx({ userId: 'u1', role: 'patient' });
    requireRole('admin')(req, res, next);
    expect(getErr()).toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});
