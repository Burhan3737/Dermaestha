// @ts-check
import { Router } from 'express';
import * as c from '../controllers/webhook.controller.js';

export const webhooksRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie.
webhooksRouter.post('/payfast', c.payfast);
