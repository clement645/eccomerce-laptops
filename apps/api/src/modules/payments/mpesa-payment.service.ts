import { createHash, timingSafeEqual } from 'node:crypto';
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mpesaMode, type ApiEnv } from '@repo/configuration';
import { Prisma } from '@repo/database';
import { MAX_MPESA_ATTEMPTS } from '@repo/shared-types';
import { API_ENV } from '../../config/env.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { randomToken } from '../auth/crypto/tokens.js';
import { OrderPaymentService } from '../orders/order-payment.service.js';
import {
  MPESA_GATEWAY,
  MpesaGatewayError,
  type MpesaGateway,
  type StkQueryResult,
} from './mpesa/mpesa.types.js';
import { SimulatedMpesaGateway, type SimulatedOutcome } from './mpesa/simulated.gateway.js';
import {
  buildStkCallback,
  parseStkCallback,
  type ParsedStkCallback,
} from './mpesa/stk-callback.js';
import { RefundService } from './refund.service.js';

const TX = { maxWait: 10_000, timeout: 30_000 } as const;
/** How long one STK prompt is waited for. Safaricom's prompt itself times out in about a minute. */
export const ATTEMPT_WINDOW_MS = 3 * 60_000;
/** First STK Query if no callback has arrived by then. */
const FIRST_QUERY_DELAY_MS = 45_000;
/** A push that was never sent (the process stopped mid-way) is given up after this long. */
const STUCK_INITIATED_MS = 2 * 60_000;
/**
 * A prompt that timed out is checked once more after this long. It catches payments whose callback
 * never arrived (for example while the API was asleep) and settles them, or queues a refund.
 */
const FINAL_CHECK_DELAY_MS = 10 * 60_000;
/** If Safaricom can't be asked for this long, stop and leave the attempt for manual review. */
const MAX_UNKNOWN_MS = 24 * 60 * 60_000;

export const CALLBACK_PATH = 'payments/mpesa/callback';

type ReconcileOutcome = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'TIMED_OUT' | 'SKIPPED';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Lipa na M-Pesa Online. Trust model: a callback is only a hint. Whatever it says, the payment is
 * settled from Safaricom's STK Query, called over our authenticated connection, so a forged callback
 * cannot mark an order paid. The callback is used for the receipt number, and only when its amount
 * matches what was requested.
 */
