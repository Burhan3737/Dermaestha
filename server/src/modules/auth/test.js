import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/prisma/prisma.js', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() } },
}));
vi.mock('../../lib/password/password.js', () => ({
  hashPassword: vi.fn(async (p) => `hash:${p}`),
  verifyPassword: vi.fn(async (hash, p) => hash === `hash:${p}`),
}));
vi.mock('../../services/audit/audit.service.js', () => ({ record: vi.fn(async () => {}) }));

import { prisma } from '../../lib/prisma/prisma.js';
import * as audit from '../../services/audit/audit.service.js';
import * as auth from './service.js';
import { hashResetToken } from '../../lib/resetToken/resetToken.js';
import * as resetToken from '../../lib/resetToken/resetToken.js';

beforeEach(() => vi.clearAllMocks());

describe('auth.service', () => {
  it('signup creates a patient with tosAcceptedAt and returns the safe shape', async () => {
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      role: 'patient',
      fullName: 'Aa',
      mustChangePassword: false,
      passwordHash: 'hash:pw',
    });
    const out = await auth.signup({
      fullName: 'Aa',
      email: 'a@b.com',
      phone: '0300',
      password: 'password1',
    });
    expect(out).toEqual({ id: 'u1', role: 'patient', fullName: 'Aa', mustChangePassword: false });
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe('patient');
    expect(data.tosAcceptedAt).toBeInstanceOf(Date);
    expect(data.passwordHash).toBe('hash:password1');
  });

  it('signup maps a P2002 unique violation to EMAIL_TAKEN 409', async () => {
    prisma.user.create.mockRejectedValue({ code: 'P2002' });
    await expect(
      auth.signup({ fullName: 'Aa', email: 'a@b.com', phone: '0300', password: 'password1' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
  });

  it('login returns the safe shape and audits on success', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'doctor',
      fullName: 'Dr',
      mustChangePassword: true,
      passwordHash: 'hash:pw',
      doctor: { id: 'doc1' },
    });
    const out = await auth.login({ email: 'd@b.com', password: 'pw' });
    expect(out).toEqual({
      id: 'u1',
      role: 'doctor',
      fullName: 'Dr',
      mustChangePassword: true,
      doctorId: 'doc1',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'login', actorType: 'doctor', actorId: 'u1' }),
    );
  });

  it('login throws an identical generic 401 for unknown email and for wrong password (enumeration-safe)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const unknown = await auth.login({ email: 'x@b.com', password: 'pw' }).catch((e) => e);
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'patient',
      passwordHash: 'hash:right',
    });
    const wrong = await auth.login({ email: 'a@b.com', password: 'wrong' }).catch((e) => e);
    expect(unknown).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(wrong).toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(unknown.message).toBe(wrong.message);
  });

  it('requestPasswordReset returns null for unknown email (uniform 200, constant-shape work, no DB write)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await auth.requestPasswordReset('x@b.com')).toBeNull();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('unknown email still performs token-shaped work (timing equalization, G4)', async () => {
    const spy = vi.spyOn(resetToken, 'hashResetToken');
    prisma.user.findUnique.mockResolvedValue(null);
    const out = await auth.requestPasswordReset('ghost@t.test');
    expect(out).toBeNull();
    expect(spy).toHaveBeenCalled(); // same CPU shape as the known-email path
  });

  it('requestPasswordReset stores the token HASH (not raw) + expiry and returns the raw token', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'patient' });
    prisma.user.update.mockResolvedValue({});
    const out = await auth.requestPasswordReset('a@b.com');
    expect(out.rawToken).toMatch(/^[0-9a-f]{64}$/);
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.resetTokenHash).toBe(hashResetToken(out.rawToken));
    expect(data.resetTokenHash).not.toBe(out.rawToken);
    expect(data.resetTokenExpiresAt).toBeInstanceOf(Date);
  });

  it('resetPassword sets a new password and clears the token columns (single-use) on a valid token', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', role: 'patient' });
    prisma.user.update.mockResolvedValue({});
    await auth.resetPassword({ token: 'a'.repeat(64), newPassword: 'newpassw0rd' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).toBe('hash:newpassw0rd');
    expect(data.resetTokenHash).toBeNull();
    expect(data.resetTokenExpiresAt).toBeNull();
  });

  it('resetPassword throws INVALID_RESET_TOKEN when no unexpired match', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      auth.resetPassword({ token: 'bad', newPassword: 'newpassw0rd' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESET_TOKEN', status: 400 });
  });

  it('changePassword verifies current, clears mustChangePassword, and audits', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'doctor',
      fullName: 'Dr',
      mustChangePassword: true,
      passwordHash: 'hash:old',
    });
    prisma.user.update.mockResolvedValue({});
    const out = await auth.changePassword('u1', {
      currentPassword: 'old',
      newPassword: 'brandnew1',
    });
    expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
      passwordHash: 'hash:brandnew1',
      mustChangePassword: false,
    });
    expect(out.mustChangePassword).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'password_change', actorId: 'u1' }),
    );
  });

  it('changePassword rejects a wrong current password with 422', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      role: 'doctor',
      passwordHash: 'hash:old',
    });
    await expect(
      auth.changePassword('u1', { currentPassword: 'WRONG', newPassword: 'brandnew1' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', status: 422 });
  });
});
