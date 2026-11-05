import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import { MAX_LINE_QUANTITY, stockStatusFor, type Cart, type CartLine } from '@repo/shared-types';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { hashToken, randomToken } from '../auth/crypto/tokens.js';

export const GUEST_CART_TTL_MS = 30 * 86_400_000;
const MAX_LINES = 30;

/** Who is shopping: a signed-in customer and/or the guest cart cookie. */
export interface CartOwner {
  userId: string | null;
  guestToken: string | null;
}

export interface ResolvedCart {
  cartId: string | null;
  /** New guest token to set as a cookie. */
  issueGuestToken?: string;
  /** The guest cookie is no longer needed (merged into the account, or stale). */
  clearGuestToken?: boolean;
}

const cartItemInclude = {
  variant: {
    include: {
      inventory: true,
      product: {
        select: {
          slug: true,
          name: true,
          status: true,
          publishedAt: true,
          category: { select: { slug: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storageKey: true } },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

export type CartItemRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

const emptyCart = (): Cart => ({
  id: null,
  lines: [],
  itemCount: 0,
  subtotalMinor: 0,
  checkoutReady: false,
});

/**
 * Carts never store prices: every read recomputes lines from current prices and stock, and flags
 * anything that cannot be bought as shown. The browser never supplies a price.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
  ) {}

  /**
   * Find (or, with create, make) the active cart. A guest cart is merged into the customer's cart
   * the first time they shop while signed in.
   */
  async resolve(owner: CartOwner, create: boolean): Promise<ResolvedCart> {
    const guest = owner.guestToken
      ? await this.prisma.client.cart.findUnique({
          where: { guestTokenHash: hashToken(owner.guestToken) },
        })
      : null;
    const activeGuest = guest && guest.status === 'ACTIVE' && guest.userId === null ? guest : null;
    const staleCookie = Boolean(owner.guestToken) && !activeGuest;

    if (owner.userId) {
      let cart = await this.prisma.client.cart.findFirst({
        where: { userId: owner.userId, status: 'ACTIVE' },
      });
      if (activeGuest) {
        cart ??= await this.prisma.client.cart.create({ data: { userId: owner.userId } });
        await this.merge(activeGuest.id, cart.id);
        return { cartId: cart.id, clearGuestToken: true };
      }
      if (!cart && create)
        cart = await this.prisma.client.cart.create({ data: { userId: owner.userId } });
      return { cartId: cart?.id ?? null, clearGuestToken: staleCookie || undefined };
    }

    if (activeGuest) return { cartId: activeGuest.id };
    if (!create) return { cartId: null, clearGuestToken: staleCookie || undefined };
    const token = randomToken();
    const cart = await this.prisma.client.cart.create({
      data: {
        guestTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS),
      },
    });
    return { cartId: cart.id, issueGuestToken: token };
  }

  /** Move guest lines into the customer's cart (quantities add up, capped at the line limit). */
  private async merge(fromCartId: string, intoCartId: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const items = await tx.cartItem.findMany({ where: { cartId: fromCartId } });
      for (const item of items) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_variantId: { cartId: intoCartId, variantId: item.variantId } },
        });
        const quantity = Math.min(MAX_LINE_QUANTITY, (existing?.quantity ?? 0) + item.quantity);
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: intoCartId, variantId: item.variantId } },
          create: { cartId: intoCartId, variantId: item.variantId, quantity },
          update: { quantity },
        });
      }
      await tx.cart.update({ where: { id: fromCartId }, data: { status: 'MERGED' } });
    });
  }

  async view(cartId: string | null): Promise<Cart> {
    if (!cartId) return emptyCart();
    const items = await this.prisma.client.cartItem.findMany({
      where: { cartId },
      include: cartItemInclude,
      orderBy: { createdAt: 'asc' },
    });
    const lines = items.map((item) => this.toLine(item));
    return {
      id: cartId,
      lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      subtotalMinor: lines.reduce(
        (sum, line) => sum + (line.issue === 'UNAVAILABLE' ? 0 : line.lineTotalMinor),
        0,
      ),
      checkoutReady: lines.length > 0 && lines.every((line) => line.issue === null),
    };
  }

  toLine(item: CartItemRow): CartLine {
    const { variant } = item;
    const product = variant.product;
    const purchasable =
      variant.isActive &&
      product.status === 'PUBLISHED' &&
      product.publishedAt !== null &&
      product.publishedAt <= new Date();
    const available = Math.max(
      0,
      (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
    );
    const maxQuantity = purchasable ? Math.min(available, MAX_LINE_QUANTITY) : 0;
    const issue = !purchasable
      ? 'UNAVAILABLE'
      : available === 0
        ? 'OUT_OF_STOCK'
        : item.quantity > maxQuantity
          ? 'QUANTITY_REDUCED'
          : null;
    return {
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      variantName: variant.name,
      sku: variant.sku,
      categorySlug: product.category.slug,
      imageUrl: this.media.publicUrl(product.images[0]?.storageKey),
      unitPriceMinor: variant.priceMinor,
      compareAtPriceMinor: variant.compareAtPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: variant.priceMinor * item.quantity,
      maxQuantity,
      stockStatus: stockStatusFor(available, variant.inventory?.lowStockThreshold ?? 5),
      issue,
    };
  }

  /** Add to a line, refusing anything that cannot currently be bought. */
  async addItem(cartId: string, variantId: string, quantity: number): Promise<void> {
    const variant = await this.prisma.client.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { status: true, publishedAt: true } } },
    });
    if (
      !variant ||
      !variant.isActive ||
      variant.product.status !== 'PUBLISHED' ||
      !variant.product.publishedAt ||
      variant.product.publishedAt > new Date()
    ) {
      throw new NotFoundException({
        code: 'PRODUCT_UNAVAILABLE',
        message: 'This product is not available',
      });
    }
    const available = Math.max(
      0,
      (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
    );
    if (available === 0)
      throw new UnprocessableEntityException({
        code: 'OUT_OF_STOCK',
        message: 'This item is out of stock',
      });

    const existing = await this.prisma.client.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
    if (
      !existing &&
      (await this.prisma.client.cartItem.count({ where: { cartId } })) >= MAX_LINES
    ) {
      throw new UnprocessableEntityException({ code: 'CART_FULL', message: 'Your cart is full' });
    }
    const target = Math.min((existing?.quantity ?? 0) + quantity, MAX_LINE_QUANTITY, available);
    await this.prisma.client.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity: target },
      update: { quantity: target },
    });
    await this.touch(cartId);
  }

  /** Set a line's quantity (0 removes it). Clamped to available stock. */
  async setQuantity(cartId: string, variantId: string, quantity: number): Promise<void> {
    const item = await this.prisma.client.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
      include: cartItemInclude,
    });
    if (!item)
      throw new NotFoundException({
        code: 'NOT_IN_CART',
        message: 'That item is not in your cart',
      });
    if (quantity === 0) {
      await this.prisma.client.cartItem.delete({ where: { id: item.id } });
    } else {
      const max = this.toLine(item).maxQuantity;
      if (max === 0)
        throw new UnprocessableEntityException({
          code: 'OUT_OF_STOCK',
          message: 'This item is out of stock',
        });
      await this.prisma.client.cartItem.update({
        where: { id: item.id },
        data: { quantity: Math.min(quantity, max) },
      });
    }
    await this.touch(cartId);
  }

  async removeItem(cartId: string, variantId: string): Promise<void> {
    await this.prisma.client.cartItem.deleteMany({ where: { cartId, variantId } });
    await this.touch(cartId);
  }

  private async touch(cartId: string): Promise<void> {
    await this.prisma.client.cart.updateMany({
      where: { id: cartId, userId: null },
      data: { expiresAt: new Date(Date.now() + GUEST_CART_TTL_MS) },
    });
    await this.prisma.client.cart.update({
      where: { id: cartId },
      data: { updatedAt: new Date() },
    });
  }
}
