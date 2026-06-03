import { describe, it, expect } from 'vitest';
import { lockSchema, cancelSchema } from './booking.js';

describe('booking schemas', () => {
  it('lockSchema accepts a self booking', () => {
    const r = lockSchema.safeParse({ doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: true });
    expect(r.success).toBe(true);
  });
  it('lockSchema requires subject fields when forSelf is false', () => {
    const bad = lockSchema.safeParse({ doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: false });
    expect(bad.success).toBe(false);
    const ok = lockSchema.safeParse({
      doctorId: 'd1', slotStart: '2026-06-15T13:00:00.000Z', forSelf: false,
      subject: { name: 'Child', age: 7, relation: 'Son' },
    });
    expect(ok.success).toBe(true);
  });
  it('cancelSchema allows an optional reason', () => {
    expect(cancelSchema.safeParse({}).success).toBe(true);
    expect(cancelSchema.safeParse({ reason: 'unavailable' }).success).toBe(true);
  });
});
