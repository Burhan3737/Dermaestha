import { describe, it, expect } from 'vitest';
import { formatPkr, formatKarachi, formatKarachiTable } from '#src/lib/format/format.js';

describe('format', () => {
  it('formats integer paisa as PKR rupees with separators', () => {
    expect(formatPkr(250000)).toBe('Rs 2,500');
    expect(formatPkr(0)).toBe('Rs 0');
  });
  it('formats a UTC ISO instant in Asia/Karachi', () => {
    // 13:00 UTC → 18:00 Karachi.
    const s = formatKarachi('2026-06-15T13:00:00.000Z');
    expect(s).toMatch(/6:00|18:00/); // depends on hour cycle; both acceptable
  });
  it('formats UTC ISO as dense table cell in Asia/Karachi', () => {
    // 13:00 UTC → 18:00 Karachi.
    const s = formatKarachiTable('2099-01-02T13:00:00Z');
    expect(s).toMatch(/02-Jan-2099/);
    expect(s).toMatch(/6:00 pm|18:00/); // depends on 12/24-hour cycle
  });
  it('formatKarachiTable returns empty string for null', () => {
    expect(formatKarachiTable(null)).toBe('');
  });
});
