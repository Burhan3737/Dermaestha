import { describe, it, expect } from 'vitest';
import { dailyMock } from './daily.mock.js';

describe('daily.mock VideoProvider', () => {
  it('derives a deterministic room from the appointment id', async () => {
    const room = await dailyMock.createRoom('appt123');
    expect(room.roomName).toBe('appt_appt123');
    expect(room.roomUrl).toContain('appt123');
  });

  it('issues a token whose expiresAt is the notAfter bound', async () => {
    const t = await dailyMock.issueToken({
      roomName: 'appt_appt123',
      role: 'patient',
      notBeforeIso: '2026-06-04T10:00:00.000Z',
      notAfterIso: '2026-06-04T10:35:00.000Z',
      displayName: 'Pat',
    });
    expect(typeof t.token).toBe('string');
    expect(t.token.length).toBeGreaterThan(10);
    expect(t.expiresAt).toBe('2026-06-04T10:35:00.000Z');
    // The embedded payload must decode intact (guards against payload-construction regressions).
    const decoded = Buffer.from(t.token, 'base64url').toString('utf8');
    expect(decoded).toContain('appt_appt123|patient|2026-06-04T10:00:00.000Z');
  });

  it('verifyWebhook normalizes the unsigned dev-simulator shape (role from user_name)', () => {
    const evt = dailyMock.verifyWebhook({
      body: { type: 'participant.joined', room: 'appt_a1', user_name: 'doctor', timestamp: '2026-06-04T10:00:00.000Z' },
    });
    expect(evt).toMatchObject({
      type: 'participant.joined',
      appointmentId: 'a1',
      role: 'doctor',
      timestamp: '2026-06-04T10:00:00.000Z',
    });
  });

  it('verifyWebhook maps a non-doctor user_name to patient', () => {
    const evt = dailyMock.verifyWebhook({
      body: { type: 'participant.joined', room: 'appt_a1', user_name: 'patient', timestamp: 't' },
    });
    expect(evt.role).toBe('patient');
  });

  it('verifyWebhook returns null for an empty/unknown body', () => {
    expect(dailyMock.verifyWebhook({ body: {} })).toBeNull();
  });
});
