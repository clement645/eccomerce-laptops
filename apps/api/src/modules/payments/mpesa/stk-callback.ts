import { z } from 'zod';

const metadataItem = z.object({
  Name: z.string(),
  Value: z.union([z.string(), z.number()]).optional(),
});

/** Shape of the STK Push result Safaricom posts to the callback URL. */
export const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().max(100),
      CheckoutRequestID: z.string().min(1).max(100),
      ResultCode: z.union([z.number(), z.string()]),
      ResultDesc: z.string().max(500).optional(),
      CallbackMetadata: z.object({ Item: z.array(metadataItem).max(20) }).optional(),
    }),
  }),
});

export interface ParsedStkCallback {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: string;
  resultDesc: string | null;
  /** Present on success callbacks only. Untrusted until STK Query confirms the payment. */
  amount: number | null;
  receipt: string | null;
  phone: string | null;
}

const RECEIPT = /^[A-Z0-9]{8,12}$/;

export function parseStkCallback(body: unknown): ParsedStkCallback | null {
  const parsed = stkCallbackSchema.safeParse(body);
  if (!parsed.success) return null;
  const cb = parsed.data.Body.stkCallback;
  const item = (name: string) => cb.CallbackMetadata?.Item.find((i) => i.Name === name)?.Value;
  const amount = Number(item('Amount'));
  const receipt = item('MpesaReceiptNumber');
  const phone = item('PhoneNumber');
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    merchantRequestId: cb.MerchantRequestID,
    resultCode: String(cb.ResultCode),
    resultDesc: cb.ResultDesc ?? null,
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    receipt: typeof receipt === 'string' && RECEIPT.test(receipt) ? receipt : null,
    phone: phone === undefined ? null : String(phone),
  };
}

/** Builds a callback body in Safaricom's format (used by the simulated provider and tests). */
export function buildStkCallback(input: {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receipt?: string;
  phone?: string;
}) {
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: input.merchantRequestId,
        CheckoutRequestID: input.checkoutRequestId,
        ResultCode: input.resultCode,
        ResultDesc: input.resultDesc,
        ...(input.resultCode === 0
          ? {
              CallbackMetadata: {
                Item: [
                  { Name: 'Amount', Value: input.amount ?? 0 },
                  { Name: 'MpesaReceiptNumber', Value: input.receipt ?? '' },
                  { Name: 'TransactionDate', Value: 20261030120000 },
                  { Name: 'PhoneNumber', Value: Number(input.phone ?? 254700000000) },
                ],
              },
            }
          : {}),
      },
    },
  };
}
