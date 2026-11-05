import { z } from 'zod';
import { KENYA_COUNTIES } from '@repo/shared-types';
import { kenyanPhoneSchema } from './primitives.js';

export const addressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  recipientName: z.string().trim().min(2).max(120),
  phone: kenyanPhoneSchema,
  county: z.enum(KENYA_COUNTIES, { message: 'Select a county' }),
  town: z.string().trim().min(2).max(80),
  street: z.string().trim().min(2).max(160),
  building: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(160).optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;
