import { BadRequestException } from '@nestjs/common';
import { registerSchema } from '@repo/validation';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(registerSchema);

  it('returns the parsed, normalised value', () => {
    const result = pipe.transform({
      email: '  Jane@Example.com ',
      password: 'a long enough passphrase',
      firstName: 'Jane',
      lastName: 'Wanjiku',
    });
    expect(result.email).toBe('jane@example.com');
    expect(result.marketingOptIn).toBe(false);
  });

  it('throws VALIDATION_FAILED with field-level details', () => {
    try {
      pipe.transform({ email: 'nope', password: 'short', firstName: '', lastName: 'X' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        code: string;
        details: { path: string }[];
      };
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.details.map((d) => d.path).sort()).toEqual(['email', 'firstName', 'password']);
    }
  });
});
