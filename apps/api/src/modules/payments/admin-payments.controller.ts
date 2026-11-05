import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminPayment, AdminRefund } from '@repo/shared-types';
import {
  refundCompleteSchema,
  refundRequestSchema,
  type RefundCompleteInput,
  type RefundRequestInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { adminPaymentsInclude, toAdminPayment, toAdminRefund } from './admin-payment.view.js';
import { RefundService } from './refund.service.js';

/** Payment records and refunds for staff. */
@ApiTags('admin-payments')
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
    private readonly audit: AuditService,
  ) {}

  @Get('orders/:orderNumber/payments')
  @AdminAuth('orders:read')
  async list(@Param('orderNumber') orderNumber: string): Promise<AdminPayment[]> {
    const order = await this.prisma.client.order.findUnique({
      where: { orderNumber },
      select: { payments: adminPaymentsInclude },
    });
    if (!order)
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return order.payments.map(toAdminPayment);
  }

  @Post('payments/:paymentId/refunds')
  @AdminAuth('orders:refund')
  async request(
    @CurrentAuth() auth: AuthContext,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Body(new ZodValidationPipe(refundRequestSchema)) body: RefundRequestInput,
    @Req() req: Request,
  ): Promise<AdminRefund> {
    const refund = await this.refunds.request({ paymentId, ...body, requestedById: auth.userId });
    await this.audit.record({
      action: 'refund.requested',
      entityType: 'Refund',
      entityId: refund.id,
      actorId: auth.userId,
      after: { paymentId, amountMinor: body.amountMinor, reason: body.reason },
      request: req,
    });
    return toAdminRefund(refund);
  }

  /** Records money already sent back (e.g. an M-Pesa reversal). Must be a different staff member. */
  @Post('refunds/:refundId/complete')
  @AdminAuth('orders:refund')
  async complete(
    @CurrentAuth() auth: AuthContext,
    @Param('refundId', new ParseUUIDPipe()) refundId: string,
    @Body(new ZodValidationPipe(refundCompleteSchema)) body: RefundCompleteInput,
    @Req() req: Request,
  ): Promise<AdminRefund> {
    const refund = await this.refunds.complete(refundId, auth.userId, body.providerReference);
    await this.audit.record({
      action: 'refund.completed',
      entityType: 'Refund',
      entityId: refund.id,
      actorId: auth.userId,
      after: { amountMinor: refund.amountMinor, providerReference: body.providerReference },
      request: req,
    });
    return toAdminRefund(refund);
  }

  @Post('refunds/:refundId/reject')
  @AdminAuth('orders:refund')
  async reject(
    @CurrentAuth() auth: AuthContext,
    @Param('refundId', new ParseUUIDPipe()) refundId: string,
    @Req() req: Request,
  ): Promise<AdminRefund> {
    const refund = await this.refunds.reject(refundId, auth.userId);
    await this.audit.record({
      action: 'refund.rejected',
      entityType: 'Refund',
      entityId: refund.id,
      actorId: auth.userId,
      request: req,
    });
    return toAdminRefund(refund);
  }
}
