import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CheckoutController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';

@Module({
  imports: [CartModule, SettingsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
