// @ts-check
import { paymentProvider } from '../integrations/payment/index.js';
import * as paymentService from '../services/payment.service.js';
import * as audit from '../services/audit.service.js';
import { AppError } from '../http/AppError.js';
import { logger } from '../lib/logger.js';
import * as videoService from '../services/video.service.js';

export async function payfast(req, res, next) {
  let result;
  try {
    result = paymentProvider.verifyWebhook(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('payfast webhook signature rejected');
    await audit
      .record({
        eventType: 'payment.webhook_rejected',
        actorType: 'system',
        reason: 'bad signature',
      })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Webhook rejected.', 401),
    );
  }
  try {
    await paymentService.processWebhook(result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

// Daily participant events (doc 14 §3). Signature verification deferred to the real adapter.
export async function daily(req, res, next) {
  try {
    await videoService.recordJoinFromDailyEvent(req.body ?? {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
