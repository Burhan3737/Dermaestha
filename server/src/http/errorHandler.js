// @ts-check
import { ZodError } from 'zod';
import { AppError } from './AppError.js';
import { captureException } from '../lib/errorTracking.js';

/** Express error middleware — emits the uniform envelope (API.md §1.1). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    const details = err.issues.reduce((acc, i) => ({ ...acc, [i.path.join('.')]: i.message }), {});
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed.', details } });
  }
  captureException(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
