/** Injection token for the active M-Pesa gateway (Daraja, simulated, or a test fake). */
export const MPESA_GATEWAY = Symbol('MPESA_GATEWAY');

export interface StkPushRequest {
  /** 2547XXXXXXXX / 2541XXXXXXXX */
  phone: string;
  /** Whole shillings. */
  amount: number;
  /** Shown on the customer's prompt and statement; at most 12 characters. */
  accountReference: string;
  /** At most 13 characters. */
  description: string;
  callbackUrl: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
}

/** Final or interim state of an STK Push, as reported by Safaricom's STK Query. */
export type StkState = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PENDING';

export interface StkQueryResult {
  state: StkState;
  resultCode: string | null;
  resultDesc: string | null;
}

export interface MpesaGateway {
  readonly name: 'daraja' | 'simulated' | 'disabled' | 'test';
  stkPush(request: StkPushRequest): Promise<StkPushResult>;
  /** Authoritative status of a push. Callbacks are only hints; this decides. */
  stkQuery(checkoutRequestId: string): Promise<StkQueryResult>;
}

/**
 * A failed call to M-Pesa. `sent` is true when the request may have reached Safaricom (a timeout or
 * dropped connection after sending), so a prompt might still appear on the customer's phone.
 */
export class MpesaGatewayError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly sent: boolean,
  ) {
    super(message);
    this.name = 'MpesaGatewayError';
  }
}

/** Maps an STK result code to a state. Codes from Safaricom's Daraja documentation. */
export function stkStateFor(resultCode: string | number): Exclude<StkState, 'PENDING'> {
  const code = String(resultCode);
  if (code === '0') return 'SUCCEEDED';
  if (code === '1032') return 'CANCELLED';
  return 'FAILED';
}

/** What the customer sees when an attempt does not succeed. Never shows raw provider text. */
export function customerMessageFor(status: string, resultCode: string | null): string | null {
  if (status === 'SUCCEEDED' || status === 'PENDING' || status === 'INITIATED') return null;
  if (status === 'TIMED_OUT') return 'We did not get a response from M-Pesa in time.';
  switch (resultCode) {
    case '1032':
      return 'The M-Pesa prompt was cancelled.';
    case '1037':
      return 'We could not reach your phone. Make sure it is on and unlocked, then try again.';
    case '1':
      return 'Your M-Pesa balance was not enough for this payment.';
    case '2001':
      return 'The M-Pesa PIN entered was incorrect.';
    case '1019':
      return 'The M-Pesa prompt expired before it was completed.';
    case '1001':
      return 'Another M-Pesa transaction is in progress on your phone. Wait a moment, then try again.';
    case 'PUSH_FAILED':
      return 'We could not send the M-Pesa prompt.';
    default:
      return 'The M-Pesa payment was not completed.';
  }
}
