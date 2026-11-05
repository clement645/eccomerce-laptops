import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Permission } from '@repo/shared-types';
import request from 'supertest';
import { MailService } from '../src/infrastructure/mail/mail.service.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { removeStaff, staffWithSession } from './support/staff.js';
import { createTestApp } from './support/test-app.js';

const run = `adm${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
// A real 3×2 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAYAAACddGYaAAAAEUlEQVR4nGP4z8DwHwYYGBgYAJ/aB/k6k4j0AAAAAElFTkSuQmCC',
  'base64',
);

describe('Admin API (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let brandId: string;
  let categoryId: string;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const as = (who: string) => ({
    get: (path: string) =>
      http().get(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`),
    post: (path: string, body?: object) =>
      http().post(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`).send(body),
    put: (path: string, body: object) =>
      http().put(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`).send(body),
    delete: (path: string) =>
      http().delete(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`),
    upload: (body: Buffer, contentType = 'image/png', folder = 'products') =>
      http()
        .post(`/api/v1/admin/media?folder=${folder}`)
        .set('Authorization', `Bearer ${tokens[who]}`)
        .set('Content-Type', contentType)
        .send(body),
  });

  async function staff(name: string, permissions: Permission[]) {
    const member = await staffWithSession(app, `${run}-${name}@example.com`, permissions);
    tokens[name] = member.token;
    ids[name] = member.userId;
  }

  const productInput = (overrides: Record<string, unknown> = {}) => ({
    name: `Test Laptop ${run}`,
    slug: `${run}-laptop`,
    brandId,
    categoryId,
    condition: 'NEW',
    shortDescription: 'A light laptop for work',
    description: '<p>Fast and <strong>light</strong>.</p><script>alert(1)</script>',
    warrantyMonths: 12,
    variants: [
      {
        sku: `${run}-I5`,
        name: 'Core i5 / 8GB',
        priceMinor: 8_500_000,
        compareAtPriceMinor: 9_000_000,
        costMinor: 7_000_000,
        attributes: { RAM: '8GB' },
        initialStock: 10,
      },
    ],
    specifications: [{ group: 'Memory', key: 'RAM', value: '8GB', isFilterable: true }],
    images: [],
    ...overrides,
  });

  /** A guest checkout through the public API, as the storefront does it. */
  async function placeOrder(
    variantId: string,
    quantity: number,
    paymentMethod: 'MPESA' | 'CASH_ON_DELIVERY',
  ) {
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
    await send(http().post('/api/v1/cart/items').send({ variantId, quantity }));
    const quote = await send(
      http()
        .post('/api/v1/checkout/quote')
        .send({ county: 'Nairobi', shippingMethodCode: `${run}-STD` }),
    );
    const res = await send(
      http()
        .post('/api/v1/checkout/orders')
        .set('Idempotency-Key', `${run}-${randomUUID()}`)
        .send({
          contact: {
            email: `${run}-buyer-${randomUUID().slice(0, 8)}@example.com`,
            firstName: 'Achieng',
            lastName: 'Odhiambo',
            phone: '0722000111',
          },
          shippingAddress: {
            recipientName: 'Achieng Odhiambo',
            phone: '0722000111',
            county: 'Nairobi',
            town: 'Kilimani',
            street: 'Ngong Road',
          },
          shippingMethodCode: `${run}-STD`,
          paymentMethod,
          expectedTotalMinor: quote.body.totals.totalMinor,
        }),
    );
    expect(res.status).toBe(201);
    return res.body.order as {
      orderNumber: string;
      trackingToken: string;
      totals: { totalMinor: number };
    };
  }

  const pay = (order: { orderNumber: string; trackingToken: string }) =>
    http()
      .post(`/api/v1/checkout/orders/${order.orderNumber}/simulate-payment`)
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'fetch')
      .send({ trackingToken: order.trackingToken, outcome: 'success' })
      .expect(200);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    brandId = (await prisma.brand.create({ data: { slug: `${run}-brand`, name: `Brand ${run}` } }))
      .id;
    categoryId = (
      await prisma.category.create({ data: { slug: `${run}-cat`, name: `Cat ${run}` } })
    ).id;
    await prisma.shippingMethod.create({
      data: {
        code: `${run}-STD`,
        name: 'Standard delivery',
        codAllowed: true,
        rates: { create: { county: 'Nairobi', priceMinor: 30_000, etaMinDays: 1, etaMaxDays: 2 } },
      },
    });
    await prisma.storeSetting.upsert({
      where: { key: 'checkout.cashOnDelivery' },
      create: {
        key: 'checkout.cashOnDelivery',
        value: { enabled: true, counties: ['Nairobi'], maxOrderMinor: 0 },
      },
      update: { value: { enabled: true, counties: ['Nairobi'], maxOrderMinor: 0 } },
    });
    await app.get(SettingsService).invalidate();

    await staff('manager', [
      'dashboard:read',
      'products:read',
      'products:write',
      'products:publish',
      'categories:write',
      'brands:write',
      'inventory:read',
      'inventory:adjust',
      'orders:read',
      'orders:update',
      'orders:cancel',
      'orders:refund',
      'customers:read',
      'customers:manage',
      'content:write',
      'staff:manage',
    ]);
    await staff('viewer', ['dashboard:read']);
    await staff('editor', ['products:read', 'products:write']);
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
    const orderIds = orders.map((o) => o.id);
    const products = await prisma.product.findMany({
      where: { slug: { startsWith: run } },
      select: { id: true },
    });
    const productIds = products.map((p) => p.id);
    await prisma.paymentEvent.deleteMany({
      where: { paymentAttempt: { payment: { orderId: { in: orderIds } } } },
    });
    await prisma.refund.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
    await prisma.paymentAttempt.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({
      where: { variant: { productId: { in: productIds } } },
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({
      where: { items: { some: { variant: { productId: { in: productIds } } } } },
    });
    await prisma.homepageSectionItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.banner.deleteMany({ where: { title: { startsWith: run } } });
    await prisma.homepageSection.deleteMany({ where: { key: { startsWith: run } } });
    await prisma.mediaAsset.deleteMany({ where: { uploadedBy: { email: { startsWith: run } } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: run }, type: 'CUSTOMER' } });
    await removeStaff(app, run);
    await prisma.adminRole.deleteMany({ where: { name: { startsWith: run } } });
    await prisma.shippingMethod.deleteMany({ where: { code: `${run}-STD` } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.brand.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.storeSetting.deleteMany({ where: { key: 'checkout.cashOnDelivery' } });
    await app.close();
  });

  describe('authorisation', () => {
    const routes: [method: 'get' | 'post' | 'put', path: string, permission: string][] = [
      ['get', '/dashboard', 'dashboard:read'],
      ['get', '/products', 'products:read'],
      ['post', '/products', 'products:write'],
      ['post', `/products/${randomUUID()}/status`, 'products:publish'],
      ['post', '/categories', 'categories:write'],
      ['post', '/brands', 'brands:write'],
      ['get', '/inventory', 'inventory:read'],
      ['post', `/inventory/${randomUUID()}/adjustments`, 'inventory:adjust'],
      ['get', '/orders', 'orders:read'],
      ['post', '/orders/EL-2026-000001/transitions', 'orders:update'],
      ['post', '/orders/EL-2026-000001/cancel', 'orders:cancel'],
      ['get', '/customers', 'customers:read'],
      ['post', `/customers/${randomUUID()}/status`, 'customers:manage'],
      ['get', '/banners', 'content:write'],
      ['get', '/homepage-sections', 'content:write'],
      ['get', '/staff', 'staff:manage'],
      ['get', '/roles', 'staff:manage'],
    ];

    it.each(routes)('%s %s needs a staff session and %s', async (method, path) => {
      await http()[method](`/api/v1/admin${path}`).send({}).expect(401);
      // A customer token is never accepted on admin routes.
      const customer = await app
        .get(TokenService)
        .signAccess({ userId: randomUUID(), sessionId: randomUUID(), audience: 'storefront' });
      await http()
        [method](`/api/v1/admin${path}`)
        .set('Authorization', `Bearer ${customer}`)
        .send({})
        .expect(401);
      const viewer = await http()
        [method](`/api/v1/admin${path}`)
        .set('Authorization', `Bearer ${tokens.viewer}`)
        .send({});
      if (path === '/dashboard') expect(viewer.status).toBe(200);
      else expect(viewer.status).toBe(403);
    });
  });

  describe('media', () => {
    it('stores real images in object storage and refuses anything else', async () => {
      const res = await as('editor').upload(PNG);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        mimeType: 'image/png',
        width: 3,
        height: 2,
        bytes: PNG.length,
      });
      expect(res.body.storageKey).toMatch(/^products\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
      const stored = await fetch(res.body.url);
      expect(stored.status).toBe(200);
      expect(Buffer.from(await stored.arrayBuffer()).equals(PNG)).toBe(true);
      ids.image = res.body.storageKey;

      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      );
      expect((await as('editor').upload(svg, 'image/png')).status).toBe(415);
      expect((await as('editor').upload(Buffer.alloc(0))).status).toBe(400);
      expect((await as('viewer').upload(PNG)).status).toBe(403);
    });
  });

  describe('products', () => {
    it('creates a draft, publishes it to the storefront and keeps history on edit', async () => {
      const created = await as('editor').post(
        '/products',
        productInput({ images: [{ storageKey: ids.image, alt: 'Laptop front view' }] }),
      );
      expect(created.status).toBe(201);
      const product = created.body;
      ids.product = product.id;
      ids.variant = product.variants[0].id;
      expect(product).toMatchObject({ status: 'DRAFT', slug: `${run}-laptop` });
      expect(product.description).toBe('<p>Fast and <strong>light</strong>.</p>');
      expect(product.variants[0]).toMatchObject({
        isDefault: true,
        inventory: { onHand: 10, reserved: 0 },
      });
      expect(product.images[0]).toMatchObject({ alt: 'Laptop front view' });
      expect(
        await prisma.inventoryMovement.findFirst({
          where: { variantId: ids.variant, reason: 'RESTOCK' },
        }),
      ).toMatchObject({ delta: 10, note: 'Opening stock', actorId: ids.editor });

      // Drafts are invisible to shoppers, and editors cannot publish.
      await http().get(`/api/v1/catalog/products/${run}-laptop`).expect(404);
      expect(
        (await as('editor').post(`/products/${ids.product}/status`, { status: 'PUBLISHED' }))
          .status,
      ).toBe(403);
      const published = await as('manager').post(`/products/${ids.product}/status`, {
        status: 'PUBLISHED',
      });
      expect(published.status).toBe(201);
      expect(published.body.publishedAt).toBeTruthy();
      const live = await http().get(`/api/v1/catalog/products/${run}-laptop`).expect(200);
      expect(live.body.images[0].url).toContain('/media-test/products/');

      // Edit: rename, add a variant and drop nothing; then drop the first variant.
      const second = productInput({
        name: `Test Laptop Pro ${run}`,
        variants: [
          {
            id: ids.variant,
            sku: `${run}-I5`,
            name: 'Core i5 / 8GB',
            priceMinor: 8_400_000,
            initialStock: 99,
          },
          {
            sku: `${run}-I7`,
            name: 'Core i7 / 16GB',
            priceMinor: 11_000_000,
            isDefault: true,
            initialStock: 4,
          },
        ],
      });
      const edited = await as('editor').put(`/products/${ids.product}`, second);
      expect(edited.status).toBe(200);
      expect(edited.body.variants).toHaveLength(2);
      // Opening stock only applies to new variants; existing stock moves through adjustments.
      expect(edited.body.variants[0].inventory.onHand).toBe(10);
      expect(edited.body.variants.find((v: { isDefault: boolean }) => v.isDefault).sku).toBe(
        `${run}-I7`,
      );
      ids.variant7 = edited.body.variants[1].id;

      const dropped = await as('editor').put(`/products/${ids.product}`, {
        ...second,
        variants: [second.variants[1]!].map((v) => ({ ...v, id: ids.variant7 })),
      });
      const old = dropped.body.variants.find((v: { id: string }) => v.id === ids.variant);
      expect(old).toMatchObject({ isActive: false, isDefault: false });
    });

    it('rejects duplicate SKUs and slugs, foreign images and unknown variants', async () => {
      const dupe = await as('editor').post('/products', productInput({ slug: `${run}-other` }));
      expect(dupe.status).toBe(409);
      expect(dupe.body.error.code).toBe('ALREADY_EXISTS');
      const slug = await as('editor').post(
        '/products',
        productInput({ variants: [{ sku: `${run}-NEW`, name: 'X', priceMinor: 100 }] }),
      );
      expect(slug.status).toBe(409);
      const foreign = await as('editor').post(
        '/products',
        productInput({
          slug: `${run}-img`,
          variants: [{ sku: `${run}-IMG`, name: 'X', priceMinor: 100 }],
          images: [{ storageKey: 'products/2026/01/not-uploaded.png', alt: 'x' }],
        }),
      );
      expect(foreign.body.error.code).toBe('IMAGE_NOT_FOUND');
      const wrongVariant = await as('editor').put(
        `/products/${ids.product}`,
        productInput({
          variants: [{ id: randomUUID(), sku: `${run}-Z`, name: 'Z', priceMinor: 100 }],
        }),
      );
      expect(wrongVariant.body.error.code).toBe('INVALID_VARIANT');
      const invalid = await as('editor').post(
        '/products',
        productInput({ variants: [{ sku: 'x', name: '', priceMinor: 0 }] }),
      );
      expect(invalid.status).toBe(400);
    });
  });

  describe('categories and brands', () => {
    it('manages categories, refusing loops and deleting only unused ones', async () => {
      const parent = await as('manager').post('/categories', {
        name: 'Computers',
        slug: `${run}-computers`,
      });
      expect(parent.status).toBe(201);
      const child = await as('manager').post('/categories', {
        name: 'Ultrabooks',
        slug: `${run}-ultrabooks`,
        parentId: parent.body.id,
      });
      expect(child.body.parentId).toBe(parent.body.id);
      const loop = await as('manager').put(`/categories/${parent.body.id}`, {
        name: 'Computers',
        slug: `${run}-computers`,
        parentId: child.body.id,
      });
      expect(loop.body.error.code).toBe('CATEGORY_CYCLE');
      expect((await as('manager').delete(`/categories/${parent.body.id}`)).body.error.code).toBe(
        'IN_USE',
      );
      expect((await as('manager').delete(`/categories/${categoryId}`)).body.error.code).toBe(
        'IN_USE',
      );
      await as('manager').delete(`/categories/${child.body.id}`).expect(204);
      const list = await as('manager').get('/categories').expect(200);
      expect(
        list.body.find((c: { id: string }) => c.id === categoryId).productCount,
      ).toBeGreaterThan(0);
    });

    it('manages brands', async () => {
      const brand = await as('manager').post('/brands', {
        name: `Zed ${run}`,
        slug: `${run}-zed`,
        website: 'https://zed.example.com',
        logoKey: ids.image,
      });
      expect(brand.status).toBe(201);
      expect(brand.body.logoUrl).toContain(ids.image);
      expect(
        (await as('manager').post('/brands', { name: `Zed ${run}`, slug: `${run}-zed-2` })).status,
      ).toBe(409);
      await as('manager').delete(`/brands/${brand.body.id}`).expect(204);
      expect((await as('manager').delete(`/brands/${brandId}`)).body.error.code).toBe('IN_USE');
    });
  });

  describe('inventory', () => {
    it('adjusts stock with a reason and never below what is reserved', async () => {
      const restock = await as('manager').post(`/inventory/${ids.variant7}/adjustments`, {
        reason: 'RESTOCK',
        delta: 6,
        note: 'Supplier delivery',
      });
      expect(restock.status).toBe(201);
      expect(restock.body).toMatchObject({ onHand: 10, reserved: 0, available: 10 });
      expect(
        (
          await as('manager').post(`/inventory/${ids.variant7}/adjustments`, {
            reason: 'ADJUSTMENT',
            delta: -1,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await as('manager').post(`/inventory/${ids.variant7}/adjustments`, {
            reason: 'RESTOCK',
            delta: -1,
          })
        ).status,
      ).toBe(400);

      const order = await placeOrder(ids.variant7!, 8, 'MPESA');
      const tooMuch = await as('manager').post(`/inventory/${ids.variant7}/adjustments`, {
        reason: 'DAMAGE',
        delta: -3,
        note: 'Dropped',
      });
      expect(tooMuch.status).toBe(409);
      expect(tooMuch.body.error.code).toBe('INSUFFICIENT_STOCK');
      const damage = await as('manager').post(`/inventory/${ids.variant7}/adjustments`, {
        reason: 'DAMAGE',
        delta: -2,
        note: 'Dropped',
      });
      expect(damage.body).toMatchObject({
        onHand: 8,
        reserved: 8,
        available: 0,
        level: 'OUT_OF_STOCK',
      });

      const low = await as('manager').get(`/inventory?q=${run}-I7&level=OUT_OF_STOCK`).expect(200);
      expect(low.body.items.map((r: { sku: string }) => r.sku)).toEqual([`${run}-I7`]);
      const history = await as('manager').get(`/inventory/${ids.variant7}/movements`).expect(200);
      expect(history.body.map((m: { reason: string }) => m.reason)).toEqual([
        'DAMAGE',
        'RESERVATION',
        'RESTOCK',
        'RESTOCK',
      ]);
      expect(history.body[0]).toMatchObject({
        actor: `${run}-manager@example.com`,
        note: 'Dropped',
      });
      ids.heldOrder = order.orderNumber;
    });
  });

  describe('orders', () => {
    it('fulfils a paid M-Pesa order step by step, emailing the customer', async () => {
      await as('manager')
        .post(`/inventory/${ids.variant7}/adjustments`, { reason: 'RESTOCK', delta: 20 })
        .expect(201);
      const order = await placeOrder(ids.variant7!, 1, 'MPESA');
      const path = `/orders/${order.orderNumber}`;
      let detail = (await as('manager').get(path).expect(200)).body;
      expect(detail).toMatchObject({ paymentStatus: 'PENDING', allowedTransitions: [] });
      const early = await as('manager').post(`${path}/transitions`, { to: 'PROCESSING' });
      expect(early.status).toBe(409);
      expect(early.body.error.message).toMatch(/not been paid/);

      await pay(order);
      detail = (await as('manager').get(path).expect(200)).body;
      expect(detail.allowedTransitions).toEqual(['PROCESSING']);
      expect(detail.payments[0]).toMatchObject({ provider: 'MPESA', status: 'SUCCEEDED' });

      await as('manager').post(`${path}/transitions`, { to: 'PROCESSING' }).expect(200);
      expect(
        (await as('manager').post(`${path}/transitions`, { to: 'SHIPPED' })).body.error.code,
      ).toBe('INVALID_TRANSITION');
      await as('manager').post(`${path}/transitions`, { to: 'PACKED' }).expect(200);
      expect(
        (await as('manager').post(`${path}/transitions`, { to: 'SHIPPED' })).body.error.code,
      ).toBe('SHIPMENT_REQUIRED');
      const shipped = await as('manager').post(`${path}/transitions`, {
        to: 'SHIPPED',
        shipment: {
          carrier: 'G4S',
          trackingNumber: 'G4S123456',
          trackingUrl: 'https://track.example.com/G4S123456',
        },
      });
      expect(shipped.status).toBe(200);
      expect(shipped.body.shipments[0]).toMatchObject({ carrier: 'G4S', status: 'IN_TRANSIT' });
      expect(app.get(MailService).outbox.at(-1)).toMatchObject({
        subject: `Order ${order.orderNumber} is on its way`,
      });
      expect(
        (await as('manager').post(`${path}/cancel`, { reason: 'Changed mind' })).body.error.code,
      ).toBe('INVALID_TRANSITION');

      const delivered = await as('manager').post(`${path}/transitions`, {
        to: 'DELIVERED',
        note: 'Signed for by Achieng',
      });
      expect(delivered.body).toMatchObject({
        fulfillmentStatus: 'DELIVERED',
        allowedTransitions: [],
      });
      expect(delivered.body.shipments[0].status).toBe('DELIVERED');
      expect(
        delivered.body.history
          .filter((h: { field: string }) => h.field === 'FULFILLMENT')
          .map((h: { toStatus: string }) => h.toStatus),
      ).toEqual(['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED']);
      expect(delivered.body.history.at(-1)).toMatchObject({
        actor: `${run}-manager@example.com`,
        note: 'Signed for by Achieng',
      });

      // The customer sees the same steps on the tracking page.
      const tracked = (await http().get(`/api/v1/orders/track/${order.trackingToken}`).expect(200))
        .body;
      expect(tracked).toMatchObject({
        fulfillmentStatus: 'DELIVERED',
        shipment: { trackingNumber: 'G4S123456' },
      });
    });

    it('lets only one of two simultaneous updates through', async () => {
      const order = await placeOrder(ids.variant7!, 1, 'MPESA');
      await pay(order);
      const results = await Promise.all([
        as('manager').post(`/orders/${order.orderNumber}/transitions`, { to: 'PROCESSING' }),
        as('manager').post(`/orders/${order.orderNumber}/transitions`, { to: 'PROCESSING' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it('cancels a paid order: stock back on sale and a refund queued', async () => {
      const before = await prisma.inventory.findUniqueOrThrow({
        where: { variantId: ids.variant7 },
      });
      const order = await placeOrder(ids.variant7!, 2, 'MPESA');
      await pay(order);
      const cancelled = await as('manager').post(`/orders/${order.orderNumber}/cancel`, {
        reason: 'Customer asked to cancel',
      });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body).toMatchObject({
        fulfillmentStatus: 'CANCELLED',
        paymentStatus: 'PAID',
      });
      expect(cancelled.body.payments[0].refunds[0]).toMatchObject({
        status: 'REQUESTED',
        amountMinor: order.totals.totalMinor,
        requestedBy: `${run}-manager@example.com`,
      });
      expect(
        await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant7 } }),
      ).toMatchObject({
        onHand: before.onHand,
        reserved: before.reserved,
      });
      expect(app.get(MailService).outbox.at(-1)?.text).toMatch(/refunding your payment/);
    });

    it('releases held stock when an unpaid order is cancelled', async () => {
      const held = await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant7 } });
      const res = await as('manager').post(`/orders/${ids.heldOrder}/cancel`, {
        reason: 'Payment not completed',
      });
      expect(res.body).toMatchObject({ fulfillmentStatus: 'CANCELLED', paymentStatus: 'FAILED' });
      expect(res.body.payments[0].refunds).toEqual([]);
      expect(
        await prisma.inventory.findUniqueOrThrow({ where: { variantId: ids.variant7 } }),
      ).toMatchObject({
        onHand: held.onHand,
        reserved: held.reserved - 8,
      });
    });

    it('requires cash to be recorded before a cash-on-delivery order is delivered', async () => {
      const order = await placeOrder(ids.variant7!, 1, 'CASH_ON_DELIVERY');
      const path = `/orders/${order.orderNumber}`;
      for (const to of ['PROCESSING', 'PACKED'])
        await as('manager').post(`${path}/transitions`, { to }).expect(200);
      await as('manager')
        .post(`${path}/transitions`, { to: 'SHIPPED', shipment: { carrier: 'Store rider' } })
        .expect(200);
      const early = await as('manager').post(`${path}/transitions`, { to: 'DELIVERED' });
      expect(early.body.error.message).toMatch(/cash payment/);
      const paid = await as('manager').post(`${path}/cash-payment`, { reference: 'SLIP-0042' });
      expect(paid.body).toMatchObject({ paymentStatus: 'PAID', canRecordCashPayment: false });
      expect(
        (await as('manager').post(`${path}/cash-payment`, { reference: 'SLIP-0043' })).body.error
          .code,
      ).toBe('NOT_PAYABLE');
      await as('manager').post(`${path}/transitions`, { to: 'DELIVERED' }).expect(200);
    });

    it('searches orders and keeps internal notes private', async () => {
      const list = await as('manager').get(`/orders?q=${ids.heldOrder}`).expect(200);
      expect(list.body.items.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
        ids.heldOrder,
      ]);
      const noted = await as('manager').put(`/orders/${ids.heldOrder}/note`, {
        internalNote: 'Called the customer',
      });
      expect(noted.body.internalNote).toBe('Called the customer');
      const token = (
        await prisma.order.findUniqueOrThrow({ where: { orderNumber: ids.heldOrder } })
      ).trackingToken;
      const tracked = (await http().get(`/api/v1/orders/track/${token}`).expect(200)).body;
      expect(JSON.stringify(tracked)).not.toContain('Called the customer');
    });
  });

  describe('dashboard', () => {
    it('reports paid revenue from the database', async () => {
      const before = (await as('viewer').get('/dashboard?range=7d').expect(200)).body;
      const order = await placeOrder(ids.variant7!, 1, 'MPESA');
      await pay(order);
      const after = (await as('viewer').get('/dashboard?range=7d').expect(200)).body;
      expect(after.revenueMinor - before.revenueMinor).toBe(order.totals.totalMinor);
      expect(after.paidOrders - before.paidOrders).toBe(1);
      expect(after.toFulfil - before.toFulfil).toBe(1);
      expect(after.daily).toHaveLength(7);
      expect(after.daily.at(-1).revenueMinor - before.daily.at(-1).revenueMinor).toBe(
        order.totals.totalMinor,
      );
      expect(after.recentOrders[0].orderNumber).toBe(order.orderNumber);
      expect((await as('viewer').get('/dashboard?range=1y')).status).toBe(400);
    });
  });

  describe('customers', () => {
    it('suspends a customer and signs them out everywhere', async () => {
      const user = await prisma.user.create({
        data: {
          email: `${run}-shopper@example.com`,
          type: 'CUSTOMER',
          profile: { create: { firstName: 'Wanjiku', lastName: 'Mwangi', phone: '254733000222' } },
        },
      });
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          audience: 'STOREFRONT',
          refreshTokenHash: randomUUID(),
          familyId: randomUUID(),
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const token = await app
        .get(TokenService)
        .signAccess({ userId: user.id, sessionId: session.id, audience: 'storefront' });
      await http()
        .get('/api/v1/account/addresses')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = await as('manager').get(`/customers?q=Wanjiku`).expect(200);
      expect(found.body.items.map((c: { id: string }) => c.id)).toContain(user.id);
      const suspended = await as('manager').post(`/customers/${user.id}/status`, {
        status: 'SUSPENDED',
        reason: 'Fraud review',
      });
      expect(suspended.body).toMatchObject({ status: 'SUSPENDED', orderCount: 0 });
      await http()
        .get('/api/v1/account/addresses')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
      expect(
        (await as('manager').post(`/customers/${user.id}/status`, { status: 'ACTIVE' })).status,
      ).toBe(400);
    });
  });

  describe('content', () => {
    it('manages banners and curated homepage sections', async () => {
      const banner = await as('manager').post('/banners', {
        placement: 'PROMO',
        title: `${run} Back to school`,
        ctaLabel: 'Shop now',
        ctaHref: '/shop',
        imageKey: ids.image,
        imageAlt: 'Students with laptops',
      });
      expect(banner.status).toBe(201);
      expect(banner.body.imageUrl).toContain(ids.image);
      const bad = await as('manager').post('/banners', {
        placement: 'PROMO',
        title: `${run} Bad`,
        ctaLabel: 'Go',
        ctaHref: 'javascript:alert(1)',
      });
      expect(bad.status).toBe(400);
      await as('manager').delete(`/banners/${banner.body.id}`).expect(204);

      const section = await prisma.homepageSection.create({
        data: { key: `${run}-picks`, title: 'Picks', config: { source: 'curated', limit: 8 } },
      });
      const saved = await as('manager').put(`/homepage-sections/${section.id}`, {
        title: 'Staff picks',
        isActive: true,
        sortOrder: 99,
        productIds: [ids.product],
      });
      expect(saved.body).toMatchObject({
        title: 'Staff picks',
        source: 'curated',
        items: [{ productId: ids.product }],
      });
    });
  });

  describe('staff and roles', () => {
    it('invites staff who set a password and then enrol two-factor', async () => {
      const roles = (await as('manager').get('/roles').expect(200)).body;
      const custom = await as('manager').post('/roles', {
        name: `${run} Packers`,
        permissions: ['orders:read', 'orders:update'],
      });
      expect(custom.status).toBe(201);
      expect(custom.body).toMatchObject({
        isSystem: false,
        permissions: ['orders:read', 'orders:update'],
      });
      const system = roles.find((r: { isSystem: boolean }) => r.isSystem);
      if (system)
        expect(
          (await as('manager').put(`/roles/${system.id}`, { name: 'Hacked', permissions: [] })).body
            .error.code,
        ).toBe('SYSTEM_ROLE');

      const invited = await as('manager').post('/staff', {
        email: `${run}-packer@example.com`,
        firstName: 'Otieno',
        lastName: 'Packer',
        roleIds: [custom.body.id],
      });
      expect(invited.status).toBe(201);
      expect(invited.body).toMatchObject({ invitePending: true, mfaEnabled: false });
      const mail = app.get(MailService).outbox.at(-1)!;
      expect(mail.to).toBe(`${run}-packer@example.com`);
      const token = /set-password\?token=([A-Za-z0-9_-]+)/.exec(mail.text)![1]!;

      const password = 'Packing-Shelves-2026!';
      await http()
        .post('/api/v1/admin/auth/set-password')
        .send({ token, password: 'short' })
        .expect(400);
      await http().post('/api/v1/admin/auth/set-password').send({ token, password }).expect(204);
      await http().post('/api/v1/admin/auth/set-password').send({ token, password }).expect(400);
      const login = await http()
        .post('/api/v1/admin/auth/login')
        .send({ email: `${run}-packer@example.com`, password });
      expect(login.status).toBe(200);
      expect(login.body.stage).toBe('mfa_setup');

      // Nobody changes their own access.
      expect(
        (await as('manager').put(`/staff/${ids.manager}`, { status: 'SUSPENDED' })).body.error.code,
      ).toBe('SELF_CHANGE');
      const suspended = await as('manager').put(`/staff/${invited.body.id}`, {
        status: 'SUSPENDED',
      });
      expect(suspended.body.status).toBe('SUSPENDED');
      expect((await as('manager').delete(`/roles/${custom.body.id}`)).body.error.code).toBe(
        'IN_USE',
      );
      const audit = await prisma.auditLog.findMany({
        where: { entityId: invited.body.id },
        select: { action: true },
      });
      expect(audit.map((a) => a.action).sort()).toEqual(['staff.invited', 'staff.updated']);
    });
  });
});
