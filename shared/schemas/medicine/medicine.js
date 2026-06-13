// @ts-check
import { z } from 'zod';

/** GET /api/medicines?search=&includeInactive=true (includeInactive: admin only). */
export const medicineSearchQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  includeInactive: z.literal('true').optional(),
});

/** POST /api/admin/medicines (F11.02). unitPrice is PKR paisa. */
export const medicineCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: z.string().trim().min(1).max(200).optional(),
  dosageForms: z.array(z.string().trim().min(1).max(60)).min(1),
  unitPrice: z.number().int().positive().max(2_147_483_647),
});

/** PATCH /api/admin/medicines/:id (F11.03). Partial edit + deactivate toggle. */
export const medicineUpdateSchema = medicineCreateSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'At least one field is required' });
