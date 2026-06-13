// @ts-check
import { videoProvider } from '../../integrations/video/index.js';
import * as videoService from './service.js';
import * as audit from '../../services/audit/audit.service.js';
import { AppError } from '../../http/AppError.js';
import { logger } from '../../lib/logger/logger.js';

// Daily participant events (doc 14 §3). Public route — authenticity comes from the signature.
export async function daily(req, res, next) {
  let evt;
  try {
    evt = videoProvider.verifyWebhook(req); // throws AppError(INVALID_SIGNATURE, 401) on bad sig
  } catch (e) {
    logger.warn('daily webhook signature rejected');
    await audit
      .record({ eventType: 'video.webhook_rejected', actorType: 'system', reason: 'bad signature' })
      .catch(() => {});
    return next(
      e instanceof AppError ? e : new AppError('INVALID_SIGNATURE', 'Webhook rejected.', 401),
    );
  }
  try {
    if (evt) await videoService.recordJoinFromDailyEvent(evt);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
