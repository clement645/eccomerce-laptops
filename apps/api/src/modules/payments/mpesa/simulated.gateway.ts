import { randomToken } from '../../auth/crypto/tokens.js';
import type { RedisService } from '../../../infrastructure/redis/redis.service.js';
import type { MpesaGateway, StkPushResult, StkQueryResult } from './mpesa.types.js';

const OUTCOMES = {
  success: {
    state: 'SUCCEEDED',
    resultCode: '0',
    resultDesc: 'The service request is processed successfully.',
  },
  failure: { state: 'CANCELLED', resultCode: '1032', resultDesc: 'Request cancelled by user' },
} as const satisfies Record<string, StkQueryResult>;

export type SimulatedOutcome = keyof typeof OUTCOMES;

/**
 * Development-only stand-in for Daraja. No money moves. The outcome of each push is chosen with the
 * storefront's "simulate" buttons and kept in Redis so the API and the worker see the same answer.
 */
export class SimulatedMpesaGateway implements MpesaGateway {
  readonly name = 'simulated' as const;

  constructor(private readonly redis: RedisService) {}

  stkPush(): Promise<StkPushResult> {
    return Promise.resolve({
      checkoutRequestId: `SIM-${randomToken(12)}`,
      merchantRequestId: `SIM-${randomToken(8)}`,
    });
  }

  async stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
    const stored = await this.redis.client.get(this.key(checkoutRequestId)).catch(() => null);
    return stored && stored in OUTCOMES
      ? OUTCOMES[stored as SimulatedOutcome]
      : { state: 'PENDING', resultCode: null, resultDesc: 'The transaction is being processed' };
  }

  async setOutcome(checkoutRequestId: string, outcome: SimulatedOutcome): Promise<void> {
    await this.redis.client.set(this.key(checkoutRequestId), outcome, 'EX', 86_400);
  }

  private key(checkoutRequestId: string): string {
    return this.redis.key('mpesa-sim', checkoutRequestId);
  }
}
