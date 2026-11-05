import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Prisma } from '@repo/database';
import type {
  CheckoutQuote,
  OrderDetail,
  PaymentMethodOption,
  PlaceOrderResponse,
  ShippingOption,
} from '@repo/shared-types';
import type { CheckoutQuoteInput, PlaceOrderInput, RetryMpesaInput } from '@repo/validation';
import { API_ENV } from '../../config/env.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails } from '../../infrastructure/mail/templates.js';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { randomToken } from '../auth/crypto/tokens.js';
import { CartService, type CartOwner, type ResolvedCart } from '../cart/cart.service.js';
import { OrderPaymentService } from '../orders/order-payment.service.js';
import {
  ATTEMPT_WINDOW_MS,
  maskPhone,
  MpesaPaymentService,
} from '../payments/mpesa-payment.service.js';
import { orderDetailInclude, toOrderDetail } from '../orders/order-view.js';
import { ShippingService } from '../orders/shipping.service.js';
import { StockChangeNotifier } from '../orders/stock-change.notifier.js';
import { SettingsService, type CheckoutSettings } from '../settings/settings.service.js';
import { allocateDiscount } from '../coupons/coupon-math.js';
import { CouponService } from '../coupons/coupon.service.js';
import { priceOrder } from './pricing.js';

const TX = { maxWait: 10_000, timeout: 30_000 } as const;

