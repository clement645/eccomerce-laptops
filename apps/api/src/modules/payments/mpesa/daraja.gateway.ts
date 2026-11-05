import {
  MpesaGatewayError,
  stkStateFor,
  type MpesaGateway,
  type StkPushRequest,
  type StkPushResult,
  type StkQueryResult,
} from './mpesa.types.js';

export interface DarajaConfig {
  environment: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  transactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  /** Receiving party: the till for Buy Goods, otherwise the short code. */
  partyB: string;
  timeoutMs?: number;
}

const BASE_URL = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
} as const;

/** Daraja answers STK Query with this while the customer is still on the prompt. */
const STILL_PROCESSING = '500.001.1001';

/** Daraja timestamps are East Africa Time (UTC+3, no daylight saving): YYYYMMDDHHmmss. */
export function darajaTimestamp(now = new Date()): string {
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${eat.getUTCFullYear()}${pad(eat.getUTCMonth() + 1)}${pad(eat.getUTCDate())}` +
    `${pad(eat.getUTCHours())}${pad(eat.getUTCMinutes())}${pad(eat.getUTCSeconds())}`
  );
}

export function darajaPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
}

interface DarajaError {
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Safaricom Daraja client for Lipa na M-Pesa Online (STK Push and STK Query).
 * Credentials never leave the API; the access token is cached until shortly before it expires.
 */
export class DarajaMpesaGateway implements MpesaGateway {
  readonly name = 'daraja' as const;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private token: { value: string; expiresAt: number } | null = null;
  private pendingToken: Promise<string> | null = null;

  constructor(
    private readonly config: DarajaConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.baseUrl = BASE_URL[config.environment];
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async stkPush(request: StkPushRequest): Promise<StkPushResult> {
    if (!Number.isInteger(request.amount) || request.amount < 1)
      throw new MpesaGatewayError(
        'Amount must be a whole number of shillings',
        'BAD_AMOUNT',
        false,
      );
    const timestamp = darajaTimestamp(this.now());
    const body = {
      BusinessShortCode: this.config.shortCode,
      Password: darajaPassword(this.config.shortCode, this.config.passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: this.config.transactionType,
      Amount: request.amount,
      PartyA: request.phone,
      PartyB: this.config.partyB,
      PhoneNumber: request.phone,
      CallBackURL: request.callbackUrl,
      AccountReference: request.accountReference.slice(0, 12),
      TransactionDesc: request.description.slice(0, 13),
    };
    const { status, json } = await this.post('/mpesa/stkpush/v1/processrequest', body);
    const data = json as {
      ResponseCode?: string;
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
    } & DarajaError;
    if (status === 200 && data.ResponseCode === '0' && data.CheckoutRequestID) {
      return {
        checkoutRequestId: data.CheckoutRequestID,
        merchantRequestId: data.MerchantRequestID ?? '',
      };
    }
    throw new MpesaGatewayError(
      data.errorMessage ?? `STK Push rejected (HTTP ${status})`,
      data.errorCode ?? `HTTP_${status}`,
      false,
    );
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const timestamp = darajaTimestamp(this.now());
    const { status, json } = await this.post('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: this.config.shortCode,
      Password: darajaPassword(this.config.shortCode, this.config.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });
    const data = json as { ResultCode?: string | number; ResultDesc?: string } & DarajaError;
    if (status === 200 && data.ResultCode !== undefined && data.ResultCode !== null) {
      return {
        state: stkStateFor(data.ResultCode),
        resultCode: String(data.ResultCode),
        resultDesc: data.ResultDesc ?? null,
      };
    }
    if (data.errorCode === STILL_PROCESSING)
      return { state: 'PENDING', resultCode: null, resultDesc: data.errorMessage ?? null };
    throw new MpesaGatewayError(
      data.errorMessage ?? `STK Query failed (HTTP ${status})`,
      data.errorCode ?? `HTTP_${status}`,
      false,
    );
  }

  private async post(
    path: string,
    body: unknown,
    retried = false,
  ): Promise<{ status: number; json: unknown }> {
    const token = await this.accessToken();
    const res = await this.request(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && !retried) {
      // Token revoked or expired early: fetch a fresh one once.
      this.token = null;
      return this.post(path, body, true);
    }
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now().getTime()) return this.token.value;
    // Concurrent callers share one token request.
    this.pendingToken ??= this.fetchToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async fetchToken(): Promise<string> {
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString(
      'base64',
    );
    const res = await this.request(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${basic}` } },
      false,
    );
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: string | number;
    };
    if (!res.ok || !data.access_token)
      throw new MpesaGatewayError(
        `Daraja authentication failed (HTTP ${res.status})`,
        'AUTH_FAILED',
        false,
      );
    const ttlSeconds = Number(data.expires_in) || 3599;
    // Renew a minute early so a token never expires mid-request.
    this.token = {
      value: data.access_token,
      expiresAt: this.now().getTime() + Math.max(60, ttlSeconds - 60) * 1000,
    };
    return data.access_token;
  }

  private async request(url: string, init: RequestInit, mayHaveSent = true): Promise<Response> {
    try {
      return await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause?.code;
      // A refused or unresolvable connection never reached Safaricom; a timeout may have.
      const neverSent = cause === 'ECONNREFUSED' || cause === 'ENOTFOUND' || cause === 'EAI_AGAIN';
      throw new MpesaGatewayError(
        `M-Pesa request failed: ${(error as Error).message}`,
        (error as Error).name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK',
        mayHaveSent && !neverSent,
      );
    }
  }
}
