// @ts-check
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../services/video.service.js', () => ({ recordJoinFromDailyEvent: vi.fn() }));
import * as video from '../services/video.service.js';
import { daily } from './webhook.controller.js';

beforeEach(() => vi.clearAllMocks());

describe('daily webhook', () => {
  it('forwards a participant event to recordJoinFromDailyEvent and 200s', async () => {
    const req = { body: { type: 'participant.joined', room: 'appt_a1', user_name: 'doctor' } };
    const res = { json: vi.fn() };
    const next = vi.fn();
    await daily(req, res, next);
    expect(video.recordJoinFromDailyEvent).toHaveBeenCalledWith(req.body);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
