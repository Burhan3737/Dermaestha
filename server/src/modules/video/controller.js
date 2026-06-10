// @ts-check
import * as videoService from './service.js';

// Daily participant events (doc 14 §3). Signature verification deferred to the real adapter.
export async function daily(req, res, next) {
  try {
    await videoService.recordJoinFromDailyEvent(req.body ?? {});
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}
