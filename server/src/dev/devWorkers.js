// @ts-check
import { Router } from 'express';
import { dispatchDueNotifications } from '../modules/notification/service.js';

/** Dev-only on-demand worker passes (no waiting for cron). NEVER mounted in production. */
export const devWorkersRouter = Router();

const trigger = (fn) => async (_req, res, next) => {
  try {
    await fn(new Date());
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

devWorkersRouter.post('/worker/notifications', trigger(dispatchDueNotifications));
