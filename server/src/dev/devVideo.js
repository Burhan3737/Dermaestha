// @ts-check
import { Router } from 'express';
import * as completion from '../modules/appointment/service.js';

/** Dev-only worker simulation. Mounted ONLY when VIDEO_PROVIDER=mock. */
export const devVideoRouter = Router();

// On-demand single completion pass (demo/testing without waiting for the cron tick).
devVideoRouter.post('/worker/evaluate', async (_req, res, next) => {
  try {
    await completion.completeDueAppointments(new Date());
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
