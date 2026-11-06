import { Global, Module } from '@nestjs/common';
import { mpesaGatewayProvider } from './mpesa/mpesa-gateway.provider.js';
import { MpesaPaymentService } from './mpesa-payment.service.js';
import { PaymentSweepService } from './payment-sweep.service.js';
import { RefundService } from './refund.service.js';

/** Payment services shared by the HTTP API and the background worker. */
@Global()
@Module({
  providers: [mpesaGatewayProvider, MpesaPaymentService, RefundService, PaymentSweepService],
  exports: [MpesaPaymentService, RefundService, PaymentSweepService],
})
export class PaymentsCoreModule {}
