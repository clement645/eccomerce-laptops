import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminCoupon } from '@repo/shared-types';
import { couponInputSchema, type CouponInput } from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { mapWriteError, notFound } from '../admin/admin-errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../auth/guards/auth.decorators.js';

type CouponRow = Awaited<ReturnType<PrismaService['client']['coupon']['findUniqueOrThrow']>>;

function toAdmin(c: CouponRow): AdminCoupon {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    percentBps: c.percentBps,
    amountMinor: c.amountMinor,
    maxDiscountMinor: c.maxDiscountMinor,
    minOrderMinor: c.minOrderMinor,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    maxRedemptions: c.maxRedemptions,
    maxPerCustomer: c.maxPerCustomer,
    redemptionCount: c.redemptionCount,
    firstOrderOnly: c.firstOrderOnly,
    isActive: c.isActive,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Coupons are never deleted once used (orders refer to them); switch them off instead. */
@ApiTags('admin-coupons')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('coupons:write')
  async list(): Promise<AdminCoupon[]> {
    const rows = await this.prisma.client.coupon.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAdmin);
  }

  @Post()
  @AdminAuth('coupons:write')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput,
    @Req() req: Request,
  ): Promise<AdminCoupon> {
    const coupon = await this.prisma.client.coupon
      .create({ data: this.data(body) })
      .catch((e: unknown) => mapWriteError(e, { code: 'code' }));
    await this.record('coupon.created', coupon.id, auth, req, body);
    return toAdmin(coupon);
  }

  @Put(':id')
  @AdminAuth('coupons:write')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(couponInputSchema)) body: CouponInput,
    @Req() req: Request,
  ): Promise<AdminCoupon> {
    const existing = await this.prisma.client.coupon.findUnique({ where: { id } });
    if (!existing) throw notFound('Coupon');
    const coupon = await this.prisma.client.coupon
      .update({ where: { id }, data: this.data(body) })
      .catch((e: unknown) => mapWriteError(e, { code: 'code' }));
    await this.record('coupon.updated', id, auth, req, body);
    return toAdmin(coupon);
  }

  private data(body: CouponInput) {
    return {
      ...body,
      percentBps: body.type === 'PERCENTAGE' ? body.percentBps : null,
      amountMinor: body.type === 'FIXED_AMOUNT' ? body.amountMinor : null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    };
  }

  private record(action: string, id: string, auth: AuthContext, req: Request, body: CouponInput) {
    return this.audit.record({
      action,
      entityType: 'Coupon',
      entityId: id,
      actorId: auth.userId,
      after: {
        code: body.code,
        type: body.type,
        percentBps: body.percentBps,
        amountMinor: body.amountMinor,
        isActive: body.isActive,
      },
      request: req,
    });
  }
}