@Injectable()
export class CheckoutService {
  private readonly storefrontUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
    private readonly payments: OrderPaymentService,
    private readonly mpesa: MpesaPaymentService,
    private readonly coupons: CouponService,
    private readonly stock: StockChangeNotifier,
    private readonly mail: MailService,
    private readonly media: MediaUrlService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.storefrontUrl = env.STOREFRONT_URL.replace(/\/$/, '');
  }

  /** Totals for review. Nothing is reserved. */
  async quote(
    owner: CartOwner,
    input: CheckoutQuoteInput,
  ): Promise<CheckoutQuote & { resolved: ResolvedCart }> {
    const resolved = await this.carts.resolve(owner, false);
    const cart = await this.carts.view(resolved.cartId);
    const config = await this.settings.getCheckoutSettings();
    const options = await this.shipping.optionsFor(input.county, input.town, cart.subtotalMinor);
    const selected = options.find((o) => o.code === input.shippingMethodCode) ?? null;
    const goods = cart.lines.filter((l) => l.issue === null);
    const goodsSubtotal = goods.reduce((sum, l) => sum + l.unitPriceMinor * l.quantity, 0);

    // Coupons: checked now for display; checked again (with the coupon locked) when ordering.
    let coupon: CheckoutQuote['coupon'] = null;
    let couponError: string | null = null;
    let discounts: number[] = goods.map(() => 0);
    if (input.couponCode && goods.length) {
      const check = await this.coupons.check(input.couponCode, {
        subtotalMinor: goodsSubtotal,
        userId: owner.userId,
        email: null,
      });
      if (check.ok) {
        coupon = {
          code: check.coupon.code,
          description: check.coupon.description,
          discountMinor: check.discountMinor,
        };
        discounts = allocateDiscount(
          goods.map((l) => l.unitPriceMinor * l.quantity),
          check.discountMinor,
        );
      } else couponError = check.reason;
    }
    const totals =
      selected && goods.length
        ? priceOrder(
            goods.map((l, i) => ({
              unitPriceMinor: l.unitPriceMinor,
              quantity: l.quantity,
              discountMinor: discounts[i],
            })),
            { priceMinor: selected.basePriceMinor, freeAboveMinor: selected.freeAboveMinor },
            config.vatRateBps,
          ).totals
        : null;
    return {
      resolved,
      cart,
      shippingOptions: options,
      selectedShipping: selected,
      paymentMethods: this.paymentMethods(
        config,
        input.county,
        selected,
        totals?.totalMinor ?? cart.subtotalMinor,
      ),
      totals,
      coupon,
      couponError,
    };
  }

  private paymentMethods(
    config: CheckoutSettings,
    county: string,
    shipping: ShippingOption | null,
    totalMinor: number,
  ): PaymentMethodOption[] {
    const cod = config.cashOnDelivery;
    let codReason: string | null = null;
    if (!cod.enabled) codReason = 'Cash on delivery is not offered at the moment.';
    else if (
      cod.counties.length &&
      !cod.counties.some((c) => c.toLowerCase() === county.toLowerCase())
    )
      codReason = `Cash on delivery isn't available in ${county}.`;
    else if (cod.maxOrderMinor > 0 && totalMinor > cod.maxOrderMinor)
      codReason = 'This order is above the cash on delivery limit.';
    else if (shipping && !shipping.codAllowed)
      codReason = `Cash on delivery isn't available with ${shipping.name}.`;
    return [
      {
        method: 'MPESA',
        available: this.mpesa.available,
        reason: this.mpesa.available
          ? null
          : 'M-Pesa payments are being set up. Please check back soon.',
        simulated: this.mpesa.simulated,
      },
      {
        method: 'CASH_ON_DELIVERY',
        available: codReason === null,
        reason: codReason,
        simulated: false,
      },
    ];
  }

  async placeOrder(
    owner: CartOwner,
    input: PlaceOrderInput,
    idempotencyKey: string,
  ): Promise<PlaceOrderResponse & { resolved: ResolvedCart }> {
    // Replaying the same request returns the original order instead of creating a second one.
    const existing = await this.prisma.client.order.findUnique({
      where: { idempotencyKey },
      include: orderDetailInclude,
    });
    if (existing) {
      const sameCustomer = owner.userId
        ? existing.userId === owner.userId
        : existing.userId === null && existing.email === input.contact.email;
      if (!sameCustomer)
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Please refresh the page and try again',
        });
      return {
        resolved: { cartId: null },
        order: toOrderDetail(existing, this.media),
        next: this.nextStep(existing.paymentProvider, existing.paymentStatus),
      };
    }

    const resolved = await this.carts.resolve(owner, false);
    if (!resolved.cartId)
      throw new UnprocessableEntityException({ code: 'CART_EMPTY', message: 'Your cart is empty' });

    const address = await this.deliveryAddress(owner, input);
    const config = await this.settings.getCheckoutSettings();
    // Everything that needs no lock is read before the transaction. Inside it, only the transaction
    // client is used: borrowing a second pooled connection there can exhaust the pool under load.
    const method = (await this.shipping.optionsFor(address.county, address.town, 0)).find(
      (o) => o.code === input.shippingMethodCode,
    );
    if (!method)
      throw new BadRequestException({
        code: 'SHIPPING_UNAVAILABLE',
        message: 'That delivery option is not available for this address',
      });

    const placed = await this.prisma.client
      .$transaction(async (tx) => {
        // 1. Re-read the cart inside the transaction.
        const items = await tx.cartItem.findMany({
          where: { cartId: resolved.cartId! },
          include: {
            variant: {
              include: {
                inventory: true,
                product: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                    status: true,
                    publishedAt: true,
                    images: {
                      orderBy: { sortOrder: 'asc' },
                      take: 1,
                      select: { storageKey: true },
                    },
                  },
                },
              },
            },
          },
          orderBy: { variantId: 'asc' },
        });
        if (items.length === 0)
          throw new UnprocessableEntityException({
            code: 'CART_EMPTY',
            message: 'Your cart is empty',
          });
        const unavailable = items.filter(
          (i) =>
            !i.variant.isActive ||
            i.variant.product.status !== 'PUBLISHED' ||
            !i.variant.product.publishedAt,
        );
        if (unavailable.length) {
          throw new UnprocessableEntityException({
            code: 'CART_CHANGED',
            message: 'Some items are no longer available. Please review your cart.',
            details: unavailable.map((i) => ({ variantId: i.variantId, problem: 'UNAVAILABLE' })),
          });
        }

        // 2. Coupon (locked, so usage limits hold under concurrent orders), then price on the server
        //    and refuse if the total differs from what the customer reviewed.
        let applied: { couponId: string; code: string; discountMinor: number } | null = null;
        let discounts = items.map(() => 0);
        if (input.couponCode) {
          const check = await this.coupons.checkForUpdate(
            input.couponCode,
            {
              subtotalMinor: items.reduce((sum, i) => sum + i.variant.priceMinor * i.quantity, 0),
              userId: owner.userId,
              email: input.contact.email,
            },
            tx,
          );
          if (!check.ok)
            throw new UnprocessableEntityException({
              code: 'COUPON_INVALID',
              message: check.reason,
            });
          applied = {
            couponId: check.coupon.id,
            code: check.coupon.code,
            discountMinor: check.discountMinor,
          };
          discounts = allocateDiscount(
            items.map((i) => i.variant.priceMinor * i.quantity),
            check.discountMinor,
          );
        }
        const priced = priceOrder(
          items.map((i, index) => ({
            unitPriceMinor: i.variant.priceMinor,
            quantity: i.quantity,
            discountMinor: discounts[index],
          })),
          { priceMinor: method.basePriceMinor, freeAboveMinor: method.freeAboveMinor },
          config.vatRateBps,
        );
        if (priced.totals.totalMinor !== input.expectedTotalMinor) {
          throw new ConflictException({
            code: 'PRICE_CHANGED',
            message: 'Prices or delivery charges changed. Please review the new total.',
            details: priced.totals,
          });
        }

        // 3. Payment method rules.
        const methods = this.paymentMethods(
          config,
          address.county,
          method,
          priced.totals.totalMinor,
        );
        const chosen = methods.find((m) => m.method === input.paymentMethod)!;
        if (!chosen.available)
          throw new UnprocessableEntityException({
            code: 'PAYMENT_METHOD_UNAVAILABLE',
            message: chosen.reason ?? 'Payment method unavailable',
          });
        const cod = input.paymentMethod === 'CASH_ON_DELIVERY';

        // 4. Create the order with a snapshot of every line (reservations are written with it).
        const [sequence] = await tx.$queryRaw<{ nextval: bigint }[]>(
          Prisma.sql`SELECT nextval('order_number_seq')`,
        );
        if (!sequence) throw new Error('order_number_seq returned no value');
        const orderNumber = `EL-${new Date().getFullYear()}-${String(sequence.nextval).padStart(6, '0')}`;
        const holdUntil = new Date(Date.now() + config.holdMinutes * 60_000);
        const order = await tx.order.create({
          data: {
            orderNumber,
            trackingToken: randomToken(),
            idempotencyKey,
            userId: owner.userId,
            email: input.contact.email,
            phone: input.contact.phone,
            customerName: `${input.contact.firstName} ${input.contact.lastName}`,
            shippingAddress: address,
            shippingMethodId: (
              await tx.shippingMethod.findUniqueOrThrow({
                where: { code: method.code },
                select: { id: true },
              })
            ).id,
            shippingMethodName: method.name,
            ...priced.totals,
            paymentProvider: input.paymentMethod,
            paymentStatus: cod ? 'UNPAID' : 'PENDING',
            customerNote: input.customerNote || null,
            couponId: applied?.couponId ?? null,
            couponCode: applied?.code ?? null,
            items: {
              create: items.map((item, index) => ({
                productId: item.variant.product.id,
                variantId: item.variantId,
                productName: item.variant.product.name,
                variantName: item.variant.name,
                sku: item.variant.sku,
                imageKey: item.variant.product.images[0]?.storageKey ?? null,
                unitPriceMinor: item.variant.priceMinor,
                compareAtPriceMinor: item.variant.compareAtPriceMinor,
                quantity: item.quantity,
                discountMinor: priced.lines[index]!.discountMinor,
                taxRateBps: config.vatRateBps,
                taxMinor: priced.lines[index]!.taxMinor,
                lineTotalMinor: priced.lines[index]!.lineTotalMinor,
              })),
            },
            reservations: {
              create: items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                expiresAt: holdUntil,
              })),
            },
            statusHistory: {
              create: [
                { field: 'FULFILLMENT', toStatus: 'PENDING', note: 'Order placed' },
                {
                  field: 'PAYMENT',
                  toStatus: cod ? 'UNPAID' : 'PENDING',
                  note: cod ? 'Pay with cash on delivery' : 'Awaiting M-Pesa payment',
                },
              ],
            },
          },
        });
        // 5. Reserve stock last, so inventory rows stay locked only until commit (a few statements).
        //    One conditional update per variant, in a fixed order: no deadlocks, no overselling.
        const shortages: { variantId: string; available: number }[] = [];
        const afterReserve = new Map<string, { onHand: number; reserved: number }>();
        for (const item of items) {
          const rows = await tx.$queryRaw<{ onHand: number; reserved: number }[]>(Prisma.sql`
            UPDATE inventory SET reserved = reserved + ${item.quantity}
            WHERE "variantId" = ${item.variantId}::uuid AND "onHand" - reserved >= ${item.quantity}
            RETURNING "onHand", reserved`);
          if (rows[0]) afterReserve.set(item.variantId, rows[0]);
          else
            shortages.push({
              variantId: item.variantId,
              available: Math.max(
                0,
                (item.variant.inventory?.onHand ?? 0) - (item.variant.inventory?.reserved ?? 0),
              ),
            });
        }
        if (shortages.length) {
          throw new ConflictException({
            code: 'OUT_OF_STOCK',
            message: 'Some items just sold out or have fewer units left. Please review your cart.',
            details: shortages,
          });
        }

        for (const item of items) {
          const after = afterReserve.get(item.variantId)!;
          await tx.inventoryMovement.create({
            data: {
              variantId: item.variantId,
              delta: item.quantity,
              reason: 'RESERVATION',
              onHandAfter: after.onHand,
              reservedAfter: after.reserved,
              orderId: order.id,
            },
          });
        }
        if (applied)
          await this.coupons.redeem(
            tx,
            applied.couponId,
            { id: order.id, userId: owner.userId, email: input.contact.email },
            applied.discountMinor,
          );
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: input.paymentMethod,
            amountMinor: priced.totals.totalMinor,
          },
        });
        let attemptId: string | null = null;
        if (cod) {
          // Stock is committed immediately; the customer pays the courier.
          await this.payments.consumeReservations(tx, order.id);
        } else {
          // The STK Push itself is sent after commit: never hold row locks across a network call.
          const attempt = await tx.paymentAttempt.create({
            data: {
              paymentId: payment.id,
              idempotencyKey: `${order.id}:mpesa:1`,
              amountMinor: priced.totals.totalMinor,
              phoneMasked: maskPhone(input.mpesaPhone ?? input.contact.phone),
              expiresAt: new Date(Date.now() + ATTEMPT_WINDOW_MS),
            },
          });
          attemptId = attempt.id;
        }
        await tx.cart.update({ where: { id: resolved.cartId! }, data: { status: 'CONVERTED' } });
        return { orderId: order.id, attemptId };
      }, TX)
      .catch(async (error: unknown) => {
        // Two identical requests raced: the loser returns the winner's order.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const winner = await this.prisma.client.order.findUnique({
            where: { idempotencyKey },
            select: { id: true },
          });
          if (winner) return { orderId: winner.id, attemptId: null };
        }
        throw error;
      });

    if (placed.attemptId)
      await this.mpesa.startAttempt(placed.attemptId, input.mpesaPhone ?? input.contact.phone);

    const order = await this.prisma.client.order.findUniqueOrThrow({
      where: { id: placed.orderId },
      include: orderDetailInclude,
    });
    const detail = toOrderDetail(order, this.media);
    await this.stock.stockChanged(
      detail.lines.map((l) => l.productSlug).filter((s): s is string => Boolean(s)),
    );
    await this.mail.send(
      emails.orderReceived(
        order.email,
        {
          orderNumber: order.orderNumber,
          totalMinor: order.totalMinor,
          lines: detail.lines.map((l) => ({
            name: `${l.productName} (${l.variantName})`,
            quantity: l.quantity,
          })),
          trackUrl: `${this.storefrontUrl}/track-order/${order.trackingToken}`,
        },
        order.paymentProvider === 'MPESA',
      ),
    );
    return {
      resolved: { ...resolved, cartId: null },
      order: detail,
      next: this.nextStep(order.paymentProvider, order.paymentStatus),
    };
  }

  /** Development only: approve or cancel the latest simulated M-Pesa prompt. */
  async simulatePayment(
    orderNumber: string,
    trackingToken: string,
    outcome: 'success' | 'failure',
  ): Promise<OrderDetail> {
    await this.mpesa.simulate(orderNumber, trackingToken, outcome);
    return this.trackedOrder(orderNumber);
  }

  /** Sends a new M-Pesa prompt for an unpaid order. */
  async retryMpesa(input: RetryMpesaInput & { orderNumber: string }): Promise<OrderDetail> {
    await this.mpesa.retry(input.orderNumber, input.trackingToken, input.phone);
    return this.trackedOrder(input.orderNumber);
  }

  private async trackedOrder(orderNumber: string): Promise<OrderDetail> {
    const order = await this.prisma.client.order.findUniqueOrThrow({
      where: { orderNumber },
      include: orderDetailInclude,
    });
    return toOrderDetail(order, this.media);
  }

  private nextStep(provider: string | null, status: string): PlaceOrderResponse['next'] {
    return provider === 'MPESA' && status === 'PENDING'
      ? { type: 'AWAIT_MPESA', simulated: this.mpesa.simulated }
      : { type: 'CONFIRMED' };
  }

  private async deliveryAddress(owner: CartOwner, input: PlaceOrderInput) {
    if (input.addressId) {
      if (!owner.userId)
        throw new BadRequestException({
          code: 'SIGN_IN_REQUIRED',
          message: 'Sign in to use a saved address',
        });
      const saved = await this.prisma.client.address.findFirst({
        where: { id: input.addressId, userId: owner.userId },
      });
      if (!saved) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Address not found' });
      return {
        recipientName: saved.recipientName,
        phone: saved.phone,
        county: saved.county,
        town: saved.town,
        street: saved.street,
        building: saved.building,
        landmark: saved.landmark,
      };
    }
    const a = input.shippingAddress!;
    return {
      recipientName: a.recipientName,
      phone: a.phone,
      county: a.county,
      town: a.town,
      street: a.street,
      building: a.building || null,
      landmark: a.landmark || null,
    };
  }
}
