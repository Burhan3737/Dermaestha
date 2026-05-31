// @ts-check
import rateLimit from 'express-rate-limit';
import { AppError } from '../http/AppError.js';

/**
 * Factory for the §3.6 rate limiters. Memory store is acceptable single-instance (CONFIG.md §3).
 * @param {{ windowMs: number, max: number, code?: string }} opts
 */
export function makeRateLimiter({ windowMs, max, code = 'RATE_LIMITED' }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(code, 'Too many requests. Try again later.', 429)),
  });
}
