import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminProduct, AdminProductListItem, Paginated } from '@repo/shared-types';
import {
  adminProductListQuerySchema,
  productInputSchema,
  productStatusSchema,
  type AdminProductListQuery,
  type ProductInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminProductsService } from './admin-products.service.js';

@ApiTags('admin-products')
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly products: AdminProductsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('products:read')
  list(
    @Query(new ZodValidationPipe(adminProductListQuerySchema)) query: AdminProductListQuery,
  ): Promise<Paginated<AdminProductListItem>> {
    return this.products.list(query);
  }

  @Get(':id')
  @AdminAuth('products:read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminProduct> {
    return this.products.get(id);
  }

  @Post()
  @AdminAuth('products:write')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(productInputSchema)) body: ProductInput,
    @Req() req: Request,
  ): Promise<AdminProduct> {
    const product = await this.products.create(body, auth.userId);
    await this.audit.record({
      action: 'product.created',
      entityType: 'Product',
      entityId: product.id,
      actorId: auth.userId,
      after: { slug: product.slug, name: product.name },
      request: req,
    });
    return product;
  }

  @Put(':id')
  @AdminAuth('products:write')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(productInputSchema)) body: ProductInput,
    @Req() req: Request,
  ): Promise<AdminProduct> {
    const product = await this.products.update(id, body, auth.userId);
    await this.audit.record({
      action: 'product.updated',
      entityType: 'Product',
      entityId: id,
      actorId: auth.userId,
      after: { slug: product.slug, name: product.name, variants: product.variants.length },
      request: req,
    });
    return product;
  }

  /** Publish, unpublish (draft) or archive. */
  @Post(':id/status')
  @AdminAuth('products:publish')
  async status(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(productStatusSchema)) body: { status: AdminProduct['status'] },
    @Req() req: Request,
  ): Promise<AdminProduct> {
    const product = await this.products.setStatus(id, body.status);
    await this.audit.record({
      action: `product.${body.status.toLowerCase()}`,
      entityType: 'Product',
      entityId: id,
      actorId: auth.userId,
      after: { status: body.status },
      request: req,
    });
    return product;
  }
}
