import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { ApiEnv } from '@repo/configuration';
import type { Cart } from '@repo/shared-types';
import { addCartItemSchema, updateCartItemSchema, type AddCartItemInput } from '@repo/validation';
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
import { clearGuestCartToken, readGuestCartToken, writeGuestCartToken } from './cart-cookie.js';
import { CartService, type ResolvedCart } from './cart.service.js';

const variantId = new ParseUUIDPipe({ version: '7' });

/**
 * Works for guests (cart cookie) and signed-in customers (Bearer token). Changes require the
 * storefront Origin and the X-Requested-With header because guests are identified by a cookie.
 */
@ApiTags('cart')
@OptionalAuth()
@Controller('cart')
export class CartController {
  private readonly secure: boolean;

  constructor(
    private readonly carts: CartService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.secure = env.NODE_ENV === 'production';
  }

  @Get()
  async get(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    const resolved = await this.resolve(auth, req, res, false);
    return this.carts.view(resolved.cartId);
  }

  @Post('items')
  @CookieRequest('storefront')
  @RateLimit({ name: 'cart', limit: 60, windowSeconds: 60 })
  async add(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Body(new ZodValidationPipe(addCartItemSchema)) body: AddCartItemInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    const { cartId } = await this.resolve(auth, req, res, true);
    await this.carts.addItem(cartId!, body.variantId, body.quantity);
    return this.carts.view(cartId);
  }

  @Patch('items/:variantId')
  @CookieRequest('storefront')
  @RateLimit({ name: 'cart', limit: 60, windowSeconds: 60 })
  async update(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Param('variantId', variantId) id: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: { quantity: number },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    const { cartId } = await this.resolve(auth, req, res, true);
    await this.carts.setQuantity(cartId!, id, body.quantity);
    return this.carts.view(cartId);
  }

  @Delete('items/:variantId')
  @CookieRequest('storefront')
  async remove(
    @OptionalCurrentAuth() auth: AuthContext | null,
    @Param('variantId', variantId) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Cart> {
    const { cartId } = await this.resolve(auth, req, res, false);
    if (cartId) await this.carts.removeItem(cartId, id);
    return this.carts.view(cartId);
  }

  private async resolve(
    auth: AuthContext | null,
    req: Request,
    res: Response,
    create: boolean,
  ): Promise<ResolvedCart> {
    const resolved = await this.carts.resolve(
      { userId: auth?.userId ?? null, guestToken: readGuestCartToken(req) },
      create,
    );
    if (resolved.issueGuestToken) writeGuestCartToken(res, resolved.issueGuestToken, this.secure);
    if (resolved.clearGuestToken) clearGuestCartToken(res, this.secure);
    return resolved;
  }
}
