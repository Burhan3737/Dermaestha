import { describe, it, expect } from 'vitest';
import {
  analyticsEventSchema,
  ANALYTICS_EVENT_TYPES,
} from '#shared/schemas/analytics/analytics.js';

describe('analyticsEventSchema', () => {
  it('exposes the closed doc 14 §6 catalog', () => {
    expect(ANALYTICS_EVENT_TYPES).toEqual([
      'landing_view',
      'booking_started',
      'booking_confirmed',
      'video_join_attempt',
      'video_join_success',
    ]);
  });

  it('accepts a catalog event with networkType + meta', () => {
    const r = analyticsEventSchema.safeParse({
      type: 'landing_view',
      networkType: '3g',
      meta: { referrer: 'x' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts type-only (networkType + meta optional)', () => {
    expect(analyticsEventSchema.safeParse({ type: 'booking_started' }).success).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(analyticsEventSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
