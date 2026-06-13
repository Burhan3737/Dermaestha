// @ts-check
import { Router } from 'express';
import express from 'express';
import * as c from './controller.js';

export const videoWebhookRouter = Router();
// Public (no session): authenticity comes from the signature, not a cookie. This route owns its
// JSON parsing so the verify callback can capture the exact received bytes for HMAC verification.
// VALIDATE raw-body vs JSON.stringify against a live Daily delivery before go-live (doc 07 gate).
const captureRawBody = (req, _res, buf) => {
  req.rawBody = buf.toString('utf8');
};
videoWebhookRouter.post('/daily', express.json({ verify: captureRawBody }), c.daily);
