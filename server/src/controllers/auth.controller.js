// @ts-check
import * as authService from '../services/auth.service.js';
import { emailProvider } from '../integrations/email/index.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../http/AppError.js';
import { RESET_TOKEN_TTL_MIN } from '../config/constants.js';

function setSession(req, user) {
  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.mustChangePassword = user.mustChangePassword;
}

export async function signup(req, res, next) {
  try {
    const user = await authService.signup(req.body);
    setSession(req, user);
    res.status(201).json(user);
  } catch (e) { next(e); }
}

export async function login(req, res, next) {
  try {
    const user = await authService.login(req.body);
    setSession(req, user);
    res.json(user);
  } catch (e) { next(e); }
}

export function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('dermestha.sid');
    res.status(204).end();
  });
}

export async function me(req, res, next) {
  try {
    if (!req.session?.userId) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    const user = await authService.getById(req.session.userId);
    if (!user) return req.session.destroy(() => next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401)));
    res.json(user);
  } catch (e) { next(e); }
}

export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    if (result) {
      const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${result.rawToken}`;
      try {
        await emailProvider.send({
          template: 'password_reset',
          to: req.body.email,
          vars: { resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MIN },
        });
      } catch {
        // Resend adapter is a stub until the email integration lands; never leak failure to the caller.
        logger.warn('password reset email not sent (provider stub)', { email: req.body.email });
        if (env.NODE_ENV !== 'production') logger.info('DEV password reset link', { resetUrl });
      }
    }
    res.json({ ok: true }); // identical response whether or not the account exists
  } catch (e) { next(e); }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

export async function changePassword(req, res, next) {
  try {
    const user = await authService.changePassword(req.session.userId, req.body);
    req.session.mustChangePassword = false;
    res.json(user);
  } catch (e) { next(e); }
}
