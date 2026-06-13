// @ts-check
import { z } from 'zod';

/** POST /api/analytics/events body (doc 14 §6). networkType is a sibling of meta, never nested. */
export const analyticsEventSchema = z.object({
  type: z.enum([
    'landing_view',
    'booking_started',
    'booking_confirmed',
    'video_join_attempt',
    'video_join_success',
  ]),
  networkType: z.string().trim().min(1).max(40).optional(),
  meta: z.record(z.unknown()).optional(),
});

/** The closed catalog, derived from the schema (single source). */
export const ANALYTICS_EVENT_TYPES = analyticsEventSchema.shape.type.options;
