import { z } from 'zod';
import { emailSchema, kenyanPhoneSchema } from './primitives.js';

/**
 * Password policy follows NIST SP 800-63B / OWASP: length over composition rules.
 * Upper bound guards Argon2 against very large inputs.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  marketingOptIn: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // No policy check on login: never reveal policy details for existing accounts.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

/** Opaque single-use tokens from email links (base64url, 43 characters for 32 bytes). */
const emailTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{20,200}$/, 'This link is invalid');

export const verifyEmailSchema = z.object({ token: emailTokenSchema });

export const emailOnlySchema = z.object({ email: emailSchema });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

export const resetPasswordSchema = z.object({ token: emailTokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password different from your current one',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  phone: z
    .union([kenyanPhoneSchema, z.literal('').transform(() => null), z.null()])
    .optional()
    .transform((v) => v ?? null),
  marketingOptIn: z.boolean(),
});
export type ProfileUpdateInput = z.input<typeof profileUpdateSchema>;

export const mfaChallengeSchema = z.object({ challengeToken: z.string().min(20).max(2000) });
export const mfaVerifySchema = mfaChallengeSchema.extend({ code: totpCodeSchema });
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
