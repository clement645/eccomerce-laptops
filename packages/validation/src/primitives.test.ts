import { describe, expect, it } from 'vitest';
import { emailSchema, kenyanPhoneSchema, slugSchema } from './primitives.js';
import { passwordSchema } from './auth.js';

describe('kenyanPhoneSchema', () => {
  it.each([
    ['0712345678', '254712345678'],
    ['0712 345 678', '254712345678'],
    ['+254712345678', '254712345678'],
    ['254712345678', '254712345678'],
    ['0110-123-456', '254110123456'],
  ])('normalises %s', (input, expected) => {
    expect(kenyanPhoneSchema.parse(input)).toBe(expected);
  });

  it.each(['0812345678', '12345', '+255712345678', '07123456789', ''])('rejects %s', (input) => {
    expect(kenyanPhoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('emailSchema', () => {
  it('trims and lower-cases', () => {
    expect(emailSchema.parse('  Jane@Example.COM ')).toBe('jane@example.com');
  });
  it('rejects invalid emails', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('slugSchema', () => {
  it('accepts kebab-case and rejects others', () => {
    expect(slugSchema.safeParse('gaming-laptops').success).toBe(true);
    expect(slugSchema.safeParse('Gaming Laptops').success).toBe(false);
    expect(slugSchema.safeParse('double--hyphen').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('enforces length bounds', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('a sufficiently long passphrase').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('auth schemas', async () => {
  const { changePasswordSchema, profileUpdateSchema, resetPasswordSchema } =
    await import('./auth.js');

  it('rejects reusing the current password', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'same passphrase 1',
        newPassword: 'same passphrase 1',
      }).success,
    ).toBe(false);
  });

  it('normalises an optional phone and accepts an empty one', () => {
    expect(
      profileUpdateSchema.parse({
        firstName: 'A',
        lastName: 'B',
        phone: '0712 345 678',
        marketingOptIn: false,
      }).phone,
    ).toBe('254712345678');
    expect(
      profileUpdateSchema.parse({ firstName: 'A', lastName: 'B', phone: '', marketingOptIn: true })
        .phone,
    ).toBeNull();
  });

  it('rejects malformed reset tokens', () => {
    expect(
      resetPasswordSchema.safeParse({ token: '<script>', password: 'a long enough passphrase' })
        .success,
    ).toBe(false);
  });
});
