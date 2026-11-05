import { Global, Module } from '@nestjs/common';
import { StorefrontRevalidationService } from './storefront-revalidation.service.js';

@Global()
@Module({
  providers: [StorefrontRevalidationService],
  exports: [StorefrontRevalidationService],
})
export class RevalidationModule {}
