import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminCustomerDetail, AdminCustomerSummary, Paginated } from '@repo/shared-types';
import {
  customerListQuerySchema,
  customerStatusSchema,
  type CustomerListQuery,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminCustomersService } from './admin-customers.service.js';

@ApiTags('admin-customers')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(
    private readonly customers: AdminCustomersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('customers:read')
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery,
  ): Promise<Paginated<AdminCustomerSummary>> {
    return this.customers.list(query);
  }

  @Get(':id')
  @AdminAuth('customers:read')
  detail(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminCustomerDetail> {
    return this.customers.detail(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @AdminAuth('customers:manage')
  async status(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(customerStatusSchema))
    body: { status: 'ACTIVE' | 'SUSPENDED'; reason: string },
    @Req() req: Request,
  ): Promise<AdminCustomerDetail> {
    const customer = await this.customers.setStatus(id, body.status);
    await this.audit.record({
      action: body.status === 'SUSPENDED' ? 'customer.suspended' : 'customer.reactivated',
      entityType: 'User',
      entityId: id,
      actorId: auth.userId,
      after: { reason: body.reason },
      request: req,
    });
    return customer;
  }
}
