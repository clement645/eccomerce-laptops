import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MailService } from '../src/infrastructure/mail/mail.service.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { OrderPaymentService } from '../src/modules/orders/order-payment.service.js';
import { PaymentSweepService } from '../src/modules/payments/payment-sweep.service.js';
import { MpesaPaymentService } from '../src/modules/payments/mpesa-payment.service.js';
import {
  MPESA_GATEWAY,
  MpesaGatewayError,
  type MpesaGateway,
  type StkPushRequest,
  type StkQueryResult,
} from '../src/modules/payments/mpesa/mpesa.types.js';
import { buildStkCallback } from '../src/modules/payments/mpesa/stk-callback.js';
import { RefundService } from '../src/modules/payments/refund.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { removeStaff, staffWithSession } from './support/staff.js';
import { createTestApp } from './support/test-app.js';

const run = `pay${Date.now()}`;
const ORIGIN = 'http://localhost:3000';
const SECRET = `cb_${run}_secret_value_0123456789`;
const CALLBACK = `/api/v1/payments/mpesa/callback/${SECRET}`;

const PAID: StkQueryResult = {
  state: 'SUCCEEDED',
  resultCode: '0',
  resultDesc: 'processed successfully',
};
const CANCELLED: StkQueryResult = {
  state: 'CANCELLED',
  resultCode: '1032',
  resultDesc: 'Request cancelled by user',
};
const STILL_PROCESSING: StkQueryResult = { state: 'PENDING', resultCode: null, resultDesc: null };

/** Stands in for Safaricom. Tests decide what STK Query reports for each prompt. */
class FakeMpesa implements MpesaGateway {
  readonly name = 'test' as const;
  pushes: (StkPushRequest & { checkoutRequestId: string })[] = [];
  states = new Map<string, StkQueryResult>();
  failNextPush: MpesaGatewayError | null = null;
  /** When set, STK Query fails (Safaricom unreachable). */
  failQueries = false;
  queries = 0;
  private n = 0;

  stkPush(req: StkPushRequest) {
    if (this.failNextPush) {
      const error = this.failNextPush;
      this.failNextPush = null;
      return Promise.reject(error);
    }
    const checkoutRequestId = `ws_CO_${run}_${++this.n}`;
    this.pushes.push({ ...req, checkoutRequestId });
    return Promise.resolve({ checkoutRequestId, merchantRequestId: `m_${run}_${this.n}` });
  }

  stkQuery(id: string) {
    this.queries++;
    if (this.failQueries)
      return Promise.reject(new MpesaGatewayError('unreachable', 'NETWORK', false));
    return Promise.resolve(this.states.get(id) ?? STILL_PROCESSING);
  }

  get last() {
    return this.pushes.at(-1)!;
  }
}

