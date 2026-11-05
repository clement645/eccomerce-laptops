import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { StorefrontController } from './storefront.controller.js';
import { StorefrontService } from './storefront.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
