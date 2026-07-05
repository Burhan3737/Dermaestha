import { describe, it, expect } from 'vitest';
import { loginSchema } from '#shared/schemas/auth/auth.js';

describe('loginSchema.role', () => {
  it('accepts superadmin', () => {
    const r = loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'superadmin' });
    expect(r.success).toBe(true);
  });
  it('still accepts admin/doctor/patient and rejects an unknown role', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'admin' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'doctor' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'patient' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x', role: 'root' }).success).toBe(false);
  });
});
