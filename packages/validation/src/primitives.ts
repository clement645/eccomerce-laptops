import { z } from 'zod';

/** Lower-cased, trimmed email. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Kenyan mobile number (Safaricom/Airtel/Telkom), accepted as 07XXXXXXXX, 01XXXXXXXX,
 * +2547XXXXXXXX, 2547XXXXXXXX (spaces/dashes allowed). Normalised to 2547XXXXXXXX / 2541XXXXXXXX,
 * which is the format Daraja expects.
 */
export const kenyanPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .refine((value) => /^(?:\+?254|0)[17]\d{8}$/.test(value), {
    message: 'Enter a valid Kenyan mobile number, e.g. 0712 345 678',
  })
  .transform((value) => `254${value.replace(/^(?:\+?254|0)/, '')}`);

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

/** Non-negative integer amount in KES minor units (cents). */
export const moneyMinorSchema = z.number().int().nonnegative().max(2_000_000_000);

export const uuidSchema = z.uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
