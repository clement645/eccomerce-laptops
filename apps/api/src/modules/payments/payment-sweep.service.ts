import { Injectable } from '@nestjs/common';
import { OrderPaymentService } from '../orders/order-payment.service.js';
import { MpesaPaymentService } from './mpesa-payment.service.js';

export interface PaymentSweepResult {
  checked: number;
  settled: number;
  released: number;
}

/**
 * The one place that resolves unpaid orders. Order matters: pending M-Pesa prompts are checked with
 * Safaricom first, and only then are expired stock holds released, so an order that was paid while
 * the API was asleep is never cancelled. Everything it touches is in Postgres and every update is
 * conditional, so running it twice (or from two processes during a deploy) changes nothing extra.
 */
@Injectable()
export class PaymentSweepService {
  constructor(
    private readonly mpesa: MpesaPaymentService,
    private readonly orders: OrderPaymentService,
  ) {}

  async sweep(budgetMs = 25_000): Promise<PaymentSweepResult> {
    const deadline = Date.now() + budgetMs;
    let checked = 0;
    let settled = 0;
    // Batches of 50; after a long sleep there may be more due at once.
    for (;;) {
      const batch = await this.mpesa.reconcileDue();
      checked += batch.checked;
      settled += batch.settled;
      if (batch.checked < 50 || Date.now() >= deadline) break;
    }
    const released = await this.orders.releaseExpired();
    return { checked, settled, released };
  }
}
