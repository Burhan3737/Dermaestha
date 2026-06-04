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
  });
});
