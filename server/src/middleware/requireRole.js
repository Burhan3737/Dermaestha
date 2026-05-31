// @ts-check
import { AppError } from '../http/AppError.js';

/**
 * The single server-side authorization boundary (DA6). Never re-checked in handler bodies,
 * never enforced only on the client.
 * @param {...('patient'|'doctor'|'admin')} allowed
 */
export function requireRole(...allowed) {
  return (req, _res, next) => {
    const user = req.session?.userId ? { id: req.session.userId, role: req.session.role } : null;
    if (!user) return next(new AppError('UNAUTHENTICATED', 'Sign in to continue.', 401));
    if (!allowed.includes(user.role)) return next(new AppError('FORBIDDEN', 'Not allowed.', 403));
    return next();
  };
}