@Injectable()
export class MpesaPaymentService {
  private readonly logger = new Logger(MpesaPaymentService.name);
  readonly mode: ReturnType<typeof mpesaMode>;
  private readonly callbackUrl: string;
  private readonly callbackSecretHash: Buffer | null;
  private readonly allowedIps: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrderPaymentService,
    private readonly refunds: RefundService,
    @Inject(MPESA_GATEWAY) private readonly gateway: MpesaGateway,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.mode = mpesaMode(env);
    const secret = env.MPESA_CALLBACK_SECRET;
    this.callbackSecretHash = secret ? sha256(secret) : null;
    const base = (env.MPESA_CALLBACK_BASE_URL ?? env.API_PUBLIC_URL).replace(/\/$/, '');
    this.callbackUrl = `${base}/api/v1/${CALLBACK_PATH}/${secret ?? 'unset'}`;
    this.allowedIps = env.MPESA_ALLOWED_IPS;
  }

  get available(): boolean {
    return this.mode !== 'disabled';
  }

  get simulated(): boolean {
    return this.mode === 'simulated';
  }

  /** Constant-time check of the secret path segment on the callback URL. */
  isCallbackSecret(candidate: string): boolean {
    return (
      this.mode === 'daraja' &&
      this.callbackSecretHash !== null &&
      timingSafeEqual(sha256(candidate), this.callbackSecretHash)
    );
  }

  /** Sends the STK Push for an attempt created in the INITIATED state. Never throws for M-Pesa errors. */
  async startAttempt(attemptId: string, phone: string): Promise<void> {
    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { payment: { include: { order: { select: { orderNumber: true } } } } },
    });
    if (attempt?.status !== 'INITIATED') return;
    try {
      const push = await this.gateway.stkPush({
        phone,
        amount: attempt.amountMinor / 100,
        // At most 12 characters: EL-2026-001001 becomes EL2026001001.
        accountReference: attempt.payment.order.orderNumber.replace(/-/g, ''),
        description: 'Order payment',
        callbackUrl: this.callbackUrl,
      });
      const now = Date.now();
      await this.prisma.client.paymentAttempt.updateMany({
        where: { id: attemptId, status: 'INITIATED' },
        data: {
          status: 'PENDING',
          checkoutRequestId: push.checkoutRequestId,
          merchantRequestId: push.merchantRequestId,
          expiresAt: new Date(now + ATTEMPT_WINDOW_MS),
          nextQueryAt: new Date(now + FIRST_QUERY_DELAY_MS),
        },
      });
    } catch (error) {
      const gatewayError = error instanceof MpesaGatewayError ? error : null;
      this.logger.warn(
        `STK Push failed for attempt ${attemptId}: ${gatewayError?.code ?? 'ERROR'} ${(error as Error).message}` +
          (gatewayError?.sent ? ' (the request may have reached Safaricom)' : ''),
      );
      await this.prisma.client.paymentAttempt.updateMany({
        where: { id: attemptId, status: 'INITIATED' },
        data: {
          status: 'FAILED',
          resultCode: 'PUSH_FAILED',
          resultDesc: (gatewayError?.code ?? 'ERROR').slice(0, 100),
          completedAt: new Date(),
        },
      });
    }
  }

  /** Customer asks for a new prompt (wrong PIN, cancelled, timed out, or a different phone). */
  async retry(
    orderNumber: string,
    trackingToken: string,
    phone: string | undefined,
  ): Promise<void> {
    const order = await this.payableOrder(orderNumber, trackingToken);
    if (order.paymentStatus !== 'PENDING')
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This order is no longer awaiting payment',
      });
    const holdEnds = Math.min(...order.reservations.map((r) => r.expiresAt.getTime()));
    if (!order.reservations.length || holdEnds <= Date.now())
      throw new ConflictException({
        code: 'PAYMENT_WINDOW_CLOSED',
        message: 'The time to pay for this order has ended',
      });
    const payment = order.payments.find((p) => p.status === 'PENDING');
    if (!payment)
      throw new ConflictException({ code: 'ORDER_NOT_PAYABLE', message: 'Nothing to pay' });

    // A prompt still in progress is checked first; it may have just been paid.
    const open = payment.attempts.find((a) => a.status === 'INITIATED' || a.status === 'PENDING');
    if (open) {
      const outcome = open.checkoutRequestId ? await this.reconcile(open.id) : 'PENDING';
      if (outcome === 'SUCCEEDED') return;
      if (outcome === 'PENDING' || outcome === 'SKIPPED')
        throw new ConflictException({
          code: 'PAYMENT_IN_PROGRESS',
          message: 'Your previous M-Pesa prompt is still open. Complete or cancel it first.',
        });
    }
    if (payment.attempts.length >= MAX_MPESA_ATTEMPTS)
      throw new ConflictException({
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Too many payment attempts for this order. Please contact us.',
      });

    const attempt = await this.prisma.client.paymentAttempt
      .create({
        data: {
          paymentId: payment.id,
          // Unique per attempt number, so two simultaneous retries create one prompt.
          idempotencyKey: `${order.id}:mpesa:${payment.attempts.length + 1}`,
          amountMinor: payment.amountMinor,
          phoneMasked: maskPhone(phone ?? order.phone),
          expiresAt: new Date(Date.now() + ATTEMPT_WINDOW_MS),
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException({
            code: 'PAYMENT_IN_PROGRESS',
            message: 'A new M-Pesa prompt is already on its way',
          });
        throw error;
      });
    await this.startAttempt(attempt.id, phone ?? order.phone);
  }

  /**
   * Records a callback and settles the attempt it names (via STK Query). Duplicate deliveries are
   * stored once and ignored. `trusted` skips the source IP allowlist (simulated provider only).
   */
  async handleCallback(body: unknown, sourceIp: string | null, trusted = false): Promise<void> {
    const parsed = parseStkCallback(body);
    const payload = (body ?? {}) as Prisma.InputJsonValue;
    if (!parsed) {
      await this.recordEvent({
        dedupeKey: `invalid:${sha256(JSON.stringify(body ?? null))
          .toString('hex')
          .slice(0, 40)}`,
        payload,
        sourceIp,
        attemptId: null,
        processingError: 'INVALID_PAYLOAD',
      });
      return;
    }
    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { checkoutRequestId: parsed.checkoutRequestId },
      select: { id: true },
    });
    const ipRejected =
      !trusted && this.allowedIps.length > 0 && !this.allowedIps.includes(sourceIp ?? '');
    const eventId = await this.recordEvent({
      dedupeKey: `stk:${parsed.checkoutRequestId}:${parsed.resultCode}`,
      payload,
      sourceIp,
      attemptId: attempt?.id ?? null,
      processingError: ipRejected ? 'SOURCE_IP_REJECTED' : attempt ? null : 'UNMATCHED',
    });
    if (!eventId) return; // duplicate delivery
    if (ipRejected) {
      this.logger.warn(`Ignored M-Pesa callback from unlisted address ${sourceIp ?? 'unknown'}`);
      return;
    }
    if (!attempt) {
      // Nothing we started. Kept for manual reconciliation (e.g. a push whose reply was lost).
      this.logger.warn(`M-Pesa callback for unknown CheckoutRequestID ${parsed.checkoutRequestId}`);
      return;
    }
    await this.reconcile(attempt.id, { callback: parsed, eventId });
  }

  /** Asks Safaricom for the attempt's status and applies it. Safe to call any number of times. */
  async reconcile(
    attemptId: string,
    hint?: { callback: ParsedStkCallback; eventId: string },
  ): Promise<ReconcileOutcome> {
    const attempt = await this.prisma.client.paymentAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt?.checkoutRequestId) return 'SKIPPED';
    if (attempt.status === 'SUCCEEDED') {
      if (hint) await this.closeEvent(hint.eventId, 'ALREADY_SETTLED');
      return 'SUCCEEDED';
    }

    let result: StkQueryResult;
    let queryFailed = false;
    try {
      result = await this.gateway.stkQuery(attempt.checkoutRequestId);
    } catch (error) {
      this.logger.warn(`STK Query failed for attempt ${attemptId}: ${(error as Error).message}`);
      result = { state: 'PENDING', resultCode: null, resultDesc: null };
      queryFailed = true;
    }
    const now = new Date();

    if (result.state === 'SUCCEEDED') {
      const callback = hint?.callback ?? (await this.latestSuccessCallback(attemptId));
      const amountMatches = callback?.amount === attempt.amountMinor / 100;
      const receipt = callback?.resultCode === '0' && amountMatches ? callback.receipt : null;
      if (hint && hint.callback.resultCode === '0' && !amountMatches) {
        this.logger.warn(`M-Pesa callback amount mismatch on attempt ${attemptId}`);
        await this.closeEvent(hint.eventId, 'AMOUNT_MISMATCH');
      } else if (hint) await this.closeEvent(hint.eventId, null);
      await this.settleSuccess(attemptId, receipt, result);
      return 'SUCCEEDED';
    }

    if (result.state === 'FAILED' || result.state === 'CANCELLED') {
      if (hint?.callback.resultCode === '0') {
        // The callback claimed success but Safaricom says otherwise: possibly forged.
        this.logger.warn(`M-Pesa callback for attempt ${attemptId} not confirmed by STK Query`);
        await this.closeEvent(hint.eventId, 'NOT_CONFIRMED');
      } else if (hint) await this.closeEvent(hint.eventId, null);
      await this.prisma.client.paymentAttempt.updateMany({
        where: { id: attemptId, status: { in: ['INITIATED', 'PENDING', 'TIMED_OUT'] } },
        data: {
          status: result.state,
          resultCode: result.resultCode,
          resultDesc: result.resultDesc?.slice(0, 500) ?? null,
          completedAt: now,
          nextQueryAt: null,
        },
      });
      return result.state;
    }

    // Still processing (or the query failed). The callback event stays open until the next check.
    if (attempt.status === 'TIMED_OUT') {
      // The final check also found nothing: stop asking. A late callback can still settle it.
      await this.prisma.client.paymentAttempt.updateMany({
        where: { id: attemptId, status: 'TIMED_OUT' },
        data: { nextQueryAt: null },
      });
      return 'TIMED_OUT';
    }
    if (attempt.status !== 'PENDING') return 'PENDING';
    const tooOld = now.getTime() - attempt.createdAt.getTime() > MAX_UNKNOWN_MS;
    // Only Safaricom saying "still processing" past the window counts as a timeout. A failed query
    // means the outcome is unknown, so the attempt stays pending (and its order is not cancelled).
    if ((attempt.expiresAt <= now && !queryFailed) || tooOld) {
      await this.prisma.client.paymentAttempt.updateMany({
        where: { id: attemptId, status: 'PENDING' },
        data: {
          status: 'TIMED_OUT',
          completedAt: now,
          nextQueryAt: tooOld ? null : new Date(now.getTime() + FINAL_CHECK_DELAY_MS),
        },
      });
      if (tooOld)
        this.logger.error(
          `M-Pesa attempt ${attemptId}: outcome unknown after 24 hours; check it by hand`,
        );
      return 'TIMED_OUT';
    }
    const delay = Math.min(15_000 * 2 ** attempt.queryCount, 120_000);
    await this.prisma.client.paymentAttempt.updateMany({
      where: { id: attemptId, status: 'PENDING' },
      data: { queryCount: { increment: 1 }, nextQueryAt: new Date(now.getTime() + delay) },
    });
    return 'PENDING';
  }

  /**
   * Sweep: checks prompts that have had no answer yet (and timed-out prompts due their final check),
   * and gives up on pushes that never went out. Postgres holds all the state, so this is safe to run
   * from any process, any number of times.
   */
  async reconcileDue(now = new Date()): Promise<{ checked: number; settled: number }> {
    await this.prisma.client.paymentAttempt.updateMany({
      where: {
        status: 'INITIATED',
        createdAt: { lte: new Date(now.getTime() - STUCK_INITIATED_MS) },
      },
      data: {
        status: 'FAILED',
        resultCode: 'PUSH_FAILED',
        resultDesc: 'NOT_SENT',
        completedAt: now,
      },
    });
    const due = await this.prisma.client.paymentAttempt.findMany({
      where: {
        status: { in: ['PENDING', 'TIMED_OUT'] },
        checkoutRequestId: { not: null },
        nextQueryAt: { lte: now },
      },
      orderBy: { nextQueryAt: 'asc' },
      select: { id: true },
      take: 50,
    });
    let settled = 0;
    for (const { id } of due) {
      try {
        const outcome = await this.reconcile(id);
        if (outcome === 'SUCCEEDED' || outcome === 'FAILED' || outcome === 'CANCELLED') settled++;
      } catch (error) {
        this.logger.error(`Could not reconcile attempt ${id}: ${(error as Error).message}`);
      }
    }
    return { checked: due.length, settled };
  }

  /** Development only: answer the latest prompt as if the customer had approved or cancelled it. */
  async simulate(
    orderNumber: string,
    trackingToken: string,
    outcome: SimulatedOutcome,
  ): Promise<void> {
    if (!(this.gateway instanceof SimulatedMpesaGateway)) throw new NotFoundException();
    const order = await this.payableOrder(orderNumber, trackingToken);
    const attempt = order.payments
      .flatMap((p) => p.attempts)
      .find((a) => a.checkoutRequestId && a.status !== 'SUCCEEDED');
    if (!attempt?.checkoutRequestId)
      throw new ConflictException({
        code: 'NO_OPEN_PROMPT',
        message: 'There is no M-Pesa prompt to answer. Request a new one first.',
      });
    await this.gateway.setOutcome(attempt.checkoutRequestId, outcome);
    const success = outcome === 'success';
    await this.handleCallback(
      buildStkCallback({
        checkoutRequestId: attempt.checkoutRequestId,
        merchantRequestId: attempt.merchantRequestId ?? '',
        resultCode: success ? 0 : 1032,
        resultDesc: success
          ? 'The service request is processed successfully.'
          : 'Request cancelled by user',
        amount: attempt.amountMinor / 100,
        receipt: `SIM${randomToken(8)
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, 'X')
          .slice(0, 7)}`,
        phone: order.phone,
      }),
      null,
      true,
    );
  }

  private async settleSuccess(
    attemptId: string,
    receipt: string | null,
    result: StkQueryResult,
  ): Promise<void> {
    const outcome = await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      // Claiming the attempt makes settlement exactly-once, even if a callback and the worker race.
      const claimed = await tx.paymentAttempt.updateMany({
        where: { id: attemptId, status: { not: 'SUCCEEDED' } },
        data: {
          status: 'SUCCEEDED',
          providerReference: receipt,
          resultCode: result.resultCode,
          resultDesc: result.resultDesc?.slice(0, 500) ?? null,
          completedAt: now,
          nextQueryAt: null,
        },
      });
      if (claimed.count !== 1) return null;
      const attempt = await tx.paymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: { payment: { select: { orderId: true } } },
      });
      const orderId = attempt.payment.orderId;
      if (await this.orders.confirmPaidTx(tx, orderId, receipt, attemptId))
        return { orderId, paid: true };

      // Money arrived for an order that is already paid or was cancelled. Keep it on record and
      // queue a full refund for staff to send.
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { paymentStatus: true, orderNumber: true },
      });
      const reason =
        order.paymentStatus === 'PAID'
          ? 'Duplicate M-Pesa payment for an order that was already paid'
          : 'M-Pesa payment received after the order was cancelled';
      const extra = await tx.payment.create({
        data: {
          orderId,
          provider: 'MPESA',
          status: 'SUCCEEDED',
          amountMinor: attempt.amountMinor,
          providerReference: receipt,
        },
      });
      await this.refunds.requestTx(tx, {
        paymentId: extra.id,
        amountMinor: attempt.amountMinor,
        reason,
        requestedById: null,
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          field: 'PAYMENT',
          fromStatus: order.paymentStatus,
          toStatus: order.paymentStatus,
          note: `${reason}${receipt ? ` (${receipt})` : ''}. Refund requested.`,
          isCustomerVisible: false,
        },
      });
      this.logger.warn(`${reason}: order ${order.orderNumber}, refund requested`);
      return { orderId, paid: false };
    }, TX);
    if (outcome?.paid) await this.orders.notifyChange(outcome.orderId, 'paid');
  }

  private async payableOrder(orderNumber: string, trackingToken: string) {
    const order = await this.prisma.client.order.findUnique({
      where: { orderNumber },
      include: {
        reservations: { where: { status: 'ACTIVE' }, select: { expiresAt: true } },
        payments: {
          where: { provider: 'MPESA' },
          orderBy: { createdAt: 'asc' },
          include: { attempts: { orderBy: { createdAt: 'desc' } } },
        },
      },
    });
    const tokenMatches =
      order !== null && timingSafeEqual(sha256(order.trackingToken), sha256(trackingToken));
    if (!order || !tokenMatches || order.paymentProvider !== 'MPESA')
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return order;
  }

  private async latestSuccessCallback(attemptId: string): Promise<ParsedStkCallback | null> {
    const event = await this.prisma.client.paymentEvent.findFirst({
      where: { paymentAttemptId: attemptId, eventType: 'CALLBACK', dedupeKey: { endsWith: ':0' } },
      orderBy: { receivedAt: 'desc' },
    });
    if (!event) return null;
    if (!event.processedAt) await this.closeEvent(event.id, null);
    return parseStkCallback(event.payload);
  }

  /** Stores a provider event once. Returns its id, or null for a duplicate delivery. */
  private async recordEvent(input: {
    dedupeKey: string;
    payload: Prisma.InputJsonValue;
    sourceIp: string | null;
    attemptId: string | null;
    processingError: string | null;
  }): Promise<string | null> {
    try {
      const event = await this.prisma.client.paymentEvent.create({
        data: {
          provider: 'MPESA',
          eventType: 'CALLBACK',
          dedupeKey: input.dedupeKey,
          payload: input.payload,
          sourceIp: input.sourceIp,
          paymentAttemptId: input.attemptId,
          processingError: input.processingError,
          processedAt: input.processingError ? new Date() : null,
        },
      });
      return event.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return null;
      throw error;
    }
  }

  private async closeEvent(eventId: string, processingError: string | null): Promise<void> {
    await this.prisma.client.paymentEvent.update({
      where: { id: eventId },
      data: { processedAt: new Date(), processingError },
    });
  }
}

export function maskPhone(phone: string): string {
  return phone.length > 6
    ? `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`
    : '****';
}
