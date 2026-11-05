import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InventoryMovementEntry, InventoryRow, Paginated } from '@repo/shared-types';
import {
  inventoryQuerySchema,
  stockAdjustmentSchema,
  type InventoryQuery,
  type StockAdjustmentInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminInventoryService } from './admin-inventory.service.js';

@ApiTags('admin-inventory')
@Controller('admin/inventory')
export class AdminInventoryController {
  constructor(
    private readonly inventory: AdminInventoryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('inventory:read')
  list(
    @Query(new ZodValidationPipe(inventoryQuerySchema)) query: InventoryQuery,
  ): Promise<Paginated<InventoryRow>> {
    return this.inventory.list(query);
  }

  @Get(':variantId/movements')
  @AdminAuth('inventory:read')
  movements(
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
  ): Promise<InventoryMovementEntry[]> {
    return this.inventory.movements(variantId);
  }

  @Post(':variantId/adjustments')
  @AdminAuth('inventory:adjust')
  async adjust(
    @CurrentAuth() auth: AuthContext,
    @Param('variantId', new ParseUUIDPipe()) variantId: string,
    @Body(new ZodValidationPipe(stockAdjustmentSchema)) body: StockAdjustmentInput,
    @Req() req: Request,
  ): Promise<InventoryRow> {
    const row = await this.inventory.adjust(variantId, body, auth.userId);
    await this.audit.record({
      action: 'inventory.adjusted',
      entityType: 'ProductVariant',
      entityId: variantId,
      actorId: auth.userId,
      after: { reason: body.reason, delta: body.delta, onHand: row.onHand },
      request: req,
    });
    return row;
  }
}
