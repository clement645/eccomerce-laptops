import { Global, Module } from '@nestjs/common';
import { OrderPaymentService } from './order-payment.service.js';
import { ShippingService } from './shipping.service.js';
import { StockChangeNotifier } from './stock-change.notifier.js';

/** Order services shared by the HTTP API and the background worker. */
@Global()
@Module({
  providers: [ShippingService, OrderPaymentService, StockChangeNotifier],
  exports: [ShippingService, OrderPaymentService, StockChangeNotifier],
})
export class OrdersCoreModule {}
