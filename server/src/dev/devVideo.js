// @ts-check
import { Router } from 'express';
import express from 'express';
import * as videoService from '../modules/video/service.js';
import * as evaluation from '../modules/appointment/service.js';

/** Dev-only video + worker simulation. Mounted ONLY when VIDEO_PROVIDER=mock. */
export const devVideoRouter = Router();

// Simulated room page: buttons emit the documented Daily payload to the real webhook path.
devVideoRouter.get('/video/:id', (req, res) => {
  const id = String(req.params.id);
  res.set('Content-Type', 'text/html').send(`<!doctype html>
<html><body style="font-family:sans-serif;max-width:420px;margin:64px auto">
  <h1>Mock video room — ${id}</h1>
  <form method="POST" action="/dev/video/event">
    <input type="hidden" name="room" value="appt_${id}" />
    <button name="user_name" value="doctor">Doctor joined</button>
    <button name="user_name" value="patient">Patient joined</button>
  </form>
</body></html>`);
});

// Documented-payload sink (the dev page + the SPA join-sim both reach recordJoin through here).
devVideoRouter.post(
  '/video/event',
  express.urlencoded({ extended: false }),
  async (req, res, next) => {
    try {
      await videoService.recordJoinFromDailyEvent({
        type: 'participant.joined',
        room: req.body.room,
        user_name: req.body.user_name,
        timestamp: new Date().toISOString(),
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

// SPA join-sim: role derived from the session, appointmentId from the body.
devVideoRouter.post('/video/join', express.json(), async (req, res, next) => {
  try {
    const role = req.session?.role === 'doctor' ? 'doctor' : 'patient';
    await videoService.recordJoinFromDailyEvent({
      type: 'participant.joined',
      room: `appt_${req.body.appointmentId}`,
      user_name: role,
      timestamp: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// On-demand single evaluation pass (demo/testing without waiting for the cron tick).
devVideoRouter.post('/worker/evaluate', async (_req, res, next) => {
  try {
    await evaluation.evaluateDueAppointments(new Date());
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
