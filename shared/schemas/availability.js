// @ts-check
import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const availabilityBlockSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm })
  .refine((b) => b.startTime < b.endTime, { message: 'startTime must be before endTime', path: ['endTime'] });

/** PUT /api/availability body: replace the doctor's whole weekly block set. */
export const availabilityReplaceSchema = z.object({ blocks: z.array(availabilityBlockSchema).max(50) });

export const doctorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});
