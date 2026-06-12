// @ts-check
import { ZodError } from 'zod';
import { AppError } from '../AppError.js';
import { captureException } from '../../lib/errorTracking/errorTracking.js';
import * as audit from '../../services/audit/audit.service.js';

/** Express error middleware — emits the uniform envelope (API.md §1.1). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  // instanceof alone misses ZodErrors from shared/ (root zod@4) — the server pins zod@3; duck-type as fallback.
  if (err instanceof ZodError || (err?.name === 'ZodError' && Array.isArray(err?.issues))) {
    const details = err.issues.reduce((acc, i) => ({ ...acc, [i.path.join('.')]: i.message }), {});
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION_FAILED', message: 'Validation failed.', details } });
  }
  captureException(err);
  // F12.01 alert source #5: best-effort audit row (route + message only — no stack, no PII).
  // Fire-and-forget: an audit failure must never mask the original error response.
  try {
    audit
      .record({
        eventType: 'system.unhandled_exception',
        actorType: 'system',
        targetRef: req?.path,
        reason: String(err?.message ?? err).slice(0, 500),
        meta: { method: req?.method },
      })
      .catch(() => {});
  } catch {
    // a sync throw from the audit layer must never block the 500 response
  }
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
