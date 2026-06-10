// @ts-check
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as c from './controller.js';
import { validate } from '../../middleware/validate/validate.js';
import { makeRateLimiter } from '../../middleware/rateLimit/rateLimit.js';
import { requireRole } from '../../middleware/requireRole/requireRole.js';
import * as audit from '../../services/audit/audit.service.js';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '../../../../shared/schemas/index.js';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MIN,
  SIGNUP_MAX_PER_IP_HOUR,
  FORGOT_MAX_PER_ACCOUNT_HOUR,
} from '../../config/constants.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const emailKey = (req) => String(req.body?.email ?? 'unknown').toLowerCase();

const signupLimiter = makeRateLimiter({ windowMs: HOUR, max: SIGNUP_MAX_PER_IP_HOUR });
const loginIpLimiter = makeRateLimiter({ windowMs: 15 * MIN, max: 20 });

// Per-account lockout: counts only FAILED logins (skipSuccessfulRequests); audit on breach.
const loginAccountLimiter = makeRateLimiter({
  windowMs: LOGIN_LOCKOUT_MIN * MIN,
  max: LOGIN_MAX_ATTEMPTS,
  code: 'ACCOUNT_LOCKED',
  keyGenerator: emailKey,
  skipSuccessfulRequests: true,
  onBlocked: (req) => {
    audit
      .record({ eventType: 'login_lockout', actorType: 'system', meta: { email: emailKey(req) } })
      .catch(() => {});
  },
});

// Forgot-password: enumeration-safe — on breach return the SAME 200, do nothing (never 429).
const forgotLimiter = rateLimit({
  windowMs: HOUR,
  max: FORGOT_MAX_PER_ACCOUNT_HOUR,
  keyGenerator: emailKey,
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.json({ ok: true }),
});

export const authRouter = Router();
authRouter.post('/signup', signupLimiter, validate(signupSchema), c.signup);
authRouter.post('/login', loginIpLimiter, loginAccountLimiter, validate(loginSchema), c.login);
authRouter.post('/logout', c.logout);
authRouter.get('/me', c.me);
authRouter.post(
  '/forgot-password',
  forgotLimiter,
  validate(forgotPasswordSchema),
  c.forgotPassword,
);
authRouter.post('/reset-password', validate(resetPasswordSchema), c.resetPassword);
authRouter.post(
  '/change-password',
  requireRole('patient', 'doctor', 'admin'),
  validate(changePasswordSchema),
  c.changePassword,
);
