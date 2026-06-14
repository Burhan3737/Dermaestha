// @ts-check
import * as authService from './service.js';
import { emailProvider } from '../../integrations/email/index.js';
import { env } from '../../config/env/env.js';
import { logger } from '../../lib/logger/logger.js';
import { AppError } from '../../http/AppError.js';
import { RESET_TOKEN_TTL_MIN } from '../../config/constants.js';

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
  } catch (e) {
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const user = await authService.login(req.body);
    setSession(req, user);
    res.json(user);
  } catch (e) {
    next(e);
  }
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
    // Anonymous bootstrap is normal (every public page load). Return 200 null instead of 401 so
    // the SPA's /auth/me probe doesn't emit a browser console error on public pages (ISSUE-13).
    if (!req.session?.userId) return res.json(null);
    const user = await authService.getById(req.session.userId);
    if (!user)
      return req.session.destroy(() =>
        next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401)),
      );
    res.json(user);
  } catch (e) {
    next(e);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestPasswordReset(req.body.email);
    if (result) {
      const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${result.rawToken}`;
      // Fire-and-forget: the response must not reflect whether a send happened (G4/F01.03).
      emailProvider
        .send({
          template: 'password_reset',
          to: req.body.email,
          vars: { resetUrl, expiresInMinutes: RESET_TOKEN_TTL_MIN },
        })
        .catch(() => {
          logger.warn('password reset email not sent', { email: req.body.email });
          if (env.NODE_ENV !== 'production') logger.info('DEV password reset link', { resetUrl });
        });
    }
    res.json({ ok: true }); // identical response whether or not the account exists
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function changePassword(req, res, next) {
  try {
    const user = await authService.changePassword(req.session.userId, req.body);
    req.session.mustChangePassword = false;
    res.json(user);
  } catch (e) {
    next(e);
  }
}
