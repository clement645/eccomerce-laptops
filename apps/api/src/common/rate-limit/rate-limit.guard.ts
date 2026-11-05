import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiEnv } from '@repo/configuration';
import type { Request, Response } from 'express';
import { API_ENV } from '../../config/env.js';
import {
  RATE_LIMIT_METADATA,
  SKIP_RATE_LIMIT_METADATA,
  type RateLimitRule,
} from './rate-limit.decorator.js';
import { RateLimitService, type RateLimitResult } from './rate-limit.service.js';

/**
 * Global guard: every route gets the per-IP baseline, plus any stricter @RateLimit rules.
 * Responds with IETF RateLimit-* headers and 429 + Retry-After when a budget is exhausted.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly baseline: RateLimitRule;

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.baseline = { name: 'global', limit: env.RATE_LIMIT_PER_MINUTE, windowSeconds: 60 };
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_METADATA, targets)) return true;

    const rules = [
      this.baseline,
      ...(this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_METADATA, targets) ?? []),
    ];
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const identifier = request.ip ?? 'unknown';

    let tightest: RateLimitResult | undefined;
    for (const rule of rules) {
      let result: RateLimitResult;
      try {
        result = await this.rateLimits.consume(
          rule.name,
          identifier,
          rule.limit,
          rule.windowSeconds,
        );
      } catch (error) {
        if (rule.failClosed) {
          this.logger.error(`Rate limit store unavailable; rejecting "${rule.name}" request`);
          throw new HttpException(
            {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Service temporarily unavailable. Please try again shortly.',
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        this.logger.warn(`Rate limit "${rule.name}" skipped: ${(error as Error).message}`);
        continue;
      }

      if (!result.allowed) {
        this.setHeaders(response, result);
        response.setHeader('Retry-After', String(result.resetSeconds));
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (!tightest || result.remaining < tightest.remaining) tightest = result;
    }

    if (tightest) this.setHeaders(response, tightest);
    return true;
  }

  private setHeaders(response: Response, result: RateLimitResult): void {
    response.setHeader('RateLimit-Limit', String(result.limit));
    response.setHeader('RateLimit-Remaining', String(result.remaining));
    response.setHeader('RateLimit-Reset', String(result.resetSeconds));
  }
}
