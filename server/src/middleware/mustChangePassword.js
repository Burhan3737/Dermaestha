// @ts-check
import { AppError } from '../http/AppError.js';

// Mounted on '/api', so paths are relative to that mount.
const ALLOWLIST = new Set(['/auth/logout', '/auth/change-password', '/auth/me']);

/**
 * DA3/DA5 gate: a session flagged mustChangePassword may not reach any route except the
 * allowlisted auth routes until the password is changed.
 */
export function mustChangePasswordGate(req, _res, next) {
  if (req.session?.mustChangePassword && !ALLOWLIST.has(req.path)) {
    return next(
      new AppError('MUST_CHANGE_PASSWORD', 'You must change your password before continuing.', 403),
    );
  }
  next();
}
