import type { Provider } from '@nestjs/common';
import { mpesaMode, type ApiEnv } from '@repo/configuration';
import { API_ENV } from '../../../config/env.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { DarajaMpesaGateway } from './daraja.gateway.js';
import { MPESA_GATEWAY, MpesaGatewayError, type MpesaGateway } from './mpesa.types.js';
import { SimulatedMpesaGateway } from './simulated.gateway.js';

const disabledGateway: MpesaGateway = {
  name: 'disabled',
  stkPush: () =>
    Promise.reject(new MpesaGatewayError('M-Pesa is not configured', 'DISABLED', false)),
  stkQuery: () =>
    Promise.reject(new MpesaGatewayError('M-Pesa is not configured', 'DISABLED', false)),
};

/** Chooses the M-Pesa gateway from the environment. Tests override MPESA_GATEWAY with a fake. */
export const mpesaGatewayProvider: Provider = {
  provide: MPESA_GATEWAY,
  inject: [API_ENV, RedisService],
  useFactory: (env: ApiEnv, redis: RedisService): MpesaGateway => {
    switch (mpesaMode(env)) {
      case 'simulated':
        return new SimulatedMpesaGateway(redis);
      case 'daraja':
        return new DarajaMpesaGateway({
          environment: env.MPESA_ENV,
          consumerKey: env.MPESA_CONSUMER_KEY!,
          consumerSecret: env.MPESA_CONSUMER_SECRET!,
          shortCode: env.MPESA_SHORTCODE!,
          passkey: env.MPESA_PASSKEY!,
          transactionType: env.MPESA_TRANSACTION_TYPE,
          partyB: env.MPESA_PARTY_B ?? env.MPESA_SHORTCODE!,
        });
      default:
        return disabledGateway;
    }
  },
};
