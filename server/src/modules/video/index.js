// @ts-check
import { Router } from 'express';
import * as c from './controller.js';

export const videoWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
videoWebhookRouter.post('/daily', c.daily);
