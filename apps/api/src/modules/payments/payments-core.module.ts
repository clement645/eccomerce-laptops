import { Global, Module } from '@nestjs/common';
import { mpesaGatewayProvider } from './mpesa/mpesa-gateway.provider.js';
import { MpesaPaymentService } from './mpesa-payment.service.js';
import { RefundService } from './refund.service.js';

/** Payment services shared by the HTTP API and the background worker. */
@Global()
@Module({
  providers: [mpesaGatewayProvider, MpesaPaymentService, RefundService],
  exports: [MpesaPaymentService, RefundService],
})
export class PaymentsCoreModule {}
