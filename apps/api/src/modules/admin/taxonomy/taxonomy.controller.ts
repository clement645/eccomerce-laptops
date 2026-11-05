import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminBrand, AdminCategory } from '@repo/shared-types';
import {
  brandInputSchema,
  categoryInputSchema,
  type BrandInput,
  type CategoryInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { TaxonomyService } from './taxonomy.service.js';

@ApiTags('admin-catalog')
@Controller('admin')
export class TaxonomyController {
  constructor(
    private readonly taxonomy: TaxonomyService,
    private readonly audit: AuditService,
  ) {}

  @Get('categories')
  @AdminAuth('products:read')
  categories(): Promise<AdminCategory[]> {
    return this.taxonomy.categories();
  }

  @Post('categories')
  @AdminAuth('categories:write')
  async createCategory(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
    @Req() req: Request,
  ): Promise<AdminCategory> {
    const saved = await this.taxonomy.saveCategory(null, body);
    await this.record('category.created', saved.id, auth, req, { slug: saved.slug });
    return saved;
  }

  @Put('categories/:id')
  @AdminAuth('categories:write')
  async updateCategory(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: CategoryInput,
    @Req() req: Request,
  ): Promise<AdminCategory> {
    const saved = await this.taxonomy.saveCategory(id, body);
    await this.record('category.updated', id, auth, req, { slug: saved.slug });
    return saved;
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('categories:write')
  async deleteCategory(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.taxonomy.deleteCategory(id);
    await this.record('category.deleted', id, auth, req);
  }

  @Get('brands')
  @AdminAuth('products:read')
  brands(): Promise<AdminBrand[]> {
    return this.taxonomy.brands();
  }

  @Post('brands')
  @AdminAuth('brands:write')
  async createBrand(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(brandInputSchema)) body: BrandInput,
    @Req() req: Request,
  ): Promise<AdminBrand> {
    const saved = await this.taxonomy.saveBrand(null, body);
    await this.record('brand.created', saved.id, auth, req, { slug: saved.slug });
    return saved;
  }

  @Put('brands/:id')
  @AdminAuth('brands:write')
  async updateBrand(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(brandInputSchema)) body: BrandInput,
    @Req() req: Request,
  ): Promise<AdminBrand> {
    const saved = await this.taxonomy.saveBrand(id, body);
    await this.record('brand.updated', id, auth, req, { slug: saved.slug });
    return saved;
  }

  @Delete('brands/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('brands:write')
  async deleteBrand(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.taxonomy.deleteBrand(id);
    await this.record('brand.deleted', id, auth, req);
  }

  private record(
    action: string,
    id: string,
    auth: AuthContext,
    req: Request,
    after?: Record<string, string>,
  ) {
    return this.audit.record({
      action,
      entityType: action.split('.')[0] === 'brand' ? 'Brand' : 'Category',
      entityId: id,
      actorId: auth.userId,
      after,
      request: req,
    });
  }
}