describe('M-Pesa payments (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService['client'];
  let variantId: string;
  const fake = new FakeMpesa();
  const http = () => request(app.getHttpServer());

  function shopper() {
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
    return {
      post: (path: string, body?: object, headers: Record<string, string> = {}) =>
        send(http().post(path).set(headers).send(body)),
    };
  }

  /** Places an M-Pesa order for `quantity` units and returns the order detail. */
  async function placeOrder(quantity = 1, overrides: Record<string, unknown> = {}) {
    const client = shopper();
    await client.post('/api/v1/cart/items', { variantId, quantity });
    const quote = await client.post('/api/v1/checkout/quote', {
      county: 'Nairobi',
      shippingMethodCode: `${run}-STD`,
    });
    const res = await client.post(
      '/api/v1/checkout/orders',
      {
        contact: {
          email: `${run}-${Math.random().toString(36).slice(2)}@example.com`,
          firstName: 'Wanjiru',
          lastName: 'Kamau',
          phone: '0712345678',
        },
        shippingAddress: {
          recipientName: 'Wanjiru Kamau',
          phone: '0712345678',
          county: 'Nairobi',
          town: 'Westlands',
          street: 'Waiyaki Way',
        },
        shippingMethodCode: `${run}-STD`,
        paymentMethod: 'MPESA',
        expectedTotalMinor: quote.body.totals.totalMinor,
        ...overrides,
      },
      { 'Idempotency-Key': `${run}-${Math.random().toString(36).slice(2)}-key` },
    );
    expect(res.status).toBe(201);
    return { order: res.body.order, client };
  }

  const callback = (
    checkoutRequestId: string,
    resultCode: number,
    extra: { amount?: number; receipt?: string } = {},
  ) =>
    buildStkCallback({
      checkoutRequestId,
      merchantRequestId: 'm',
      resultCode,
      resultDesc:
        resultCode === 0
          ? 'The service request is processed successfully.'
          : 'Request cancelled by user',
      ...extra,
    });

  const orderRow = (orderNumber: string) =>
    prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { payments: { include: { attempts: true, refunds: true } } },
    });
  const tracked = async (token: string) =>
    (await http().get(`/api/v1/orders/track/${token}`).expect(200)).body;
  const stock = () => prisma.inventory.findUniqueOrThrow({ where: { variantId } });
  const sales = (orderNumber: string) =>
    prisma.inventoryMovement.count({ where: { order: { orderNumber }, reason: 'SALE' } });

  beforeAll(async () => {
    app = await createTestApp(
      {
        PAYMENTS_SIMULATED: 'false',
        MPESA_CONSUMER_KEY: 'test-key',
        MPESA_CONSUMER_SECRET: 'test-secret',
        MPESA_SHORTCODE: '174379',
        MPESA_PASSKEY: 'test-passkey',
        MPESA_CALLBACK_SECRET: SECRET,
        MPESA_CALLBACK_BASE_URL: 'https://callbacks.example.test',
        // Loopback only, so supertest's requests are "Safaricom" and anything else is not.
        MPESA_ALLOWED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1',
      },
      (builder) => builder.overrideProvider(MPESA_GATEWAY).useValue(fake),
    );
    prisma = app.get(PrismaService).client;
    const product = await prisma.product.create({
      data: {
        slug: `${run}-phone`,
        name: 'Test phone',
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 86_400_000),
        brand: { create: { slug: `${run}-brand`, name: `Brand ${run}` } },
        category: { create: { slug: `${run}-cat`, name: `Cat ${run}` } },
        variants: {
          create: {
            sku: `${run}-phone`,
            name: 'Default',
            priceMinor: 1_250_000,
            isDefault: true,
            inventory: { create: { onHand: 200 } },
          },
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0]!.id;
    await prisma.shippingMethod.create({
      data: {
        code: `${run}-STD`,
        name: 'Standard delivery',
        rates: { create: { county: 'Nairobi', priceMinor: 25_000, etaMinDays: 1, etaMaxDays: 2 } },
      },
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
    await prisma.paymentEvent.deleteMany({
      where: {
        OR: [
          { paymentAttempt: { payment: { orderId: { in: ids } } } },
          { dedupeKey: { contains: run } },
        ],
      },
    });
    await prisma.refund.deleteMany({ where: { payment: { orderId: { in: ids } } } });
    await prisma.paymentAttempt.deleteMany({ where: { payment: { orderId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.cart.deleteMany({ where: { items: { some: { variantId } } } });
    await removeStaff(app, run);
    await prisma.inventory.deleteMany({ where: { variantId } });
    await prisma.product.deleteMany({ where: { slug: `${run}-phone` } });
    await prisma.shippingMethod.deleteMany({ where: { code: `${run}-STD` } });
    await prisma.brand.deleteMany({ where: { slug: `${run}-brand` } });
    await prisma.category.deleteMany({ where: { slug: `${run}-cat` } });
    await app.close();
  });

  describe('STK Push', () => {
    it('prompts the chosen phone for the server-computed total', async () => {
      const { order } = await placeOrder(2, { mpesaPhone: '0798 765 432' });
      const push = fake.last;
      expect(push).toMatchObject({
        phone: '254798765432',
        amount: order.totals.totalMinor / 100,
        accountReference: order.orderNumber.replace(/-/g, ''),
        callbackUrl: `https://callbacks.example.test${CALLBACK}`,
      });
      expect(push.accountReference.length).toBeLessThanOrEqual(12);
      expect(order.mpesa).toMatchObject({
        status: 'PENDING',
        phoneMasked: '2547******32',
        message: null,
        attemptsLeft: 2,
        canRetry: false,
      });
      const attempt = (await orderRow(order.orderNumber)).payments[0]!.attempts[0]!;
      expect(attempt.checkoutRequestId).toBe(push.checkoutRequestId);
      expect(attempt.nextQueryAt).toBeTruthy();
    });

    it('keeps the order payable when the prompt cannot be sent', async () => {
      fake.failNextPush = new MpesaGatewayError('Invalid PhoneNumber', '400.002.02', false);
      const { order, client } = await placeOrder();
      expect(order.paymentStatus).toBe('PENDING');
      expect(order.mpesa).toMatchObject({ status: 'FAILED', canRetry: true });
      expect(order.mpesa.message).toMatch(/could not send/);

      const retry = await client.post(`/api/v1/checkout/orders/${order.orderNumber}/mpesa-retry`, {
        trackingToken: order.trackingToken,
      });
      expect(retry.status).toBe(200);
      expect(retry.body.mpesa).toMatchObject({ status: 'PENDING', attemptsLeft: 1 });
      expect(fake.last.phone).toBe('254712345678');
    });
  });

  describe('callbacks', () => {
    it('marks the order paid only after STK Query confirms it', async () => {
      const before = await stock();
      const { order } = await placeOrder(1);
      const { checkoutRequestId, amount } = fake.last;
      fake.states.set(checkoutRequestId, PAID);
      const res = await http()
        .post(CALLBACK)
        .send(callback(checkoutRequestId, 0, { amount, receipt: 'TJU4ABC123' }));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });

      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
      expect(row.payments[0]).toMatchObject({
        status: 'SUCCEEDED',
        providerReference: 'TJU4ABC123',
      });
      expect(row.payments[0]!.attempts[0]).toMatchObject({
        status: 'SUCCEEDED',
        providerReference: 'TJU4ABC123',
      });
      expect(await stock()).toMatchObject({ onHand: before.onHand - 1, reserved: before.reserved });
      expect(app.get(MailService).outbox.at(-1)?.subject).toMatch(/payment/i);
      const event = await prisma.paymentEvent.findFirstOrThrow({
        where: { dedupeKey: `stk:${checkoutRequestId}:0` },
      });
      expect(event).toMatchObject({ processingError: null });
      expect(event.processedAt).toBeTruthy();
      expect((await tracked(order.trackingToken)).mpesa).toMatchObject({ status: 'SUCCEEDED' });
    });

    it('ignores a forged success callback that Safaricom does not confirm', async () => {
      const before = await stock();
      const { order } = await placeOrder(1);
      const { checkoutRequestId, amount } = fake.last;
      fake.states.set(checkoutRequestId, CANCELLED);
      await http()
        .post(CALLBACK)
        .send(callback(checkoutRequestId, 0, { amount, receipt: 'FAKE000001' }))
        .expect(200);

      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PENDING');
      expect(row.payments[0]!.status).toBe('PENDING');
      expect(row.payments[0]!.attempts[0]!.status).toBe('CANCELLED');
      expect(await stock()).toMatchObject({ onHand: before.onHand, reserved: before.reserved + 1 });
      expect(
        await prisma.paymentEvent.findFirstOrThrow({
          where: { dedupeKey: `stk:${checkoutRequestId}:0` },
        }),
      ).toMatchObject({ processingError: 'NOT_CONFIRMED' });
    });

    it('does nothing while Safaricom still reports the prompt as open', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId, amount } = fake.last;
      await http()
        .post(CALLBACK)
        .send(callback(checkoutRequestId, 0, { amount, receipt: 'TJU4OPEN01' }))
        .expect(200);
      expect((await orderRow(order.orderNumber)).paymentStatus).toBe('PENDING');

      // Confirmed later by the worker, which then uses the receipt from the stored callback.
      fake.states.set(checkoutRequestId, PAID);
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { nextQueryAt: new Date(Date.now() - 1000) },
      });
      await app.get(MpesaPaymentService).reconcileDue();
      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
      expect(row.payments[0]!.providerReference).toBe('TJU4OPEN01');
    });

    it('rejects the wrong secret without recording anything', async () => {
      const count = await prisma.paymentEvent.count();
      await http()
        .post('/api/v1/payments/mpesa/callback/not-the-secret-value-at-all-000')
        .send(callback(`ws_CO_${run}_x`, 0))
        .expect(404);
      expect(await prisma.paymentEvent.count()).toBe(count);
    });

    it('ignores callbacks from addresses outside the allowlist', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId, amount } = fake.last;
      fake.states.set(checkoutRequestId, PAID);
      const queries = fake.queries;
      await app
        .get(MpesaPaymentService)
        .handleCallback(
          callback(checkoutRequestId, 0, { amount, receipt: 'TJU4IP0001' }),
          '203.0.113.9',
        );
      expect(fake.queries).toBe(queries);
      expect((await orderRow(order.orderNumber)).paymentStatus).toBe('PENDING');
      expect(
        await prisma.paymentEvent.findFirstOrThrow({
          where: { dedupeKey: `stk:${checkoutRequestId}:0` },
        }),
      ).toMatchObject({ processingError: 'SOURCE_IP_REJECTED', sourceIp: '203.0.113.9' });
    });

    it('settles once when duplicate callbacks and the worker race', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId, amount } = fake.last;
      fake.states.set(checkoutRequestId, PAID);
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { nextQueryAt: new Date(Date.now() - 1000) },
      });
      const mailBefore = app.get(MailService).outbox.length;
      const body = callback(checkoutRequestId, 0, { amount, receipt: 'TJU4DUP001' });
      const results = await Promise.all([
        http().post(CALLBACK).send(body),
        http().post(CALLBACK).send(body),
        http().post(CALLBACK).send(body),
        app.get(MpesaPaymentService).reconcileDue(),
      ]);
      for (const res of results.slice(0, 3)) expect((res as request.Response).status).toBe(200);

      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
      expect(row.payments).toHaveLength(1);
      expect(await sales(order.orderNumber)).toBe(1);
      expect(
        await prisma.orderStatusHistory.count({ where: { orderId: row.id, toStatus: 'PAID' } }),
      ).toBe(1);
      expect(
        await prisma.paymentEvent.count({ where: { dedupeKey: `stk:${checkoutRequestId}:0` } }),
      ).toBe(1);
      expect(app.get(MailService).outbox.length - mailBefore).toBe(1);
    });

    it('does not trust the receipt when the callback amount is wrong', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId } = fake.last;
      fake.states.set(checkoutRequestId, PAID);
      await http()
        .post(CALLBACK)
        .send(callback(checkoutRequestId, 0, { amount: 1, receipt: 'TJU4AMT001' }))
        .expect(200);
      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
      expect(row.payments[0]!.providerReference).toBeNull();
      expect(
        await prisma.paymentEvent.findFirstOrThrow({
          where: { dedupeKey: `stk:${checkoutRequestId}:0` },
        }),
      ).toMatchObject({ processingError: 'AMOUNT_MISMATCH' });
    });

    it('records callbacks it cannot match and malformed bodies', async () => {
      await http()
        .post(CALLBACK)
        .send(callback(`ws_CO_${run}_unknown`, 0, { amount: 5 }))
        .expect(200);
      expect(
        await prisma.paymentEvent.findFirstOrThrow({
          where: { dedupeKey: `stk:ws_CO_${run}_unknown:0` },
        }),
      ).toMatchObject({ processingError: 'UNMATCHED', paymentAttemptId: null });
      await http().post(CALLBACK).send({ hello: run }).expect(200);
      expect(
        await prisma.paymentEvent.count({
          where: { processingError: 'INVALID_PAYLOAD', payload: { equals: { hello: run } } },
        }),
      ).toBe(1);
    });
  });

  describe('retries and timeouts', () => {
    it('lets the customer retry a cancelled prompt, up to the limit', async () => {
      const { order, client } = await placeOrder(1);
      const retry = (body: object = {}) =>
        client.post(`/api/v1/checkout/orders/${order.orderNumber}/mpesa-retry`, {
          trackingToken: order.trackingToken,
          ...body,
        });

      // While the first prompt is open, a retry is refused.
      expect((await retry()).body.error.code).toBe('PAYMENT_IN_PROGRESS');

      fake.states.set(fake.last.checkoutRequestId, CANCELLED);
      await http().post(CALLBACK).send(callback(fake.last.checkoutRequestId, 1032)).expect(200);
      let view = await tracked(order.trackingToken);
      expect(view.paymentStatus).toBe('PENDING');
      expect(view.mpesa).toMatchObject({ status: 'CANCELLED', canRetry: true, attemptsLeft: 2 });
      expect(view.mpesa.message).toMatch(/cancelled/);

      const second = await retry({ phone: '0711 000 111' });
      expect(second.status).toBe(200);
      expect(fake.last.phone).toBe('254711000111');
      fake.states.set(fake.last.checkoutRequestId, CANCELLED);
      await http().post(CALLBACK).send(callback(fake.last.checkoutRequestId, 1032)).expect(200);

      expect((await retry()).status).toBe(200);
      fake.states.set(fake.last.checkoutRequestId, CANCELLED);
      await http().post(CALLBACK).send(callback(fake.last.checkoutRequestId, 1032)).expect(200);

      view = await tracked(order.trackingToken);
      expect(view.mpesa).toMatchObject({ attemptsLeft: 0, canRetry: false });
      const refused = await retry();
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    });

    it('requires the tracking token to retry', async () => {
      const { order, client } = await placeOrder(1);
      const res = await client.post(`/api/v1/checkout/orders/${order.orderNumber}/mpesa-retry`, {
        trackingToken: 'x'.repeat(43),
      });
      expect(res.status).toBe(404);
    });

    it('settles a paid prompt found while checking before a retry', async () => {
      const { order, client } = await placeOrder(1);
      fake.states.set(fake.last.checkoutRequestId, PAID);
      const pushes = fake.pushes.length;
      const res = await client.post(`/api/v1/checkout/orders/${order.orderNumber}/mpesa-retry`, {
        trackingToken: order.trackingToken,
      });
      expect(res.status).toBe(200);
      expect(res.body.paymentStatus).toBe('PAID');
      expect(fake.pushes.length).toBe(pushes);
    });

    it('waits for an open prompt, then times it out and releases the order', async () => {
      const before = await stock();
      const { order } = await placeOrder(2);
      const { checkoutRequestId } = fake.last;
      await prisma.stockReservation.updateMany({
        where: { order: { orderNumber: order.orderNumber } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const orders = app.get(OrderPaymentService);
      // The hold has ended, but the customer may still be on the prompt.
      await orders.releaseExpired();
      expect((await orderRow(order.orderNumber)).paymentStatus).toBe('PENDING');

      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { expiresAt: new Date(Date.now() - 1000), nextQueryAt: new Date(Date.now() - 1000) },
      });
      await app.get(MpesaPaymentService).reconcileDue();
      expect((await orderRow(order.orderNumber)).payments[0]!.attempts[0]!.status).toBe(
        'TIMED_OUT',
      );
      await orders.releaseExpired();
      const row = await orderRow(order.orderNumber);
      expect(row).toMatchObject({ paymentStatus: 'FAILED', fulfillmentStatus: 'CANCELLED' });
      expect(await stock()).toMatchObject({ onHand: before.onHand, reserved: before.reserved });

      // The customer pays anyway: the money is recorded and a refund is queued, the order stays cancelled.
      fake.states.set(checkoutRequestId, PAID);
      await http()
        .post(CALLBACK)
        .send(
          callback(checkoutRequestId, 0, {
            amount: order.totals.totalMinor / 100,
            receipt: 'TJU4LATE01',
          }),
        )
        .expect(200);
      const late = await orderRow(order.orderNumber);
      expect(late).toMatchObject({ paymentStatus: 'FAILED', fulfillmentStatus: 'CANCELLED' });
      const extra = late.payments.find((p) => p.providerReference === 'TJU4LATE01')!;
      expect(extra).toMatchObject({
        status: 'SUCCEEDED',
        paidAt: null,
        amountMinor: order.totals.totalMinor,
      });
      expect(extra.refunds).toEqual([
        expect.objectContaining({
          status: 'REQUESTED',
          amountMinor: order.totals.totalMinor,
          requestedById: null,
        }),
      ]);
      expect(await stock()).toMatchObject({ onHand: before.onHand, reserved: before.reserved });
    });

    it('gives up on pushes that were never sent', async () => {
      const { order } = await placeOrder(1);
      const payment = (await orderRow(order.orderNumber)).payments[0]!;
      const stuck = await prisma.paymentAttempt.create({
        data: {
          paymentId: payment.id,
          idempotencyKey: `${run}-stuck`,
          amountMinor: payment.amountMinor,
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(Date.now() - 5 * 60_000),
        },
      });
      await app.get(MpesaPaymentService).reconcileDue();
      expect(
        await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: stuck.id } }),
      ).toMatchObject({
        status: 'FAILED',
        resultCode: 'PUSH_FAILED',
      });
    });
  });

  describe('recovery after the API was asleep', () => {
    /** As if the API slept through the whole payment window: the hold and the prompt have lapsed. */
    async function lapse(orderNumber: string, checkoutRequestId: string) {
      const past = new Date(Date.now() - 1000);
      await prisma.stockReservation.updateMany({
        where: { order: { orderNumber } },
        data: { expiresAt: past },
      });
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { expiresAt: past, nextQueryAt: past },
      });
    }

    it('settles an order paid while asleep instead of cancelling it', async () => {
      const before = await stock();
      const { order } = await placeOrder(1);
      const { checkoutRequestId } = fake.last;
      // The customer paid; the callback never arrived (the service was asleep).
      fake.states.set(checkoutRequestId, PAID);
      await lapse(order.orderNumber, checkoutRequestId);

      const result = await app.get(PaymentSweepService).sweep();
      expect(result.settled).toBeGreaterThanOrEqual(1);
      expect(await orderRow(order.orderNumber)).toMatchObject({ paymentStatus: 'PAID' });
      expect((await orderRow(order.orderNumber)).fulfillmentStatus).not.toBe('CANCELLED');
      expect(await stock()).toMatchObject({
        onHand: before.onHand - 1,
        reserved: before.reserved,
      });
      // Running again changes nothing.
      await app.get(PaymentSweepService).sweep();
      expect((await stock()).onHand).toBe(before.onHand - 1);
    });

    it('keeps the order while Safaricom cannot be asked, and resolves it once it can', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId } = fake.last;
      await lapse(order.orderNumber, checkoutRequestId);
      fake.failQueries = true;
      try {
        await app.get(PaymentSweepService).sweep();
      } finally {
        fake.failQueries = false;
      }
      // Unknown outcome: not timed out, not cancelled.
      let row = await orderRow(order.orderNumber);
      expect(row.payments[0]!.attempts[0]!.status).toBe('PENDING');
      expect(row.paymentStatus).toBe('PENDING');
      expect(row.fulfillmentStatus).not.toBe('CANCELLED');

      fake.states.set(checkoutRequestId, PAID);
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { nextQueryAt: new Date(Date.now() - 1000) },
      });
      await app.get(PaymentSweepService).sweep();
      row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
    });

    it('gives a timed-out prompt one final check, then stops asking', async () => {
      const { order } = await placeOrder(1);
      const { checkoutRequestId } = fake.last;
      await lapse(order.orderNumber, checkoutRequestId);
      const sweep = app.get(PaymentSweepService);
      await sweep.sweep();
      let attempt = (await orderRow(order.orderNumber)).payments[0]!.attempts[0]!;
      expect(attempt.status).toBe('TIMED_OUT');
      expect(attempt.nextQueryAt!.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
      expect((await orderRow(order.orderNumber)).fulfillmentStatus).toBe('CANCELLED');

      // Final check (10 minutes later) finds a late success: recorded, refund queued, order stays cancelled.
      fake.states.set(checkoutRequestId, PAID);
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId },
        data: { nextQueryAt: new Date(Date.now() - 1000) },
      });
      await sweep.sweep();
      const row = await orderRow(order.orderNumber);
      expect(row.fulfillmentStatus).toBe('CANCELLED');
      expect(row.payments.flatMap((p) => p.refunds)).toEqual([
        expect.objectContaining({ status: 'REQUESTED' }),
      ]);

      // Still unanswered at the final check: no more queries.
      const second = await placeOrder(1);
      await lapse(second.order.orderNumber, fake.last.checkoutRequestId);
      await sweep.sweep();
      await prisma.paymentAttempt.updateMany({
        where: { checkoutRequestId: fake.last.checkoutRequestId },
        data: { nextQueryAt: new Date(Date.now() - 1000) },
      });
      await sweep.sweep();
      attempt = (await orderRow(second.order.orderNumber)).payments[0]!.attempts[0]!;
      expect(attempt).toMatchObject({ status: 'TIMED_OUT', nextQueryAt: null });
    });
  });

  describe('refunds', () => {
    async function paidOrder() {
      const { order } = await placeOrder(1);
      fake.states.set(fake.last.checkoutRequestId, PAID);
      await http()
        .post(CALLBACK)
        .send(
          callback(fake.last.checkoutRequestId, 0, {
            amount: fake.last.amount,
            receipt: `R${Date.now().toString(36).toUpperCase().slice(-9)}`,
          }),
        )
        .expect(200);
      const row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PAID');
      return { order, payment: row.payments[0]! };
    }

    it('requires staff with the refund permission', async () => {
      const { order, payment } = await paidOrder();
      await http().get(`/api/v1/admin/orders/${order.orderNumber}/payments`).expect(401);
      const reader = await staffWithSession(app, `${run}-reader@example.com`, ['orders:read']);
      const list = await http()
        .get(`/api/v1/admin/orders/${order.orderNumber}/payments`)
        .set('Authorization', `Bearer ${reader.token}`)
        .expect(200);
      expect(list.body[0]).toMatchObject({ id: payment.id, status: 'SUCCEEDED' });
      expect(list.body[0].attempts[0].phoneMasked).toMatch(/\*/);
      await http()
        .post(`/api/v1/admin/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${reader.token}`)
        .send({ amountMinor: 100, reason: 'Goodwill' })
        .expect(403);
    });

    it('tracks partial and full refunds with two staff members', async () => {
      const { order, payment } = await paidOrder();
      const alice = await staffWithSession(app, `${run}-alice@example.com`, ['orders:refund']);
      const bob = await staffWithSession(app, `${run}-bob@example.com`, ['orders:refund']);
      const as = (token: string, path: string, body: object = {}) =>
        http().post(`/api/v1/admin/${path}`).set('Authorization', `Bearer ${token}`).send(body);

      const tooMuch = await as(alice.token, `payments/${payment.id}/refunds`, {
        amountMinor: payment.amountMinor + 100,
        reason: 'Too much',
      });
      expect(tooMuch.status).toBe(422);
      expect(tooMuch.body.error.code).toBe('REFUND_EXCEEDS_PAYMENT');

      const partial = await as(alice.token, `payments/${payment.id}/refunds`, {
        amountMinor: 50_000,
        reason: 'Damaged box',
      });
      expect(partial.status).toBe(201);
      // The amount held by an open refund cannot be requested again.
      const overlap = await as(alice.token, `payments/${payment.id}/refunds`, {
        amountMinor: payment.amountMinor - 50_000 + 100,
        reason: 'Overlap',
      });
      expect(overlap.body.error.code).toBe('REFUND_EXCEEDS_PAYMENT');

      const self = await as(alice.token, `refunds/${partial.body.id}/complete`, {
        providerReference: 'RFD123456',
      });
      expect(self.status).toBe(403);
      expect(self.body.error.code).toBe('SEPARATION_OF_DUTIES');
      const done = await as(bob.token, `refunds/${partial.body.id}/complete`, {
        providerReference: 'RFD123456',
      });
      expect(done.status).toBe(201);
      expect(done.body).toMatchObject({
        status: 'SUCCEEDED',
        approvedBy: `${run}-bob@example.com`,
      });
      expect(
        (
          await as(bob.token, `refunds/${partial.body.id}/complete`, {
            providerReference: 'RFD123456',
          })
        ).status,
      ).toBe(409);

      let row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('PARTIALLY_REFUNDED');
      expect(row.payments[0]).toMatchObject({
        status: 'PARTIALLY_REFUNDED',
        refundedMinor: 50_000,
      });

      const rest = await app.get(RefundService).request({
        paymentId: payment.id,
        amountMinor: payment.amountMinor - 50_000,
        reason: 'Order returned',
        requestedById: alice.userId,
      });
      await as(bob.token, `refunds/${rest.id}/complete`, { providerReference: 'RFD654321' }).expect(
        201,
      );
      row = await orderRow(order.orderNumber);
      expect(row.paymentStatus).toBe('REFUNDED');
      expect(row.payments[0]).toMatchObject({
        status: 'REFUNDED',
        refundedMinor: payment.amountMinor,
      });

      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'Refund', entityId: partial.body.id },
        select: { action: true },
      });
      expect(audit.map((a) => a.action).sort()).toEqual(['refund.completed', 'refund.requested']);
    });
  });
});
