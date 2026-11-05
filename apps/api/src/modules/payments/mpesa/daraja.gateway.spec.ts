import { DarajaMpesaGateway, darajaPassword, darajaTimestamp } from './daraja.gateway.js';
import { MpesaGatewayError } from './mpesa.types.js';

const config = {
  environment: 'sandbox' as const,
  consumerKey: 'key',
  consumerSecret: 'secret',
  shortCode: '174379',
  passkey: 'passkey',
  transactionType: 'CustomerPayBillOnline' as const,
  partyB: '174379',
};
// 2026-10-30 09:15:05 UTC is 12:15:05 in Nairobi.
const NOW = new Date('2026-10-30T09:15:05Z');

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch stand-in that answers token requests and replays queued API responses. */
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  let tokens = 0;
  const fn = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes('/oauth/')) {
      tokens++;
      return new Response(JSON.stringify({ access_token: `token-${tokens}`, expires_in: '3599' }));
    }
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return new Response(JSON.stringify(next.body), { status: next.status });
  }) as unknown as typeof fetch;
  return { fn, calls, tokenRequests: () => tokens };
}

const bodyOf = (call: Call) => JSON.parse(call.init.body as string) as Record<string, unknown>;

describe('Daraja helpers', () => {
  it('formats timestamps in East Africa Time', () => {
    expect(darajaTimestamp(NOW)).toBe('20261030121505');
    expect(darajaTimestamp(new Date('2026-12-31T22:00:00Z'))).toBe('20270101010000');
  });

  it('builds the STK password from short code, passkey and timestamp', () => {
    expect(Buffer.from(darajaPassword('174379', 'pk', '20261030121505'), 'base64').toString()).toBe(
      '174379pk20261030121505',
    );
  });
});

describe('DarajaMpesaGateway', () => {
  it('sends a well-formed STK Push and reuses the access token', async () => {
    const fetch = fakeFetch([
      {
        status: 200,
        body: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_1', MerchantRequestID: 'm-1' },
      },
      {
        status: 200,
        body: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_2', MerchantRequestID: 'm-2' },
      },
    ]);
    const gateway = new DarajaMpesaGateway(config, fetch.fn, () => NOW);
    const result = await gateway.stkPush({
      phone: '254712345678',
      amount: 1500,
      accountReference: 'EL2026001001-extra',
      description: 'Order payment for you',
      callbackUrl: 'https://api.example.co.ke/api/v1/payments/mpesa/callback/s',
    });
    expect(result).toEqual({ checkoutRequestId: 'ws_CO_1', merchantRequestId: 'm-1' });
    const push = fetch.calls[1]!;
    expect(push.url).toBe('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest');
    expect((push.init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
    expect(bodyOf(push)).toEqual({
      BusinessShortCode: '174379',
      Password: darajaPassword('174379', 'passkey', '20261030121505'),
      Timestamp: '20261030121505',
      TransactionType: 'CustomerPayBillOnline',
      Amount: 1500,
      PartyA: '254712345678',
      PartyB: '174379',
      PhoneNumber: '254712345678',
      CallBackURL: 'https://api.example.co.ke/api/v1/payments/mpesa/callback/s',
      AccountReference: 'EL2026001001',
      TransactionDesc: 'Order payment',
    });
    await gateway.stkPush({
      phone: '254712345678',
      amount: 1,
      accountReference: 'X',
      description: 'Y',
      callbackUrl: 'https://x',
    });
    expect(fetch.tokenRequests()).toBe(1);
  });

  it('refreshes the token once when Daraja answers 401', async () => {
    const fetch = fakeFetch([
      { status: 401, body: {} },
      { status: 200, body: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_3' } },
    ]);
    const gateway = new DarajaMpesaGateway(config, fetch.fn, () => NOW);
    await expect(
      gateway.stkPush({
        phone: '254712345678',
        amount: 10,
        accountReference: 'A',
        description: 'B',
        callbackUrl: 'https://x',
      }),
    ).resolves.toMatchObject({ checkoutRequestId: 'ws_CO_3' });
    expect(fetch.tokenRequests()).toBe(2);
  });

  it('reports rejected pushes as errors that were not sent', async () => {
    const fetch = fakeFetch([
      {
        status: 400,
        body: { errorCode: '400.002.02', errorMessage: 'Bad Request - Invalid PhoneNumber' },
      },
    ]);
    const gateway = new DarajaMpesaGateway(config, fetch.fn, () => NOW);
    const error = await gateway
      .stkPush({
        phone: '254700000000',
        amount: 10,
        accountReference: 'A',
        description: 'B',
        callbackUrl: 'https://x',
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MpesaGatewayError);
    expect(error).toMatchObject({ code: '400.002.02', sent: false });
  });

  it('refuses fractional amounts before calling Safaricom', async () => {
    const fetch = fakeFetch([]);
    const gateway = new DarajaMpesaGateway(config, fetch.fn, () => NOW);
    await expect(
      gateway.stkPush({
        phone: '254712345678',
        amount: 10.5,
        accountReference: 'A',
        description: 'B',
        callbackUrl: 'https://x',
      }),
    ).rejects.toMatchObject({ code: 'BAD_AMOUNT' });
    expect(fetch.calls).toHaveLength(0);
  });

  it('treats a timeout as possibly sent', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    let n = 0;
    const fn = (async (url: string) => {
      if (url.includes('/oauth/'))
        return new Response(JSON.stringify({ access_token: 't', expires_in: 3599 }));
      n++;
      throw timeout;
    }) as unknown as typeof fetch;
    const gateway = new DarajaMpesaGateway(config, fn, () => NOW);
    await expect(
      gateway.stkPush({
        phone: '254712345678',
        amount: 10,
        accountReference: 'A',
        description: 'B',
        callbackUrl: 'https://x',
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT', sent: true });
    expect(n).toBe(1);
  });

  it('maps STK Query results, including "still processing"', async () => {
    const fetch = fakeFetch([
      {
        status: 200,
        body: { ResponseCode: '0', ResultCode: '0', ResultDesc: 'processed successfully' },
      },
      {
        status: 200,
        body: { ResponseCode: '0', ResultCode: '1032', ResultDesc: 'Request cancelled by user' },
      },
      { status: 200, body: { ResponseCode: '0', ResultCode: 2001, ResultDesc: 'wrong PIN' } },
      {
        status: 500,
        body: { errorCode: '500.001.1001', errorMessage: 'The transaction is being processed' },
      },
      { status: 500, body: { errorCode: '500.003.02', errorMessage: 'System is busy' } },
    ]);
    const gateway = new DarajaMpesaGateway(config, fetch.fn, () => NOW);
    expect(await gateway.stkQuery('ws_CO_1')).toMatchObject({
      state: 'SUCCEEDED',
      resultCode: '0',
    });
    expect(await gateway.stkQuery('ws_CO_1')).toMatchObject({
      state: 'CANCELLED',
      resultCode: '1032',
    });
    expect(await gateway.stkQuery('ws_CO_1')).toMatchObject({
      state: 'FAILED',
      resultCode: '2001',
    });
    expect(await gateway.stkQuery('ws_CO_1')).toMatchObject({ state: 'PENDING' });
    await expect(gateway.stkQuery('ws_CO_1')).rejects.toBeInstanceOf(MpesaGatewayError);
    expect(bodyOf(fetch.calls[1]!)).toMatchObject({
      BusinessShortCode: '174379',
      CheckoutRequestID: 'ws_CO_1',
    });
  });
});
