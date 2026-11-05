import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { DashboardRange, DashboardSummary } from '@repo/shared-types';
import { dashboardQuerySchema } from '@repo/validation';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AdminAuth } from '../../auth/guards/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('admin-dashboard')
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @AdminAuth('dashboard:read')
  summary(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: { range: DashboardRange },
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(query.range);
  }
}
