/**
 * Contract for a future card provider using hosted checkout (for example Pesapal, Flutterwave or
 * Paystack). Card details never touch our servers: the customer pays on the provider's page, and the
 * result arrives as a signed webhook that is verified, then confirmed with the provider's API before
 * the order is marked paid (the same trust model as M-Pesa). No provider is enabled yet.
 */
export const CARD_GATEWAY = Symbol('CARD_GATEWAY');

export interface HostedCheckoutRequest {
  orderNumber: string;
  amountMinor: number;
  currency: 'KES';
  customer: { email: string; name: string; phone: string };
  /** Where the provider sends the customer afterwards. Never proof of payment. */
  returnUrl: string;
  /** Unique per attempt so a retried request does not create a second charge. */
  idempotencyKey: string;
}

export interface HostedCheckoutSession {
  /** Provider's reference for this checkout, stored on the payment attempt. */
  sessionId: string;
  redirectUrl: string;
  expiresAt: Date;
}

export type CardPaymentState = 'SUCCEEDED' | 'FAILED' | 'PENDING';

export interface CardPaymentStatus {
  state: CardPaymentState;
  /** Provider transaction reference. */
  reference: string | null;
  amountMinor: number | null;
  currency: string | null;
}

export interface CardWebhookEvent {
  /** Provider's event id, used as the dedupe key. */
  eventId: string;
  sessionId: string;
}

export interface CardRefundResult {
  reference: string;
  state: 'SUCCEEDED' | 'PENDING' | 'FAILED';
}

export interface CardGateway {
  readonly name: string;
  createHostedCheckout(request: HostedCheckoutRequest): Promise<HostedCheckoutSession>;
  /** Verifies the signature over the exact raw body; returns null when it does not verify. */
  parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): CardWebhookEvent | null;
  /** Authoritative status, fetched from the provider's API. */
  getPaymentStatus(sessionId: string): Promise<CardPaymentStatus>;
  refund(reference: string, amountMinor: number, idempotencyKey: string): Promise<CardRefundResult>;
}
