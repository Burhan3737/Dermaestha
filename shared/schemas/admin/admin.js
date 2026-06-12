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
  /** Matches payment providerRef OR refundRef. */
  paymentRef: z.string().trim().max(128).optional(),
  state: z.string().trim().max(40).optional(),
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

/** PUT /api/admin/settings (F14). Full replace of the three tunables, bounded. */
export const settingsUpdateSchema = z.object({
  /** Floor 30 per §4.1 #3; ceiling one day. */
  minBookingLeadMinutes: z.number().int().min(30).max(24 * 60),
  /** Basis points, 0–100%. */
  fallbackFeePctBps: z.number().int().min(0).max(10000),
  /** PKR paisa, non-negative. */
  fallbackFeeFixed: z.number().int().min(0),
});
