import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { createTestApp } from './support/test-app.js';

/**
 * Attempts to cheat checkout and payments: tampered prices and statuses, out-of-range quantities,
 * replayed keys, guessed codes and links, oversized or flooding requests, and heavy races for stock.
 * Each attack must fail without changing money or stock.
 */
const run = `abs${Date.now()}`;
const ORIGIN = 'http://localhost:3000';

describe('Checkout and payment abuse (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  const variants: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  function shopper(email = `${run}-${randomUUID().slice(0, 8)}@example.com`) {
    let cookie = '';
    const send = (req: request.Test) => {
      req.set('Origin', ORIGIN).set('X-Requested-With', 'fetch');
      if (cookie) req.set('Cookie', `sf_cart=${cookie}`);
      return req.then((res) => {
        const set = ([] as string[])
          .concat(res.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('sf_cart='));
        if (set) cookie = set.split(';')[0]!.slice('sf_cart='.length);
        return res;
      });
    };
    const order = (extra: Record<string, unknown> = {}, key = `${run}-${randomUUID()}`) =>
      send(
        http()
          .post('/api/v1/checkout/orders')
          .set('Idempotency-Key', key)
          .send({
            contact: { email, firstName: 'Baraka', lastName: 'Kiprop', phone: '0712345678' },
            shippingAddress: {
              recipientName: 'Baraka Kiprop',
              phone: '0712345678',
              county: 'Nairobi',
              town: 'CBD',
              street: 'Moi Avenue',
            },
            shippingMethodCode: `${run}-STD`,
            paymentMethod: 'MPESA',
            ...extra,
          }),
      );
    return {
      add: (variant: string, quantity: number) =>
        send(
          http()
            .post('/api/v1/cart/items')
            .send({ variantId: variants[variant] ?? variant, quantity }),
        ),
      quote: (couponCode?: string) =>
        send(
          http()
            .post('/api/v1/checkout/quote')
            .send({ county: 'Nairobi', shippingMethodCode: `${run}-STD`, couponCode }),
        ),
      order,
    };
  }

  const stock = (key: string) =>
    prisma.inventory.findUniqueOrThrow({ where: { variantId: variants[key]! } });

  async function product(
    key: string,
    priceMinor: number,
    onHand: number,
    status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
  ) {
    const created = await prisma.product.create({
      data: {
        slug: `${run}-${key}`,
        name: `Abuse ${key}`,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date(Date.now() - 86_400_000) : null,
        brand: { connect: { slug: `${run}-brand` } },
        category: { connect: { slug: `${run}-cat` } },
        variants: {
          create: {
            sku: `${run}-${key}`,
            name: 'Default',
            priceMinor,
            isDefault: true,
            inventory: { create: { onHand } },
          },
        },
      },
      include: { variants: true },
    });
    variants[key] = created.variants[0]!.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    await prisma.brand.create({ data: { slug: `${run}-brand`, name: `Brand ${run}` } });
    await prisma.category.create({ data: { slug: `${run}-cat`, name: `Cat ${run}` } });
    await product('phone', 2_500_000, 50);
    await product('scarce', 9_000_000, 5);
    await product('hidden', 100_000, 10, 'DRAFT');
    await prisma.shippingMethod.create({
      data: {
        code: `${run}-STD`,
        name: 'Standard',
        rates: { create: { county: 'Nairobi', priceMinor: 25_000, etaMinDays: 1, etaMaxDays: 2 } },
      },
    });
    await prisma.storeSetting.upsert({
      where: { key: 'checkout.cashOnDelivery' },
      create: {
        key: 'checkout.cashOnDelivery',
        value: { enabled: true, counties: ['Mombasa'], maxOrderMinor: 0 },
      },
      update: { value: { enabled: true, counties: ['Mombasa'], maxOrderMinor: 0 } },
    });
    await app.get(SettingsService).invalidate();
  });

  beforeEach(async () => {
    const redis = app.get(RedisService).client;
    const keys = await redis.keys('ecommerce-test:ratelimit:*');
    if (keys.length) await redis.del(...keys);
  });

  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { email: { startsWith: run } },
      select: { id: true },
    });
    const ids = orders.map((o) => o.id);
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.paymentAttempt.deleteMany({ where: { payment: { orderId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.inventoryMovement.deleteMany({ where: { variant: { sku: { startsWith: run } } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: run.toUpperCase() } } });
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { sku: { startsWith: run } } } } },
    });
    await prisma.product.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.shippingMethod.deleteMany({ where: { code: `${run}-STD` } });
    await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
    await prisma.category.deleteMany({ where: { slug: `${run}-cat` } });
    await prisma.storeSetting.deleteMany({ where: { key: 'checkout.cashOnDelivery' } });
    await app.close();
  });

  describe('tampered requests', () => {
    it('ignores prices, totals, discounts and statuses sent by the client', async () => {
      const client = shopper();
      await client.add('phone', 1);
      const real = (await client.quote()).body.totals.totalMinor as number;
      const res = await client.order({
        expectedTotalMinor: real,
        unitPriceMinor: 100,
        totals: { totalMinor: 100 },
        discountMinor: 2_000_000,
        paymentStatus: 'PAID',
        fulfillmentStatus: 'DELIVERED',
        lines: [{ variantId: variants.phone, unitPriceMinor: 1, quantity: 1 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.order).toMatchObject({
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'PENDING',
        totals: { subtotalMinor: 2_500_000, discountMinor: 0, totalMinor: real },
      });
    });

    it('refuses a total lower than the real one', async () => {
      const client = shopper();
      await client.add('phone', 1);
      const res = await client.order({ expectedTotalMinor: 100 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICE_CHANGED');
    });

    it('rejects impossible quantities and hidden products', async () => {
      const client = shopper();
      for (const quantity of [0, -1, 11, 1.5, 1e9])
        expect((await client.add('phone', quantity)).status).toBe(400);
      expect((await client.add('hidden', 1)).status).toBe(404);
      expect((await client.add(randomUUID(), 1)).status).toBe(404);
      // Adding again only ever reaches the per-line cap.
      for (let i = 0; i < 4; i++) await client.add('phone', 4);
      const quote = await client.quote();
      expect(quote.body.cart.lines[0].quantity).toBe(10);
    });

    it('refuses a payment method the order does not qualify for', async () => {
      const client = shopper();
      await client.add('phone', 1);
      const total = (await client.quote()).body.totals.totalMinor;
      const res = await client.order({
        paymentMethod: 'CASH_ON_DELIVERY',
        expectedTotalMinor: total,
      });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
      expect(
        (await client.order({ paymentMethod: 'CARD', expectedTotalMinor: total })).status,
      ).toBe(400);
    });

    it('rejects oversized request bodies', async () => {
      const res = await http()
        .post('/api/v1/payments/mpesa/callback/whatever')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ padding: 'x'.repeat(200_000) }));
      expect(res.status).toBe(413);
    });
  });

  describe('replays and guessing', () => {
    it("won't let one customer reuse another's order key", async () => {
      const key = `${run}-shared-key-0001`;
      const first = shopper();
      await first.add('phone', 1);
      const total = (await first.quote()).body.totals.totalMinor;
      expect((await first.order({ expectedTotalMinor: total }, key)).status).toBe(201);
      const second = shopper();
      await second.add('phone', 2);
      const replay = await second.order({ expectedTotalMinor: total }, key);
      expect(replay.status).toBe(409);
      expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('needs the private tracking token for payment actions', async () => {
      const client = shopper();
      await client.add('phone', 1);
      const total = (await client.quote()).body.totals.totalMinor;
      const { order } = (await client.order({ expectedTotalMinor: total })).body;
      for (const path of ['simulate-payment', 'mpesa-retry']) {
        const res = await http()
          .post(`/api/v1/checkout/orders/${order.orderNumber}/${path}`)
          .set('Origin', ORIGIN)
          .set('X-Requested-With', 'fetch')
          .send({ trackingToken: 'A'.repeat(43), outcome: 'success' });
        expect(res.status).toBe(404);
      }
      expect(
        (await prisma.order.findUniqueOrThrow({ where: { orderNumber: order.orderNumber } }))
          .paymentStatus,
      ).toBe('PENDING');
    });

    it('throttles guessing coupon codes', async () => {
      const client = shopper();
      await client.add('phone', 1);
      const statuses: number[] = [];
      for (let i = 0; i < 65; i++) statuses.push((await client.quote(`GUESS${i}`)).status);
      expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
      expect(statuses.slice(60)).toContain(429);
    });

    it('throttles order placement', async () => {
      const client = shopper();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++)
        statuses.push((await client.order({ expectedTotalMinor: 1 })).status);
      expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    });
  });

  describe('heavy concurrency', () => {
    it('never oversells: 25 shoppers race for 5 units', async () => {
      const shoppers = Array.from({ length: 25 }, () => shopper());
      await Promise.all(shoppers.map((s) => s.add('scarce', 1)));
      const totals = await Promise.all(
        shoppers.map(async (s) => (await s.quote()).body.totals.totalMinor as number),
      );
      const redis = app.get(RedisService).client;
      const keys = await redis.keys('ecommerce-test:ratelimit:*');
      if (keys.length) await redis.del(...keys);
      // Spread over two waves so the per-IP order limit (10/min) is not what decides the outcome.
      const results: number[] = [];
      for (const wave of [shoppers.slice(0, 10), shoppers.slice(10, 20), shoppers.slice(20)]) {
        const res = await Promise.all(
          wave.map((s) => s.order({ expectedTotalMinor: totals[shoppers.indexOf(s)] })),
        );
        results.push(...res.map((r) => r.status));
        const k = await redis.keys('ecommerce-test:ratelimit:*');
        if (k.length) await redis.del(...k);
      }
      expect(results.filter((s) => s === 201)).toHaveLength(5);
      expect(results.filter((s) => s !== 201).every((s) => s === 409)).toBe(true);
      expect(await stock('scarce')).toMatchObject({ onHand: 5, reserved: 5 });
    }, 60_000);

    it('never redeems a limited coupon more often than allowed', async () => {
      await prisma.coupon.create({
        data: {
          code: `${run.toUpperCase()}-LIMIT3`,
          type: 'FIXED_AMOUNT',
          amountMinor: 10_000,
          maxRedemptions: 3,
        },
      });
      const code = `${run.toUpperCase()}-LIMIT3`;
      const shoppers = Array.from({ length: 8 }, () => shopper());
      await Promise.all(shoppers.map((s) => s.add('phone', 1)));
      const totals = await Promise.all(
        shoppers.map(async (s) => (await s.quote(code)).body.totals.totalMinor as number),
      );
      const res = await Promise.all(
        shoppers.map((s, i) => s.order({ expectedTotalMinor: totals[i], couponCode: code })),
      );
      expect(res.filter((r) => r.status === 201)).toHaveLength(3);
      expect(
        res.filter((r) => r.status === 422).every((r) => r.body.error.code === 'COUPON_INVALID'),
      ).toBe(true);
      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.redemptionCount).toBe(3);
      expect(await prisma.couponRedemption.count({ where: { couponId: coupon.id } })).toBe(3);
    }, 60_000);
  });
});
