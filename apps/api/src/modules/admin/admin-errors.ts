import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@repo/database';

export const notFound = (what: string) =>
  new NotFoundException({ code: 'NOT_FOUND', message: `${what} not found` });

/** Turns unique and foreign-key violations into clear 409/422 responses. */
export function mapWriteError(error: unknown, labels: Record<string, string> = {}): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = JSON.stringify(error.meta ?? {});
      const field = Object.keys(labels).find((f) => target.includes(f));
      throw new ConflictException({
        code: 'ALREADY_EXISTS',
        message: field ? `That ${labels[field]} is already in use` : 'That value is already in use',
        details: field
          ? [{ path: field, message: `That ${labels[field]} is already in use` }]
          : undefined,
      });
    }
    if (error.code === 'P2003')
      throw new UnprocessableEntityException({
        code: 'INVALID_REFERENCE',
        message: 'A linked record does not exist',
      });
    if (error.code === 'P2025') throw notFound('Record');
  }
  throw error;
}
