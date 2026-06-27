import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('#src/config/env/env.js', () => ({
  env: {
    DAILY_API_KEY: 'dk_test',
    DAILY_DOMAIN: 'dermestha.daily.co',
    VIDEO_PROVIDER: 'daily',
    NODE_ENV: 'test',
  },
}));

import { dailyReal } from '#src/integrations/video/daily.js';

describe('dailyReal.createRoom', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('reuses an existing room when GET /rooms/:name returns 200 (idempotent)', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
    });
    const out = await dailyReal.createRoom('a1', { notAfterIso: '2026-06-04T10:35:00.000Z' });
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.daily.co/v1/rooms/appt_a1');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer dk_test');
  });

  it('creates a private room (exp from notAfterIso, eject_at_room_exp, prejoin) when GET 404s', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
      });
    const out = await dailyReal.createRoom('a1', { notAfterIso: '2026-06-04T10:35:00.000Z' });
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('https://api.daily.co/v1/rooms');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.name).toBe('appt_a1');
    expect(body.privacy).toBe('private');
    expect(body.properties.exp).toBe(
      Math.floor(new Date('2026-06-04T10:35:00.000Z').getTime() / 1000),
    );
    expect(body.properties.eject_at_room_exp).toBe(true);
    expect(body.properties.enable_prejoin_ui).toBe(true);
  });

  it('falls back to GET when POST races to a 400 duplicate (no body string-matching)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) }) // initial GET
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'whatever' }) }) // POST race
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ name: 'appt_a1', url: 'https://dermestha.daily.co/appt_a1' }),
      }); // GET fallback
    const out = await dailyReal.createRoom('a1');
    expect(out).toEqual({ roomName: 'appt_a1', roomUrl: 'https://dermestha.daily.co/appt_a1' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('maps a non-2xx create (non-400) to VIDEO_ROOM_FAILED (502)', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(dailyReal.createRoom('a1')).rejects.toMatchObject({
      code: 'VIDEO_ROOM_FAILED',
      status: 502,
    });
  });
});

describe('dailyReal.issueToken', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it('POSTs meeting-tokens with role-anchored user_id + is_owner and returns notAfter as expiresAt', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ token: 'tok_1' }) });
    const out = await dailyReal.issueToken({
      roomName: 'appt_a1',
      role: 'doctor',
      notBeforeIso: '2026-06-04T09:50:00.000Z',
      notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Dr Sara Khan',
    });
    expect(out).toEqual({ token: 'tok_1', expiresAt: '2026-06-04T10:35:00.000Z' });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.daily.co/v1/meeting-tokens');
    const props = JSON.parse(init.body).properties;
    expect(props.room_name).toBe('appt_a1');
    expect(props.is_owner).toBe(true);
    expect(props.user_name).toBe('Dr Sara Khan');
    expect(props.user_id).toBe('doctor');
    expect(props.nbf).toBe(Math.floor(new Date('2026-06-04T09:50:00.000Z').getTime() / 1000));
    expect(props.exp).toBe(Math.floor(new Date('2026-06-04T10:35:00.000Z').getTime() / 1000));
  });

  it('sets is_owner false for a patient and maps a non-2xx to VIDEO_TOKEN_FAILED (502)', async () => {
    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 't' }) });
    const out = await dailyReal.issueToken({
      roomName: 'appt_a1',
      role: 'patient',
      notBeforeIso: '2026-06-04T09:50:00.000Z',
      notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Pat',
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).properties.is_owner).toBe(false);
    expect(out.token).toBe('t');

    fetch.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      dailyReal.issueToken({
        roomName: 'appt_a1',
        role: 'patient',
        notBeforeIso: '2026-06-04T09:50:00.000Z',
        notAfterIso: '2026-06-04T10:35:00.000Z',
        displayName: 'Pat',
      }),
    ).rejects.toMatchObject({ code: 'VIDEO_TOKEN_FAILED', status: 502 });
  });
});
