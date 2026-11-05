import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MailService } from '../src/infrastructure/mail/mail.service.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { hashPassword } from '../src/modules/auth/crypto/password.js';
import { OrderPaymentService } from '../src/modules/orders/order-payment.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { createTestApp } from './support/test-app.js';

const run = `co${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const address = {
  recipientName: 'Amina Otieno',
  phone: '0712345678',
  county: 'Nairobi',
  town: 'Kilimani',
  street: 'Argwings Kodhek Road',
};
const contact = {
  email: `${run}-guest@example.com`,
  firstName: 'Amina',
  lastName: 'Otieno',
  phone: '0712345678',
};

describe('Cart and checkout (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  const variants: Record<string, string> = {};
  const http = () => request(app.getHttpServer());

  /** A browser-like client: keeps the guest cart cookie and sends the CSRF header. */
  function shopper(bearer?: string) {
    let cookie = '';
    const capture = (res: request.Response) => {
      const set = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('sf_cart='));
      if (set) cookie = set.split(';')[0]!.slice('sf_cart='.length);
      return res;
    };
    const withHeaders = (req: request.Test) => {
      req.set('Origin', ORIGIN).set('X-Requested-With', 'fetch');
      if (cookie) req.set('Cookie', `sf_cart=${cookie}`);
      if (bearer) req.set('Authorization', `Bearer ${bearer}`);
      return req;
    };
    return {
      get cookie() {
        return cookie;
      },
      get: (path: string) => withHeaders(http().get(path)).then(capture),
      post: (path: string, body?: object, headers: Record<string, string> = {}) =>
        withHeaders(http().post(path)).set(headers).send(body).then(capture),
      patch: (path: string, body: object) =>
        withHeaders(http().patch(path)).send(body).then(capture),
    };
  }

  async function quoteTotal(client: ReturnType<typeof shopper>, method = `${run}-STD`) {
    const res = await client.post('/api/v1/checkout/quote', {
      county: 'Nairobi',
      town: 'Kilimani',
      shippingMethodCode: method,
    });
    expect(res.status).toBe(200);
    return res.body.totals.totalMinor as number;
  }

  async function placeOrder(
    client: ReturnType<typeof shopper>,
    overrides: Record<string, unknown> = {},
    key = `${run}-${Math.random().toString(36).slice(2)}-key`,
  ) {
    const expectedTotalMinor = await quoteTotal(client);
    return client.post(
      '/api/v1/checkout/orders',
      {
        contact,
        shippingAddress: address,
        shippingMethodCode: `${run}-STD`,
        paymentMethod: 'MPESA',
        expectedTotalMinor,
        ...overrides,
      },
      { 'Idempotency-Key': key },
    );
  }

  const inventory = (key: string) =>
    prisma.inventory.findUniqueOrThrow({ where: { variantId: variants[key]! } });

  async function makeProduct(
    key: string,
    price: number,
    stock: number,
    status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED',
  ) {
    const product = await prisma.product.create({
      data: {
        slug: `${run}-${key}`,
        name: `Test ${key}`,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date(Date.now() - 86_400_000) : null,
        brand: { connect: { slug: `${run}-brand` } },
        category: { connect: { slug: `${run}-cat` } },
        variants: {
          create: {
            sku: `${run}-${key}`,
            name: 'Default',
            priceMinor: price * 100,
            isDefault: true,
            inventory: { create: { onHand: stock } },
          },
        },
      },
      include: { variants: true },
    });
    variants[key] = product.variants[0]!.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    await prisma.brand.create({ data: { slug: `${run}-brand`, name: `Brand ${run}` } });
    await prisma.category.create({ data: { slug: `${run}-cat`, name: `Cat ${run}` } });
    await makeProduct('laptop', 100_000, 5);
    await makeProduct('mouse', 2_000, 50);
    await makeProduct('lastunits', 50_000, 3);
    await makeProduct('draft', 1_000, 5, 'DRAFT');
    await makeProduct('expiring', 30_000, 2);
    await prisma.shippingMethod.create({
      data: {
        code: `${run}-STD`,
        name: 'Standard delivery',
        codAllowed: true,
        rates: {
          create: {
            county: 'Nairobi',
            priceMinor: 30_000,
            freeAboveMinor: 15_000_000,
            etaMinDays: 1,
            etaMaxDays: 2,
          },
        },
      },
    });
    await prisma.storeSetting.upsert({
      where: { key: 'checkout.cashOnDelivery' },
      create: { key: 'checkout.cashOnDelivery', value: { enabled: false } },
      update: { value: { enabled: false } },
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
    await prisma.inventoryMovement.deleteMany({ where: { variant: { sku: { startsWith: run } } } });
    await prisma.paymentEvent.deleteMany({
      where: { paymentAttempt: { payment: { orderId: { in: ids } } } },
    });
    await prisma.refund.deleteMany({ where: { payment: { orderId: { in: ids } } } });
    await prisma.paymentAttempt.deleteMany({ where: { payment: { orderId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { sku: { startsWith: run } } } } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
    await prisma.inventory.deleteMany({ where: { variant: { sku: { startsWith: run } } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.shippingMethod.deleteMany({ where: { code: { startsWith: run } } });
    await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
    await prisma.category.deleteMany({ where: { slug: `${run}-cat` } });
    await prisma.storeSetting.deleteMany({ where: { key: 'checkout.cashOnDelivery' } });
    await app.close();
  });

  describe('cart', () => {
    it('is empty without a cookie and creates a guest cart on first add', async () => {
      const client = shopper();
      const empty = await client.get('/api/v1/cart');
      expect(empty.body).toMatchObject({ lines: [], itemCount: 0 });
      expect(client.cookie).toBe('');

      const res = await client.post('/api/v1/cart/items', {
        variantId: variants.laptop,
        quantity: 2,
      });
      expect(res.status).toBe(201);
      expect(client.cookie).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.body.lines[0]).toMatchObject({
        sku: `${run}-laptop`,
        unitPriceMinor: 10_000_000,
        quantity: 2,
        lineTotalMinor: 20_000_000,
        issue: null,
      });
      expect(res.body.subtotalMinor).toBe(20_000_000);
    });

    it('rejects changes without the CSRF header or from another origin', async () => {
      await http()
        .post('/api/v1/cart/items')
        .set('Origin', ORIGIN)
        .send({ variantId: variants.laptop })
        .expect(403);
      await http()
        .post('/api/v1/cart/items')
        .set('Origin', 'https://evil.example')
        .set('X-Requested-With', 'fetch')
        .send({ variantId: variants.laptop })
        .expect(403);
    });

    it('clamps quantity to stock and refuses unavailable products', async () => {
      const client = shopper();
      const res = await client.post('/api/v1/cart/items', {
        variantId: variants.laptop,
        quantity: 10,
      });
      expect(res.body.lines[0].quantity).toBe(5);
      expect((await client.post('/api/v1/cart/items', { variantId: variants.draft })).status).toBe(
        404,
      );
      const removed = await client.patch(`/api/v1/cart/items/${variants.laptop}`, { quantity: 0 });
      expect(removed.body.lines).toEqual([]);
    });

    it('merges the guest cart into the account on sign-in', async () => {
      const guest = shopper();
      await guest.post('/api/v1/cart/items', { variantId: variants.mouse, quantity: 2 });
      await prisma.user.create({
        data: {
          email: `${run}-merge@example.com`,
          passwordHash: await hashPassword('a long passphrase'),
          emailVerifiedAt: new Date(),
          profile: { create: { firstName: 'M', lastName: 'G' } },
        },
      });
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: `${run}-merge@example.com`, password: 'a long passphrase' })
        .expect(200);

      const signedIn = await http()
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .set('Cookie', `sf_cart=${guest.cookie}`)
        .expect(200);
      expect(
        signedIn.body.lines.map((l: { sku: string; quantity: number }) => [l.sku, l.quantity]),
      ).toEqual([[`${run}-mouse`, 2]]);
      expect(([] as string[]).concat(signedIn.headers['set-cookie'] ?? []).join(';')).toMatch(
        /sf_cart=;/,
      );
      // The guest cart is spent: using its cookie again shows nothing.
      expect(
        (await http().get('/api/v1/cart').set('Cookie', `sf_cart=${guest.cookie}`)).body.lines,
      ).toEqual([]);
    });
  });

  describe('quote', () => {
    it('lists delivery options and prices the order on the server', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse, quantity: 1 });
      const res = await client
        .post('/api/v1/checkout/quote', {
          county: 'Nairobi',
          town: 'Kilimani',
          shippingMethodCode: `${run}-STD`,
        })
        .then((r) => r.body);
      expect(res.selectedShipping).toMatchObject({ code: `${run}-STD`, priceMinor: 30_000 });
      expect(res.totals).toMatchObject({
        subtotalMinor: 200_000,
        shippingMinor: 30_000,
        totalMinor: 230_000,
      });
      expect(res.paymentMethods).toEqual([
        { method: 'MPESA', available: true, reason: null, simulated: true },
        expect.objectContaining({ method: 'CASH_ON_DELIVERY', available: false }),
      ]);
    });

    it('applies free delivery above the threshold', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.laptop, quantity: 2 });
      const res = await client.post('/api/v1/checkout/quote', {
        county: 'Nairobi',
        shippingMethodCode: `${run}-STD`,
      });
      expect(res.body.totals).toMatchObject({ shippingMinor: 0, totalMinor: 20_000_000 });
    });
  });

  describe('placing orders', () => {
    it('requires an Idempotency-Key and refuses a total the customer did not review', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse });
      const total = await quoteTotal(client);
      const body = {
        contact,
        shippingAddress: address,
        shippingMethodCode: `${run}-STD`,
        paymentMethod: 'MPESA',
        expectedTotalMinor: total,
      };
      expect((await client.post('/api/v1/checkout/orders', body)).status).toBe(400);
      const changed = await client.post(
        '/api/v1/checkout/orders',
        { ...body, expectedTotalMinor: total - 100 },
        { 'Idempotency-Key': `${run}-price-change-key` },
      );
      expect(changed.status).toBe(409);
      expect(changed.body.error.code).toBe('PRICE_CHANGED');
      expect(
        await prisma.order.count({ where: { idempotencyKey: `${run}-price-change-key` } }),
      ).toBe(0);
    });

    it('reserves stock, snapshots prices, empties the cart and emails the customer', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.laptop, quantity: 2 });
      const before = await inventory('laptop');
      const res = await placeOrder(client, {}, `${run}-place-key-0001`);
      expect(res.status).toBe(201);
      expect(res.body.next).toEqual({ type: 'AWAIT_MPESA', simulated: true });
      expect(res.body.order).toMatchObject({
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'PENDING',
        totals: { totalMinor: 20_000_000 },
      });
      expect(res.body.order.orderNumber).toMatch(/^EL-\d{4}-\d{6}$/);
      expect(res.body.order.paymentDueBy).toBeTruthy();

      const after = await inventory('laptop');
      expect(after).toMatchObject({ onHand: before.onHand, reserved: before.reserved + 2 });
      expect((await client.get('/api/v1/cart')).body.lines).toEqual([]);
      expect(app.get(MailService).outbox.at(-1)).toMatchObject({
        to: contact.email,
        subject: `Order ${res.body.order.orderNumber} received`,
      });

      // Retrying with the same key returns the same order and reserves nothing more.
      const replay = await client.post(
        '/api/v1/checkout/orders',
        {
          contact,
          shippingAddress: address,
          shippingMethodCode: `${run}-STD`,
          paymentMethod: 'MPESA',
          expectedTotalMinor: 20_000_000,
        },
        { 'Idempotency-Key': `${run}-place-key-0001` },
      );
      expect(replay.status).toBe(201);
      expect(replay.body.order.orderNumber).toBe(res.body.order.orderNumber);
      expect((await inventory('laptop')).reserved).toBe(after.reserved);
    });

    it('turns held stock into a sale when payment succeeds (idempotently)', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse, quantity: 3 });
      const before = await inventory('mouse');
      const { order } = (await placeOrder(client)).body;
      const pay = () =>
        client.post(`/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`, {
          trackingToken: order.trackingToken,
          outcome: 'success',
        });
      const paid = await pay();
      expect(paid.status).toBe(200);
      expect(paid.body).toMatchObject({ paymentStatus: 'PAID', paymentDueBy: null });
      expect(await inventory('mouse')).toMatchObject({
        onHand: before.onHand - 3,
        reserved: before.reserved,
      });
      // Nothing left to answer: the prompt is settled and stock is not taken twice.
      expect((await pay()).body.error.code).toBe('NO_OPEN_PROMPT');
      expect(await inventory('mouse')).toMatchObject({ onHand: before.onHand - 3 });
      const product = await prisma.product.findUniqueOrThrow({ where: { slug: `${run}-mouse` } });
      expect(product.salesCount).toBe(3);
      expect(
        await prisma.inventoryMovement.count({
          where: { variantId: variants.mouse, reason: 'SALE' },
        }),
      ).toBe(1);
    });

    it('keeps stock held after a cancelled prompt so the customer can retry', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse, quantity: 1 });
      const before = await inventory('mouse');
      const { order } = (await placeOrder(client)).body;
      expect((await inventory('mouse')).reserved).toBe(before.reserved + 1);
      const failed = await client.post(
        `/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`,
        { trackingToken: order.trackingToken, outcome: 'failure' },
      );
      expect(failed.body).toMatchObject({
        paymentStatus: 'PENDING',
        fulfillmentStatus: 'PENDING',
        mpesa: { status: 'CANCELLED', canRetry: true },
      });
      expect((await inventory('mouse')).reserved).toBe(before.reserved + 1);

      const retry = await client.post(`/api/v1/checkout/orders/${order.orderNumber}/mpesa-retry`, {
        trackingToken: order.trackingToken,
      });
      expect(retry.body.mpesa).toMatchObject({ status: 'PENDING', attemptsLeft: 1 });
      const paid = await client.post(
        `/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`,
        { trackingToken: order.trackingToken, outcome: 'success' },
      );
      expect(paid.body.paymentStatus).toBe('PAID');
      expect(await inventory('mouse')).toMatchObject({
        onHand: before.onHand - 1,
        reserved: before.reserved,
      });
    });

    it('cancels unpaid orders when the hold expires, and queues a refund for late payment', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.expiring, quantity: 2 });
      const { order } = (await placeOrder(client)).body;
      expect((await inventory('expiring')).reserved).toBe(2);
      await prisma.stockReservation.updateMany({
        where: { order: { orderNumber: order.orderNumber } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      // The prompt has also lapsed, so nothing is still in progress.
      await prisma.paymentAttempt.updateMany({
        where: { payment: { order: { orderNumber: order.orderNumber } } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expect(await app.get(OrderPaymentService).releaseExpired()).toBeGreaterThanOrEqual(1);
      expect(await inventory('expiring')).toMatchObject({ onHand: 2, reserved: 0 });
      const tracked = (await http().get(`/api/v1/orders/track/${order.trackingToken}`).expect(200))
        .body;
      expect(tracked).toMatchObject({ paymentStatus: 'FAILED', fulfillmentStatus: 'CANCELLED' });
      expect(tracked.timeline.map((t: { status: string }) => t.status)).toContain('CANCELLED');

      const late = await client.post(
        `/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`,
        { trackingToken: order.trackingToken, outcome: 'success' },
      );
      expect(late.status).toBe(200);
      expect(late.body).toMatchObject({ paymentStatus: 'FAILED', fulfillmentStatus: 'CANCELLED' });
      expect(await inventory('expiring')).toMatchObject({ onHand: 2, reserved: 0 });
      const refunds = await prisma.refund.findMany({
        where: { payment: { order: { orderNumber: order.orderNumber } } },
      });
      expect(refunds).toEqual([expect.objectContaining({ status: 'REQUESTED' })]);
    });

    it('confirms cash-on-delivery orders immediately and commits the stock', async () => {
      await prisma.storeSetting.update({
        where: { key: 'checkout.cashOnDelivery' },
        data: { value: { enabled: true, counties: ['Nairobi'], maxOrderMinor: 50_000_000 } },
      });
      await app.get(SettingsService).invalidate();
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse, quantity: 1 });
      const before = await inventory('mouse');
      const res = await placeOrder(client, { paymentMethod: 'CASH_ON_DELIVERY' });
      expect(res.status).toBe(201);
      expect(res.body.next).toEqual({ type: 'CONFIRMED' });
      expect(res.body.order.paymentStatus).toBe('UNPAID');
      expect(await inventory('mouse')).toMatchObject({
        onHand: before.onHand - 1,
        reserved: before.reserved,
      });
    });

    it('keeps orders private', async () => {
      const client = shopper();
      await client.post('/api/v1/cart/items', { variantId: variants.mouse });
      const { order } = (await placeOrder(client)).body;
      await http().get('/api/v1/orders/track/not-a-real-token-at-all-xyz').expect(404);
      await http().get(`/api/v1/orders/${order.orderNumber}`).expect(401);
      await prisma.user.create({
        data: {
          email: `${run}-other@example.com`,
          passwordHash: await hashPassword('a long passphrase'),
          emailVerifiedAt: new Date(),
        },
      });
      const other = await http()
        .post('/api/v1/auth/login')
        .send({ email: `${run}-other@example.com`, password: 'a long passphrase' })
        .expect(200);
      await http()
        .get(`/api/v1/orders/${order.orderNumber}`)
        .set('Authorization', `Bearer ${other.body.accessToken}`)
        .expect(404);
      await http()
        .post(`/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`)
        .set('Origin', ORIGIN)
        .set('X-Requested-With', 'fetch')
        .send({ trackingToken: 'x'.repeat(43), outcome: 'success' })
        .expect(404);
    });

    it('lists a signed-in customer’s own orders', async () => {
      await prisma.user.create({
        data: {
          email: `${run}-buyer@example.com`,
          passwordHash: await hashPassword('a long passphrase'),
          emailVerifiedAt: new Date(),
        },
      });
      const login = await http()
        .post('/api/v1/auth/login')
        .send({ email: `${run}-buyer@example.com`, password: 'a long passphrase' })
        .expect(200);
      const client = shopper(login.body.accessToken);
      await client.post('/api/v1/cart/items', { variantId: variants.mouse });
      const { order } = (
        await placeOrder(client, { contact: { ...contact, email: `${run}-buyer@example.com` } })
      ).body;
      const list = (
        await http()
          .get('/api/v1/orders')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .expect(200)
      ).body;
      expect(list.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([order.orderNumber]);
      await http()
        .get(`/api/v1/orders/${order.orderNumber}`)
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);
    });
  });

  describe('concurrency', () => {
    it('never oversells: 8 customers race for the last 3 units', async () => {
      const shoppers = Array.from({ length: 8 }, () => shopper());
      const totals: number[] = [];
      for (const client of shoppers) {
        await client.post('/api/v1/cart/items', { variantId: variants.lastunits, quantity: 1 });
        totals.push(await quoteTotal(client));
      }
      const results = await Promise.all(
        shoppers.map((client, i) =>
          client.post(
            '/api/v1/checkout/orders',
            {
              contact: { ...contact, email: `${run}-race${i}@example.com` },
              shippingAddress: address,
              shippingMethodCode: `${run}-STD`,
              paymentMethod: 'MPESA',
              expectedTotalMinor: totals[i],
            },
            { 'Idempotency-Key': `${run}-race-key-${i}-xxxxxxxx` },
          ),
        ),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(3);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);
      for (const r of results.filter((r) => r.status === 409))
        expect(r.body.error.code).toBe('OUT_OF_STOCK');
      expect(await inventory('lastunits')).toMatchObject({ onHand: 3, reserved: 3 });
    });
  });
});
