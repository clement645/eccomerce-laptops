import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Permission } from '@repo/shared-types';
import request from 'supertest';
import { EmailWorker } from '../src/jobs/email.worker.js';
import { MailService } from '../src/infrastructure/mail/mail.service.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { BlogService } from '../src/modules/blog/blog.service.js';
import { OrderPaymentService } from '../src/modules/orders/order-payment.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { removeStaff, staffWithSession } from './support/staff.js';
import { createTestApp } from './support/test-app.js';
import { testEnv } from './support/test-env.js';

const run = `cnt${Date.now()}`;
const ORIGIN = 'http://localhost:3000';

describe('Content, reviews, coupons, newsletter, contact and settings (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let variantId: string;
  let productId: string;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const http = () => request(app.getHttpServer());
  const mail = () => app.get(MailService).outbox;
  const admin = (who: string) => ({
    get: (path: string) =>
      http().get(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`),
    post: (path: string, body?: object) =>
      http().post(`/api/v1/admin${path}`).set('Authorization', `Bearer ${tokens[who]}`).send(body),
    put: (path: string, body: unknown) =>
      http()
        .put(`/api/v1/admin${path}`)
        .set('Authorization', `Bearer ${tokens[who]}`)
        .send(body as object),
  });

  async function staff(name: string, permissions: Permission[]) {
    const member = await staffWithSession(app, `${run}-${name}@example.com`, permissions);
    tokens[name] = member.token;
    ids[name] = member.userId;
  }

  async function customer(name: string) {
    const user = await prisma.user.create({
      data: {
        email: `${run}-${name}@example.com`,
        type: 'CUSTOMER',
        emailVerifiedAt: new Date(),
        profile: { create: { firstName: name, lastName: 'Mwangi' } },
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
    tokens[name] = await app
      .get(TokenService)
      .signAccess({ userId: user.id, sessionId: session.id, audience: 'storefront' });
    ids[name] = user.id;
    return user;
  }

  /** A guest checkout through the public API, optionally with a coupon. */
  function shopper(email = `${run}-buyer-${randomUUID().slice(0, 8)}@example.com`) {
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
    const quote = (couponCode?: string) =>
      send(
        http()
          .post('/api/v1/checkout/quote')
          .send({ county: 'Nairobi', shippingMethodCode: `${run}-STD`, couponCode }),
      );
    return {
      add: (quantity: number) =>
        send(http().post('/api/v1/cart/items').send({ variantId, quantity })),
      quote,
      place: async (couponCode?: string, expectedTotalMinor?: number) => {
        const total = expectedTotalMinor ?? (await quote(couponCode)).body.totals.totalMinor;
        return send(
          http()
            .post('/api/v1/checkout/orders')
            .set('Idempotency-Key', `${run}-${randomUUID()}`)
            .send({
              contact: { email, firstName: 'Akinyi', lastName: 'Ouma', phone: '0712345678' },
              shippingAddress: {
                recipientName: 'Akinyi Ouma',
                phone: '0712345678',
                county: 'Nairobi',
                town: 'Kilimani',
                street: 'Ngong Road',
              },
              shippingMethodCode: `${run}-STD`,
              paymentMethod: 'MPESA',
              expectedTotalMinor: total,
              couponCode,
            }),
        );
      },
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService).client;
    const product = await prisma.product.create({
      data: {
        slug: `${run}-tablet`,
        name: 'Test tablet',
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 86_400_000),
        brand: { create: { slug: `${run}-brand`, name: `Brand ${run}` } },
        category: { create: { slug: `${run}-cat`, name: `Cat ${run}` } },
        variants: {
          create: {
            sku: `${run}-T`,
            name: 'Default',
            priceMinor: 5_000_000,
            isDefault: true,
            inventory: { create: { onHand: 100 } },
          },
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    variantId = product.variants[0]!.id;
    await prisma.shippingMethod.create({
      data: {
        code: `${run}-STD`,
        name: 'Standard delivery',
        rates: { create: { county: 'Nairobi', priceMinor: 30_000, etaMinDays: 1, etaMaxDays: 2 } },
      },
    });
    await staff('editor', ['blog:write']);
    await staff('publisher', ['blog:write', 'blog:publish']);
    await staff('moderator', ['reviews:moderate']);
    await staff('marketer', ['coupons:write', 'customers:read', 'settings:write']);
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
    await prisma.productReview.deleteMany({ where: { productId } });
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.paymentAttempt.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.coupon.deleteMany({ where: { code: { startsWith: run.toUpperCase() } } });
    await prisma.cart.deleteMany({ where: { items: { some: { variantId } } } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.shippingMethod.deleteMany({ where: { code: `${run}-STD` } });
    await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
    await prisma.category.deleteMany({ where: { slug: `${run}-cat` } });
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.blogCategory.deleteMany({ where: { slug: { startsWith: run } } });
    await prisma.newsletterSubscriber.deleteMany({ where: { email: { startsWith: run } } });
    await prisma.contactMessage.deleteMany({ where: { email: { startsWith: run } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: run }, type: 'CUSTOMER' } });
    await removeStaff(app, run);
    await app.close();
  });

  describe('blog', () => {
    const post = (overrides: Record<string, unknown> = {}) => ({
      title: 'Choosing a laptop for university',
      slug: `${run}-uni-laptop`,
      contentHtml: `<h2>Budget</h2><p>${'Word '.repeat(450)}</p><script>alert(1)</script><p onclick="x()">Battery</p>`,
      ...overrides,
    });

    it('drafts, sanitizes, publishes and lists posts', async () => {
      const category = await admin('editor').post('/blog/categories', {
        name: 'Guides',
        slug: `${run}-guides`,
      });
      expect(category.status).toBe(201);
      const created = await admin('editor').post(
        '/blog/posts',
        post({ categoryId: category.body.id }),
      );
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ status: 'DRAFT', readingMinutes: 2 });
      expect(created.body.contentHtml).not.toMatch(/script|onclick/);
      expect(created.body.excerpt).toMatch(/^Budget Word Word/);
      ids.post = created.body.id;

      await http().get(`/api/v1/blog/posts/${run}-uni-laptop`).expect(404);
      expect(
        (await admin('editor').post(`/blog/posts/${ids.post}/status`, { status: 'PUBLISHED' }))
          .status,
      ).toBe(403);
      await admin('publisher')
        .post(`/blog/posts/${ids.post}/status`, { status: 'PUBLISHED' })
        .expect(200);

      const live = await http().get(`/api/v1/blog/posts/${run}-uni-laptop`).expect(200);
      expect(live.body).toMatchObject({
        title: 'Choosing a laptop for university',
        category: { slug: `${run}-guides` },
      });
      const list = await http().get(`/api/v1/blog/posts?category=${run}-guides`).expect(200);
      expect(list.body.items.map((p: { slug: string }) => p.slug)).toEqual([`${run}-uni-laptop`]);
      const categories = await http().get('/api/v1/blog/categories').expect(200);
      expect(
        categories.body.find((c: { slug: string }) => c.slug === `${run}-guides`).postCount,
      ).toBe(1);
    });

    it('publishes scheduled posts when their time comes', async () => {
      const created = await admin('publisher').post(
        '/blog/posts',
        post({ slug: `${run}-scheduled`, title: 'Coming soon' }),
      );
      const past = await admin('publisher').post(`/blog/posts/${created.body.id}/status`, {
        status: 'SCHEDULED',
        publishAt: new Date(Date.now() - 60_000).toISOString(),
      });
      expect(past.body.error.code).toBe('SCHEDULE_IN_PAST');
      const scheduled = await admin('publisher').post(`/blog/posts/${created.body.id}/status`, {
        status: 'SCHEDULED',
        publishAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
      expect(scheduled.body.status).toBe('SCHEDULED');
      await http().get(`/api/v1/blog/posts/${run}-scheduled`).expect(404);

      // The worker runs this every minute; here the clock is moved past the publish time.
      expect(
        await app.get(BlogService).publishDue(new Date(Date.now() + 2 * 3_600_000)),
      ).toBeGreaterThanOrEqual(1);
      await prisma.blogPost.update({
        where: { id: created.body.id },
        data: { publishedAt: new Date(Date.now() - 1000) },
      });
      await app.get(BlogService).publishDue();
      await http().get(`/api/v1/blog/posts/${run}-scheduled`).expect(200);
    });
  });

  describe('reviews', () => {
    const review = {
      rating: 4,
      title: 'Solid tablet',
      body: 'Battery lasts all day and the screen is sharp.',
    };

    it('accepts reviews only from customers whose order was delivered', async () => {
      await customer('Wanjiru');
      const auth = { Authorization: `Bearer ${tokens.Wanjiru}` };
      const before = await http()
        .get(`/api/v1/account/reviews/${run}-tablet`)
        .set(auth)
        .expect(200);
      expect(before.body).toEqual({ canReview: false, reason: 'NOT_PURCHASED', existing: null });
      expect(
        (await http().put(`/api/v1/account/reviews/${run}-tablet`).set(auth).send(review)).status,
      ).toBe(403);
      await http().get(`/api/v1/account/reviews/${run}-tablet`).expect(401);

      await prisma.order.create({
        data: {
          orderNumber: `T-${run}`,
          trackingToken: randomUUID(),
          userId: ids.Wanjiru,
          email: `${run}-Wanjiru@example.com`,
          phone: '254712345678',
          customerName: 'Wanjiru Mwangi',
          shippingAddress: {},
          subtotalMinor: 5_000_000,
          totalMinor: 5_000_000,
          paymentStatus: 'PAID',
          fulfillmentStatus: 'DELIVERED',
          deliveredAt: new Date(),
          items: {
            create: {
              productId,
              variantId,
              productName: 'Test tablet',
              variantName: 'Default',
              sku: `${run}-T`,
              unitPriceMinor: 5_000_000,
              quantity: 1,
              taxRateBps: 1600,
              taxMinor: 0,
              lineTotalMinor: 5_000_000,
            },
          },
        },
      });
      const submitted = await http()
        .put(`/api/v1/account/reviews/${run}-tablet`)
        .set(auth)
        .send(review);
      expect(submitted.status).toBe(200);
      expect(submitted.body).toMatchObject({
        canReview: true,
        existing: { status: 'PENDING', rating: 4 },
      });
      expect(
        (
          await http()
            .put(`/api/v1/account/reviews/${run}-tablet`)
            .set(auth)
            .send({ rating: 9, body: 'x' })
        ).status,
      ).toBe(400);

      // Nothing is public until a moderator approves it.
      const pub = await http().get(`/api/v1/catalog/products/${run}-tablet/reviews`).expect(200);
      expect(pub.body.summary).toMatchObject({ count: 0, average: 0 });
    });

    it('publishes approved reviews and derives the rating from them only', async () => {
      const queue = await admin('moderator').get('/reviews?status=PENDING').expect(200);
      const pending = queue.body.items.find(
        (r: { product: { slug: string } }) => r.product.slug === `${run}-tablet`,
      );
      expect(pending).toMatchObject({
        verifiedPurchase: true,
        author: { email: `${run}-Wanjiru@example.com` },
      });
      expect(
        (await admin('moderator').post(`/reviews/${pending.id}/moderate`, { status: 'REJECTED' }))
          .status,
      ).toBe(400);
      await admin('moderator')
        .post(`/reviews/${pending.id}/moderate`, { status: 'APPROVED' })
        .expect(204);

      const pub = await http().get(`/api/v1/catalog/products/${run}-tablet/reviews`).expect(200);
      expect(pub.body.summary).toMatchObject({ count: 1, average: 4 });
      expect(pub.body.items[0]).toMatchObject({
        author: 'Wanjiru M.',
        verifiedPurchase: true,
        title: 'Solid tablet',
      });
      expect(JSON.stringify(pub.body)).not.toContain('@example.com');
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect({ avg: Number(product.ratingAvg), count: product.ratingCount }).toEqual({
        avg: 4,
        count: 1,
      });

      // Editing sends it back to moderation, and it stops counting.
      await http()
        .put(`/api/v1/account/reviews/${run}-tablet`)
        .set('Authorization', `Bearer ${tokens.Wanjiru}`)
        .send({ ...review, rating: 2 })
        .expect(200);
      const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(after.ratingCount).toBe(0);
      expect((await admin('marketer').get('/reviews')).status).toBe(403);
    });
  });

  describe('coupons', () => {
    const code = (suffix: string) => `${run.toUpperCase()}-${suffix}`;

    it('applies a coupon on the server and records its use', async () => {
      const created = await admin('marketer').post('/coupons', {
        code: code('TEN'),
        type: 'PERCENTAGE',
        percentBps: 1000,
        maxDiscountMinor: 800_000,
        minOrderMinor: 6_000_000,
      });
      expect(created.status).toBe(201);
      expect(created.body.code).toBe(code('TEN'));
      expect(
        (
          await admin('marketer').post('/coupons', {
            code: code('TEN'),
            type: 'FIXED_AMOUNT',
            amountMinor: 100,
          })
        ).status,
      ).toBe(409);

      const client = shopper();
      await client.add(1);
      let quote = await client.quote(code('TEN').toLowerCase());
      expect(quote.body).toMatchObject({
        coupon: null,
        couponError: 'Spend at least Ksh 60,000 to use this code.',
      });
      expect((await client.quote('NOPE-CODE')).body.couponError).toBe("That code isn't valid.");

      await client.add(1);
      quote = await client.quote(code('TEN'));
      expect(quote.body.coupon).toMatchObject({ code: code('TEN'), discountMinor: 800_000 });
      expect(quote.body.totals).toMatchObject({
        subtotalMinor: 10_000_000,
        discountMinor: 800_000,
        totalMinor: 9_230_000,
      });

      const placed = await client.place(code('TEN'));
      expect(placed.status).toBe(201);
      expect(placed.body.order.totals).toMatchObject({
        discountMinor: 800_000,
        totalMinor: 9_230_000,
      });
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: placed.body.order.orderNumber },
        include: { items: true, couponRedemption: true },
      });
      expect(order).toMatchObject({ couponCode: code('TEN'), discountMinor: 800_000 });
      expect(order.items.reduce((s, i) => s + i.discountMinor, 0)).toBe(800_000);
      expect(order.couponRedemption).toMatchObject({ discountMinor: 800_000 });
      expect(
        (await prisma.coupon.findUniqueOrThrow({ where: { code: code('TEN') } })).redemptionCount,
      ).toBe(1);

      // The cancelled order gives the use back.
      await prisma.stockReservation.updateMany({
        where: { orderId: order.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await prisma.paymentAttempt.updateMany({
        where: { payment: { orderId: order.id } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(OrderPaymentService).releaseExpired();
      expect(
        (await prisma.coupon.findUniqueOrThrow({ where: { code: code('TEN') } })).redemptionCount,
      ).toBe(0);
    });

    it('enforces usage limits even when orders race', async () => {
      await admin('marketer')
        .post('/coupons', {
          code: code('ONCE'),
          type: 'FIXED_AMOUNT',
          amountMinor: 100_000,
          maxRedemptions: 1,
        })
        .expect(201);
      const a = shopper();
      const b = shopper();
      await Promise.all([a.add(1), b.add(1)]);
      const [ta, tb] = await Promise.all([a.quote(code('ONCE')), b.quote(code('ONCE'))]);
      const results = await Promise.all([
        a.place(code('ONCE'), ta.body.totals.totalMinor),
        b.place(code('ONCE'), tb.body.totals.totalMinor),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(results.find((r) => r.status === 422)!.body.error).toMatchObject({
        code: 'COUPON_INVALID',
        message: 'That code has been fully used.',
      });
      expect(
        (await prisma.coupon.findUniqueOrThrow({ where: { code: code('ONCE') } })).redemptionCount,
      ).toBe(1);
    });

    it('limits uses per customer and first orders', async () => {
      await admin('marketer')
        .post('/coupons', {
          code: code('FIRST'),
          type: 'FIXED_AMOUNT',
          amountMinor: 50_000,
          firstOrderOnly: true,
        })
        .expect(201);
      const email = `${run}-repeat@example.com`;
      const first = shopper(email);
      await first.add(1);
      expect((await first.place(code('FIRST'))).status).toBe(201);
      const second = shopper(email);
      await second.add(1);
      const total = (await second.quote(code('FIRST'))).body.totals.totalMinor;
      const refused = await second.place(code('FIRST'), total);
      expect(refused.body.error).toMatchObject({
        code: 'COUPON_INVALID',
        message: 'This code is for first orders only.',
      });
    });
  });

  describe('newsletter', () => {
    it('subscribes only after the emailed link is confirmed', async () => {
      const email = `${run}-reader@example.com`;
      const res = await http()
        .post('/api/v1/newsletter/subscribe')
        .send({ email, source: 'footer' })
        .expect(202);
      expect(res.body.message).toMatch(/Check your inbox/);
      let row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(row.status).toBe('PENDING');
      const confirmMail = mail().at(-1)!;
      expect(confirmMail).toMatchObject({ to: email, subject: 'Confirm your subscription' });
      const token = /newsletter\/confirm\?token=([A-Za-z0-9_-]+)/.exec(confirmMail.text)![1]!;

      await http()
        .post('/api/v1/newsletter/confirm')
        .send({ token: 'x'.repeat(43) })
        .expect(400);
      await http().post('/api/v1/newsletter/confirm').send({ token }).expect(200);
      await http().post('/api/v1/newsletter/confirm').send({ token }).expect(400);
      row = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
      expect(row).toMatchObject({ status: 'SUBSCRIBED', source: 'footer' });

      // The same answer, and no email, for an address already subscribed.
      const sent = mail().length;
      const again = await http().post('/api/v1/newsletter/subscribe').send({ email }).expect(202);
      expect(again.body).toEqual(res.body);
      expect(mail().length).toBe(sent);

      const welcome = mail().find((m) => m.to === email && m.subject === "You're subscribed")!;
      const unsubscribe = /newsletter\/unsubscribe\?token=([A-Za-z0-9_-]+)/.exec(welcome.text)![1]!;
      const list = await admin('marketer')
        .get(`/newsletter/subscribers?q=${run}-reader`)
        .expect(200);
      expect(list.body.items[0]).toMatchObject({ email, status: 'SUBSCRIBED' });
      const csv = await admin('marketer').get('/newsletter/export.csv').expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text).toContain(`"${email}"`);
      expect(csv.text).toContain(unsubscribe);

      await http().post('/api/v1/newsletter/unsubscribe').send({ token: unsubscribe }).expect(200);
      await http().post('/api/v1/newsletter/unsubscribe').send({ token: unsubscribe }).expect(200);
      expect(
        (await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } })).status,
      ).toBe('UNSUBSCRIBED');
    });
  });

  describe('contact and settings', () => {
    it('lets staff edit validated settings that the storefront then shows', async () => {
      const bad = await admin('marketer').put('/settings/store.contact', { email: 'not-an-email' });
      expect(bad.status).toBe(400);
      expect((await admin('marketer').put('/settings/tax.vat', { rateBps: 0 })).status).toBe(400);
      const saved = await admin('marketer').put('/settings/store.contact', {
        email: `${run}-shop@example.com`,
        phone: '0712 345 678',
        address: 'Moi Avenue, Nairobi',
        openingHours: 'Mon–Sat 9am–6pm',
      });
      expect(saved.status).toBe(200);
      expect(saved.body).toMatchObject({ phone: '254712345678', whatsappNumber: null });
      await app.get(SettingsService).invalidate();
      const pub = await http().get('/api/v1/settings/public').expect(200);
      expect(pub.body.contact).toMatchObject({
        email: `${run}-shop@example.com`,
        address: 'Moi Avenue, Nairobi',
      });
      expect((await admin('moderator').get('/settings')).status).toBe(403);
    });

    it('forwards contact messages to the store inbox and files bots as spam', async () => {
      const message = {
        name: 'Otieno',
        email: `${run}-asker@example.com`,
        subject: 'Warranty question',
        message: 'Is the warranty valid in Kisumu?',
      };
      await http().post('/api/v1/contact').send(message).expect(202);
      const forwarded = mail().at(-1)!;
      expect(forwarded).toMatchObject({
        to: `${run}-shop@example.com`,
        replyTo: message.email,
        subject: 'Contact form: Warranty question',
      });
      // Forms send the schema's own output, where an empty phone is null.
      await http()
        .post('/api/v1/contact')
        .send({ ...message, phone: null, subject: 'No phone' })
        .expect(202);

      const sent = mail().length;
      await http()
        .post('/api/v1/contact')
        .send({ ...message, subject: 'Cheap pills', website: 'http://spam.example' })
        .expect(202);
      expect(mail().length).toBe(sent);

      const inbox = await admin('marketer').get(`/messages?q=${run}-asker`).expect(200);
      expect(inbox.body.items.map((m: { subject: string }) => m.subject).sort()).toEqual([
        'No phone',
        'Warranty question',
      ]);
      const spam = await admin('marketer').get(`/messages?q=${run}-asker&status=SPAM`).expect(200);
      expect(spam.body.items.map((m: { subject: string }) => m.subject)).toEqual(['Cheap pills']);
      await admin('marketer')
        .post(
          `/messages/${inbox.body.items.find((m: { subject: string }) => m.subject === 'No phone').id}/status`,
          { status: 'RESOLVED' },
        )
        .expect(204);
      await http()
        .post('/api/v1/contact')
        .send({ ...message, message: 'short' })
        // Three messages per 10 minutes per address: the fourth is refused before anything else.
        .expect(429);
      const redis = app.get(RedisService).client;
      const keys = await redis.keys('ecommerce-test:ratelimit:*');
      if (keys.length) await redis.del(...keys);
      await http()
        .post('/api/v1/contact')
        .send({ ...message, message: 'short' })
        .expect(400);
    });
  });

  describe('email queue', () => {
    it('hands emails to the worker, which delivers them', async () => {
      const queued = await createTestApp({
        MAIL_DELIVERY: 'queue',
        REDIS_KEY_PREFIX: `${run}-mailq`,
      });
      const worker = new EmailWorker(
        queued.get(MailService),
        testEnv({ REDIS_KEY_PREFIX: `${run}-mailq` }),
      );
      try {
        const service = queued.get(MailService);
        expect(
          await service.send({
            to: `${run}-q@example.com`,
            subject: 'Queued',
            text: 'Hi',
            html: '<p>Hi</p>',
          }),
        ).toBe(true);
        expect(service.outbox).toHaveLength(0);
        worker.onModuleInit();
        for (let i = 0; i < 50 && service.outbox.length === 0; i++)
          await new Promise((r) => setTimeout(r, 100));
        expect(service.outbox.map((m) => m.subject)).toEqual(['Queued']);
      } finally {
        await worker.onModuleDestroy();
        const redis = queued.get(RedisService).client;
        const keys = await redis.keys(`${run}-mailq:*`);
        if (keys.length) await redis.del(...keys);
        await queued.close();
      }
    });
  });
});
