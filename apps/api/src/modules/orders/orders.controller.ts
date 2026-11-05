import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { OrderDetail, OrderSummary } from '@repo/shared-types';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { orderDetailInclude, toOrderDetail, toOrderSummary } from './order-view.js';

const notFound = () =>
  new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  /** The signed-in customer's orders, newest first. */
  @Get()
  @Auth()
  async list(@CurrentAuth() auth: AuthContext): Promise<OrderSummary[]> {
    const orders = await this.prisma.client.order.findMany({
      where: { userId: auth.userId },
      orderBy: { placedAt: 'desc' },
      take: 100,
      include: { items: { select: { quantity: true } } },
    });
    return orders.map(toOrderSummary);
  }

  /** Public tracking by the unguessable token from the confirmation email/page (never by order number alone). */
  @Get('track/:token')
  @RateLimit({ name: 'order-track', limit: 30, windowSeconds: 60 })
  async track(@Param('token') token: string): Promise<OrderDetail> {
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound();
    const order = await this.prisma.client.order.findUnique({
      where: { trackingToken: token },
      include: orderDetailInclude,
    });
    if (!order) throw notFound();
    return toOrderDetail(order, this.media);
  }

  @Get(':orderNumber')
  @Auth()
  async detail(
    @CurrentAuth() auth: AuthContext,
    @Param('orderNumber') orderNumber: string,
  ): Promise<OrderDetail> {
    const order = await this.prisma.client.order.findFirst({
      where: { orderNumber, userId: auth.userId },
      include: orderDetailInclude,
    });
    if (!order) throw notFound();
    return toOrderDetail(order, this.media);
  }
}
