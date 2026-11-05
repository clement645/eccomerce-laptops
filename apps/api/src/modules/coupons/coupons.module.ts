import { Global, Module } from '@nestjs/common';
import { AdminCouponsController } from './admin-coupons.controller.js';
import { CouponService } from './coupon.service.js';

@Global()
@Module({
  controllers: [AdminCouponsController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponsModule {}
