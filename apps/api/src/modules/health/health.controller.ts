import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@repo/shared-types';
import type { Response } from 'express';
import { SkipRateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { HealthService } from './health.service.js';

@ApiTags('health')
@SkipRateLimit()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Readiness: checks the database and Redis. Returns 503 when the database is unreachable. */
  @Get()
  @ApiOkResponse({ description: 'Ready (status ok or degraded)' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    res.setHeader('Cache-Control', 'no-store');
    if (result.status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }

  /** Liveness: the process is running. Use for container restarts; it never checks dependencies. */
  @Get('live')
  @ApiOkResponse({ description: 'Process is alive' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
