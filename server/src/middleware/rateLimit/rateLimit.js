// @ts-check
import rateLimit from 'express-rate-limit';
import { AppError } from '../../http/AppError.js';

/**
 * Factory for the §3.6 rate limiters. Memory store is acceptable single-instance (CONFIG.md §3).
 * @param {{ windowMs: number, max: number, code?: string,
 *           keyGenerator?: (req: any) => string, skipSuccessfulRequests?: boolean,
 *           onBlocked?: (req: any) => void }} opts
 */
export function makeRateLimiter({
  windowMs,
  max,
  code = 'RATE_LIMITED',
  keyGenerator,
  skipSuccessfulRequests,
  onBlocked,
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator, validate: false } : {}),
    ...(skipSuccessfulRequests ? { skipSuccessfulRequests } : {}),
    handler: (req, _res, next) => {
      if (onBlocked) onBlocked(req);
      next(new AppError(code, 'Too many requests. Try again later.', 429));
    },
  });
}
