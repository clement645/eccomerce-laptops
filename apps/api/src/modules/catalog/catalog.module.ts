import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { PostgresProductSearch } from './search/postgres-product-search.js';
import { PRODUCT_SEARCH_ENGINE } from './search/product-search.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, { provide: PRODUCT_SEARCH_ENGINE, useClass: PostgresProductSearch }],
  exports: [CatalogService],
})
export class CatalogModule {}
