import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ValidationIssue } from '@repo/shared-types';
import type { z } from 'zod';

/**
 * Validates and transforms input with a shared Zod schema from @repo/validation, so the API and
 * the frontend forms enforce identical rules. Returns the parsed (normalised) value.
 *
 *   @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput
 */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const details: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
      code: issue.code,
    }));
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Some fields are invalid',
      details,
    });
  }
}
