import { customerMessageFor, stkStateFor } from './mpesa.types.js';
import { buildStkCallback, parseStkCallback } from './stk-callback.js';

describe('parseStkCallback', () => {
  it('reads a successful callback', () => {
    const body = buildStkCallback({
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'm-1',
      resultCode: 0,
      resultDesc: 'The service request is processed successfully.',
      amount: 1500,
      receipt: 'NLJ7RT61SV',
      phone: '254712345678',
    });
    expect(parseStkCallback(body)).toEqual({
      checkoutRequestId: 'ws_CO_1',
      merchantRequestId: 'm-1',
      resultCode: '0',
      resultDesc: 'The service request is processed successfully.',
      amount: 1500,
      receipt: 'NLJ7RT61SV',
      phone: '254712345678',
    });
  });

  it('reads a failure callback without metadata', () => {
    const parsed = parseStkCallback(
      buildStkCallback({
        checkoutRequestId: 'ws_CO_2',
        merchantRequestId: 'm',
        resultCode: 1032,
        resultDesc: 'Request cancelled by user',
      }),
    );
    expect(parsed).toMatchObject({ resultCode: '1032', amount: null, receipt: null });
  });

  it('rejects malformed bodies and ignores malformed receipts', () => {
    expect(parseStkCallback({})).toBeNull();
    expect(parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: '' } } })).toBeNull();
    const odd = buildStkCallback({
      checkoutRequestId: 'ws_CO_3',
      merchantRequestId: 'm',
      resultCode: 0,
      resultDesc: 'ok',
      amount: 10,
      receipt: '<script>',
    });
    expect(parseStkCallback(odd)?.receipt).toBeNull();
  });
});

describe('result codes', () => {
  it('maps codes to states', () => {
    expect(stkStateFor(0)).toBe('SUCCEEDED');
    expect(stkStateFor('1032')).toBe('CANCELLED');
    expect(stkStateFor('1037')).toBe('FAILED');
  });

  it('gives customers a plain message and never the raw provider text', () => {
    expect(customerMessageFor('PENDING', null)).toBeNull();
    expect(customerMessageFor('CANCELLED', '1032')).toMatch(/cancelled/);
    expect(customerMessageFor('FAILED', '1')).toMatch(/balance/);
    expect(customerMessageFor('FAILED', 'PUSH_FAILED')).toMatch(/could not send/);
    expect(customerMessageFor('TIMED_OUT', null)).toMatch(/in time/);
    expect(customerMessageFor('FAILED', '9999')).toBe('The M-Pesa payment was not completed.');
  });
});
