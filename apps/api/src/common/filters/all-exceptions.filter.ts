import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@repo/database';
import type { ApiErrorBody } from '@repo/shared-types';
import type { Request, Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Known Prisma errors that are the client's fault or a safe-to-retry conflict.
 * Messages are generic on purpose: Prisma metadata can reveal table and column names.
 * Services should still check expected cases themselves and throw specific domain errors.
 */
const PRISMA_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: 'CONFLICT', message: 'A record with these details already exists' },
  P2003: { status: 409, code: 'CONFLICT', message: 'This change conflicts with related records' },
  P2025: { status: 404, code: 'NOT_FOUND', message: 'The requested record was not found' },
  P2034: {
    status: 409,
    code: 'CONFLICT',
    message: 'The request conflicted with another change. Please retry.',
  },
  // Overloaded: no pooled connection or transaction slot in time. Safe for the client to retry.
  P2024: {
    status: 503,
    code: 'SERVICE_BUSY',
    message: 'We are busy right now. Please try again in a moment.',
  },
  P2028: {
    status: 503,
    code: 'SERVICE_BUSY',
    message: 'We are busy right now. Please try again in a moment.',
  },
};

/** Domain exceptions can pass a stable machine-readable code via `{ code, message, details }`. */
interface ExceptionPayload {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

/**
 * Converts every error into the standard envelope `{ error: { code, message, details?, requestId } }`.
 * Unexpected errors are logged with their stack and returned as a generic 500, so internals never leak.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { id?: string }>();
    const response = ctx.getResponse<Response>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiErrorBody['error'] = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };

    const prismaError =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? PRISMA_ERRORS[exception.code]
        : undefined;

    if (prismaError) {
      status = prismaError.status;
      body = { code: prismaError.code, message: prismaError.message };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const raw = exception.getResponse();
      const payload: ExceptionPayload =
        typeof raw === 'string' ? { message: raw } : (raw as ExceptionPayload);
      const message = Array.isArray(payload.message) ? payload.message.join('; ') : payload.message;
      body = {
        code:
          payload.code ?? STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR'),
        message:
          status >= 500 && status !== 503
            ? 'An unexpected error occurred'
            : (message ?? exception.message),
        ...(payload.details !== undefined && status < 500 ? { details: payload.details } : {}),
      };
    }

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId },
        exception instanceof Error ? exception.message : 'Non-error thrown',
      );
    }

    response.status(status).json({ error: { ...body, requestId } } satisfies ApiErrorBody);
  }
}
