import { ArgumentsHost, ConflictException, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@repo/database';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const res = { statusCode: 0, body: undefined as unknown };
  const response = {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      res.body = payload;
    },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => ({ id: 'req-1' }), getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return res as { statusCode: number; body: { error: Record<string, unknown> } };
}

describe('AllExceptionsFilter', () => {
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('keeps domain error codes and the request id', () => {
    const res = run(new ConflictException({ code: 'OUT_OF_STOCK', message: 'Only 2 left' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({
      code: 'OUT_OF_STOCK',
      message: 'Only 2 left',
      requestId: 'req-1',
    });
  });

  it('maps Prisma unique violations to 409 without leaking column names', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      },
    );
    const res = run(error);
    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(res.body)).not.toContain('email');
  });

  it('maps Prisma record-not-found to 404', () => {
    const error = new Prisma.PrismaClientKnownRequestError('No record', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(run(error).statusCode).toBe(404);
  });

  it('hides internal details of unexpected errors', () => {
    const res = run(new Error('connection string postgres://secret@host'));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: 'req-1',
    });
  });

  it('passes through 503 messages so clients can show them', () => {
    const res = run(
      new HttpException({ code: 'SERVICE_UNAVAILABLE', message: 'Try again shortly' }, 503),
    );
    expect(res.body.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Try again shortly',
    });
  });
});
