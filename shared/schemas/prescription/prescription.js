// @ts-check
import { z } from 'zod';

/** One builder row (F08.02): catalogue pick (medicineId) XOR free-text (medicineName). */
const itemSchema = z
  .object({
    medicineId: z.string().min(1).optional(),
    medicineName: z.string().trim().min(1).max(200).optional(),
    dosage: z.string().trim().min(1).max(200),
    duration: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(500),
  })
  .refine((i) => !!i.medicineId !== !!i.medicineName, {
    message: 'Provide exactly one of medicineId or medicineName',
  });

/** POST /api/appointments/:id/prescriptions */
export const prescriptionCreateSchema = z.object({
  items: z.array(itemSchema).min(1),
  notes: z.string().trim().max(2000).optional(),
  followUpDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpDate must be YYYY-MM-DD')
    .optional(),
});
