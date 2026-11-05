import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminOrderDetail, AdminOrderSummary, Paginated } from '@repo/shared-types';
import {
  adminOrderListQuerySchema,
  cashPaymentSchema,
  orderCancelSchema,
  orderNoteSchema,
  orderTransitionSchema,
  type AdminOrderListQuery,
  type CashPaymentInput,
  type OrderCancelInput,
  type OrderTransitionInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminOrdersService } from './admin-orders.service.js';

@ApiTags('admin-orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: AdminOrdersService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('orders:read')
  list(
    @Query(new ZodValidationPipe(adminOrderListQuerySchema)) query: AdminOrderListQuery,
  ): Promise<Paginated<AdminOrderSummary>> {
    return this.orders.list(query);
  }

  @Get(':orderNumber')
  @AdminAuth('orders:read')
  detail(@Param('orderNumber') orderNumber: string): Promise<AdminOrderDetail> {
    return this.orders.detail(orderNumber);
  }

  @Post(':orderNumber/transitions')
  @HttpCode(HttpStatus.OK)
  @AdminAuth('orders:update')
  async transition(
    @CurrentAuth() auth: AuthContext,
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(orderTransitionSchema)) body: OrderTransitionInput,
    @Req() req: Request,
  ): Promise<AdminOrderDetail> {
    const order = await this.orders.transition(orderNumber, body, auth.userId);
    await this.record(`order.${body.to.toLowerCase()}`, order, auth, req, { to: body.to });
    return order;
  }

  @Post(':orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @AdminAuth('orders:cancel')
  async cancel(
    @CurrentAuth() auth: AuthContext,
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(orderCancelSchema)) body: OrderCancelInput,
    @Req() req: Request,
  ): Promise<AdminOrderDetail> {
    const order = await this.orders.cancel(orderNumber, body, auth.userId);
    await this.record('order.cancelled', order, auth, req, {
      reason: body.reason,
      restock: body.restock,
    });
    return order;
  }

  @Post(':orderNumber/cash-payment')
  @HttpCode(HttpStatus.OK)
  @AdminAuth('orders:update')
  async cash(
    @CurrentAuth() auth: AuthContext,
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(cashPaymentSchema)) body: CashPaymentInput,
    @Req() req: Request,
  ): Promise<AdminOrderDetail> {
    const order = await this.orders.recordCashPayment(orderNumber, body, auth.userId);
    await this.record('order.cash_received', order, auth, req, { reference: body.reference });
    return order;
  }

  @Put(':orderNumber/note')
  @AdminAuth('orders:update')
  async note(
    @CurrentAuth() auth: AuthContext,
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(orderNoteSchema)) body: { internalNote: string },
    @Req() req: Request,
  ): Promise<AdminOrderDetail> {
    const order = await this.orders.setInternalNote(orderNumber, body.internalNote);
    await this.record('order.note_updated', order, auth, req);
    return order;
  }

  private record(
    action: string,
    order: AdminOrderDetail,
    auth: AuthContext,
    req: Request,
    after?: Record<string, string | boolean>,
  ) {
    return this.audit.record({
      action,
      entityType: 'Order',
      entityId: order.id,
      actorId: auth.userId,
      after: { orderNumber: order.orderNumber, ...after },
      request: req,
    });
  }
}
