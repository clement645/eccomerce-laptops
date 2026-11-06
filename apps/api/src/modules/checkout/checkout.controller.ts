import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@repo/configuration';
import { cookiePolicy, type CookiePolicy } from '../../common/http/cookie-policy.js';
import type { CheckoutQuote, OrderDetail, PlaceOrderResponse } from '@repo/shared-types';
import {
  checkoutQuoteSchema,
  idempotencyKeySchema,
  placeOrderSchema,
  retryMpesaSchema,
  simulatePaymentSchema,
  type CheckoutQuoteInput,
  type PlaceOrderInput,
  type RetryMpesaInput,
} from '@repo/validation';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { API_ENV } from '../../config/env.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  CookieRequest,
  OptionalAuth,
  OptionalCurrentAuth,
} from '../auth/guards/auth.decorators.js';
import { clearGuestCartToken, readGuestCartToken } from '../cart/cart-cookie.js';
import type { ResolvedCart } from '../cart/cart.service.js';
import { CheckoutService } from './checkout.service.js';

@ApiTags('checkout')
@OptionalAuth()
@Controller('checkout')
export class CheckoutController {
  private readonly cookies: CookiePolicy;

  constructor(
    private readonly checkout: CheckoutService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.cookies = cookiePolicy(env);
  }

  /** Delivery options, payment methods and totals for the current cart and address. Reserves nothing. */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @CookieRequest('storefront')
  @RateLimit({ name: 'checkout-quote', limit: 60, windowSeconds: 60 })
  async quote(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Body(new ZodValidationPipe(checkoutQuoteSchema)) body: CheckoutQuoteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CheckoutQuote> {
    const { resolved, ...quote } = await this.checkout.quote(
      { userId: auth?.userId ?? null, guestToken: readGuestCartToken(req) },
      body,
    );
    this.applyCookie(res, resolved);
    return quote;
  }

  /** Places the order: reserves stock, snapshots prices and starts payment. Safe to retry with the same Idempotency-Key. */
  @Post('orders')
  @CookieRequest('storefront')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Unique per checkout attempt; reuse it when retrying',
  })
  @RateLimit({ name: 'place-order', limit: 10, windowSeconds: 60, failClosed: true })
  async place(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Headers('idempotency-key') rawKey: string | undefined,
    @Body(new ZodValidationPipe(placeOrderSchema)) body: PlaceOrderInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PlaceOrderResponse> {
    const key = new ZodValidationPipe(idempotencyKeySchema).transform(rawKey);
    const { resolved, ...result } = await this.checkout.placeOrder(
      { userId: auth?.userId ?? null, guestToken: readGuestCartToken(req) },
      body,
      key,
    );
    // The guest cart is now an order; start fresh next time.
    if (!auth) clearGuestCartToken(res, this.cookies);
    this.applyCookie(res, resolved);
    return result;
  }

  /** Sends a new M-Pesa prompt (after a cancelled, failed or expired one). Authorised by the tracking token. */
  @Post('orders/:orderNumber/mpesa-retry')
  @HttpCode(HttpStatus.OK)
  @CookieRequest('storefront')
  @RateLimit({ name: 'mpesa-retry', limit: 5, windowSeconds: 60, failClosed: true })
  retryMpesa(
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(retryMpesaSchema)) body: RetryMpesaInput,
  ): Promise<OrderDetail> {
    return this.checkout.retryMpesa({ ...body, orderNumber });
  }

  /** Development only (PAYMENTS_SIMULATED): approve or cancel the simulated M-Pesa prompt. */
  @Post('orders/:orderNumber/simulate-payment')
  @HttpCode(HttpStatus.OK)
  @CookieRequest('storefront')
  @RateLimit({ name: 'simulate-payment', limit: 20, windowSeconds: 60 })
  simulate(
    @Param('orderNumber') orderNumber: string,
    @Body(new ZodValidationPipe(simulatePaymentSchema))
    body: { trackingToken: string; outcome: 'success' | 'failure' },
  ): Promise<OrderDetail> {
    return this.checkout.simulatePayment(orderNumber, body.trackingToken, body.outcome);
  }

  private applyCookie(res: Response, resolved: ResolvedCart): void {
    if (resolved.clearGuestToken) clearGuestCartToken(res, this.cookies);
  }
}
