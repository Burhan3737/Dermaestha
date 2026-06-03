// @ts-check
import { z } from 'zod';

const subjectSchema = z.object({
  name: z.string().min(1).max(120),
  age: z.number().int().positive().max(120),
  relation: z.string().min(1).max(60),
});

/** POST /api/appointments/lock */
export const lockSchema = z
  .object({
    doctorId: z.string().min(1),
    slotStart: z.string().datetime(),
    forSelf: z.boolean(),
    subject: subjectSchema.optional(),
  })
  .refine((b) => b.forSelf || !!b.subject, {
    message: 'subject is required when forSelf is false',
    path: ['subject'],
  });

/** POST /api/appointments/:id/cancel */
export const cancelSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
