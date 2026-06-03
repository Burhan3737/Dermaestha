import { describe, it, expect } from 'vitest';
import { karachiWallTimeToUtc, karachiWeekday, KARACHI } from './tz.js';

describe('tz helper', () => {
  it('exposes the Asia/Karachi zone id', () => {
    expect(KARACHI).toBe('Asia/Karachi');
  });
  it('converts a Karachi wall time to the correct UTC instant (PKT = UTC+5)', () => {
    // 18:00 Karachi on 2026-06-15 == 13:00 UTC.
    const utc = karachiWallTimeToUtc('2026-06-15', '18:00');
    expect(utc.toISOString()).toBe('2026-06-15T13:00:00.000Z');
  });
  it('computes the weekday (0=Sun..6=Sat) for a Karachi date', () => {
    expect(karachiWeekday('2026-06-15')).toBe(1); // Monday
    expect(karachiWeekday('2026-06-14')).toBe(0); // Sunday
  });
});
