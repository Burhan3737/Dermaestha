// @ts-check
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import * as audit from './audit.service.js';
import { AppError } from '../http/AppError.js';
import { generateResetToken, hashResetToken } from '../lib/resetToken.js';
import { RESET_TOKEN_TTL_MIN } from '../config/constants.js';

// A constant dummy argon2 hash so an unknown-email login spends similar time as a real verify
// (reduces timing-based enumeration). Any valid argon2id hash works; the password is irrelevant.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$3l0u3Hj5oF0r1uV2bQ8m9rXq5n2pYw0kQ1aZ2bC3dE';

/** @param {{id:string,role:string,fullName:string,mustChangePassword:boolean,doctor?:{id:string}|null}} u */
const toSafeUser = (u) => ({
  id: u.id,
  role: u.role,
  fullName: u.fullName,
  mustChangePassword: u.mustChangePassword,
  ...(u.doctor ? { doctorId: u.doctor.id } : {}),
});

export async function signup({ fullName, email, phone, password }) {
  const passwordHash = await hashPassword(password);
  try {
    const user = await prisma.user.create({
      data: { role: 'patient', email, phone, fullName, passwordHash, tosAcceptedAt: new Date() },
    });
    return toSafeUser(user);
  } catch (e) {
    if (/** @type {any} */ (e)?.code === 'P2002') {
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
    }
    throw e;
  }
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { doctor: { select: { id: true } } },
  });
  if (!user) {
    // Equalize timing vs. a real verify to reduce enumeration; result ignored.
    await verifyPassword(DUMMY_HASH, password).catch(() => {});
    throw new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new AppError('UNAUTHENTICATED', 'Invalid email or password.', 401);
  await audit.record({
    eventType: 'login',
    actorType: user.role,
    actorId: user.id,
    targetRef: user.id,
  });
  return toSafeUser(user);
}

export async function getById(id) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { doctor: { select: { id: true } } },
  });
  return user ? toSafeUser(user) : null;
}

export async function requestPasswordReset(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null; // uniform 200, no work (enumeration-safe)
  const rawToken = generateResetToken();
  const resetTokenHash = hashResetToken(rawToken);
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
  await prisma.user.update({
    where: { id: user.id },
    data: { resetTokenHash, resetTokenExpiresAt },
  });
  return { user: toSafeUser(user), rawToken };
}

export async function resetPassword({ token, newPassword }) {
  const resetTokenHash = hashResetToken(token);
  const user = await prisma.user.findFirst({
    where: { resetTokenHash, resetTokenExpiresAt: { gt: new Date() } },
  });
  if (!user)
    throw new AppError('INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.', 400);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  await audit.record({
    eventType: 'password_change',
    actorType: user.role,
    actorId: user.id,
    targetRef: user.id,
    reason: 'reset',
  });
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect.', 422);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  await audit.record({
    eventType: 'password_change',
    actorType: user.role,
    actorId: user.id,
    targetRef: user.id,
  });
  return toSafeUser({ ...user, mustChangePassword: false });
}
