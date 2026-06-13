// @ts-check
import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

export const availabilityBlockSchema = z
  .object({ weekday: z.number().int().min(0).max(6), startTime: hhmm, endTime: hhmm })
  .refine((b) => b.startTime < b.endTime, {
    message: 'startTime must be before endTime',
    path: ['endTime'],
  });

/** PUT /api/availability body: replace the doctor's whole weekly block set. */
export const availabilityReplaceSchema = z.object({
  blocks: z.array(availabilityBlockSchema).max(50),
});

/** POST /api/doctors (F10.01, admin). Photo arrives via a separate multipart route. */
export const doctorCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(20),
  pmcNumber: z.string().trim().min(1).max(40),
  specialization: z.string().trim().min(1).max(120),
  /** PKR paisa. */
  fee: z.number().int().positive().max(2_147_483_647),
  bio: z.string().trim().min(1).max(2000),
  /** DA1: admin-set initial password, shared out-of-band. */
  initialPassword: z.string().min(8).max(200),
  /** F10.01 optional weekly availability template. */
  blocks: z.array(availabilityBlockSchema).max(50).optional(),
});

/** PATCH /api/doctors/:id (F10.02). pmcNumber/email are NOT here — immutable (#8);
 *  their presence in a request body is rejected with 409 IMMUTABLE_FIELD before validation. */
export const doctorUpdateSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    specialization: z.string().trim().min(1).max(120).optional(),
    fee: z.number().int().positive().max(2_147_483_647).optional(),
    bio: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });

/** POST /api/doctors/:id/reset-password (DA5). */
export const adminPasswordResetSchema = z.object({
  newPassword: z.string().min(8).max(200),
});

export const doctorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
  /** Admin-only (A-01): include pending + deactivated doctors. */
  includeInactive: z.literal('true').optional(),
});

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
});
