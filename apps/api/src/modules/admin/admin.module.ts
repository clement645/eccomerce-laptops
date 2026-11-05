import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { raw } from 'express';
import { CatalogChangeNotifier } from './catalog-change.notifier.js';
import { AdminContentController } from './content/admin-content.controller.js';
import { AdminContentService } from './content/admin-content.service.js';
import { AdminCustomersController } from './customers/admin-customers.controller.js';
import { AdminCustomersService } from './customers/admin-customers.service.js';
import { DashboardController } from './dashboard/dashboard.controller.js';
import { DashboardService } from './dashboard/dashboard.service.js';
import { AdminInventoryController } from './inventory/admin-inventory.controller.js';
import { AdminInventoryService } from './inventory/admin-inventory.service.js';
import { MAX_UPLOAD_BYTES, MediaController } from './media/media.controller.js';
import { AdminOrdersController } from './orders/admin-orders.controller.js';
import { AdminOrdersService } from './orders/admin-orders.service.js';
import { AdminProductsController } from './products/admin-products.controller.js';
import { AdminProductsService } from './products/admin-products.service.js';
import { AdminStaffController } from './staff/admin-staff.controller.js';
import { AdminStaffService } from './staff/admin-staff.service.js';
import { TaxonomyController } from './taxonomy/taxonomy.controller.js';
import { TaxonomyService } from './taxonomy/taxonomy.service.js';

/** Staff dashboard API. Every route requires an MFA-verified staff session and a permission. */
@Module({
  controllers: [
    DashboardController,
    AdminProductsController,
    TaxonomyController,
    MediaController,
    AdminInventoryController,
    AdminOrdersController,
    AdminCustomersController,
    AdminContentController,
    AdminStaffController,
  ],
  providers: [
    CatalogChangeNotifier,
    DashboardService,
    AdminProductsService,
    TaxonomyService,
    AdminInventoryService,
    AdminOrdersService,
    AdminCustomersService,
    AdminContentService,
    AdminStaffService,
  ],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Image uploads arrive as the raw request body (one file per request).
    consumer
      .apply(raw({ type: () => true, limit: MAX_UPLOAD_BYTES + 1 }))
      .forRoutes({ path: 'admin/media', method: RequestMethod.POST });
  }
}
