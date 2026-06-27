// @ts-check
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

/** GET /api/admin/records (F13.01 filter superset). */
export const recordsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  /** Matches patient email OR phone (one box in the UI). */
  patient: z.string().trim().max(200).optional(),
  doctorName: z.string().trim().max(200).optional(),
  appointmentId: z.string().trim().max(64).optional(),
  /** Matches the patient-entered bank transaction reference. */
  paymentRef: z.string().trim().max(128).optional(),
  state: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** GET /api/admin/audit (doc 05: appointmentId,userId,email,eventType,actorType,from,to). */
export const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  appointmentId: z.string().trim().max(64).optional(),
  userId: z.string().trim().max(64).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  eventType: z.string().trim().max(80).optional(),
  actorType: z.enum(['patient', 'doctor', 'admin', 'system']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/** PUT /api/admin/settings (F14). Full replace of the lead-time + manual-payment bank details. */
export const settingsUpdateSchema = z.object({
  /** Floor 30 per §4.1 #3; ceiling one day. */
  minBookingLeadMinutes: z.number().int().min(30).max(24 * 60),
  /** Manual-payment bank instructions (shown to the patient). Nullable to clear. */
  bankName: z.string().trim().max(120).nullish(),
  bankAccountName: z.string().trim().max(120).nullish(),
  bankAccountNumber: z.string().trim().max(60).nullish(),
  bankInstructions: z.string().trim().max(2000).nullish(),
});
