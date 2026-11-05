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
import type { AdminBanner, AdminHomepageSection } from '@repo/shared-types';
import {
  bannerInputSchema,
  homepageSectionInputSchema,
  type BannerInput,
  type HomepageSectionInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminContentService } from './admin-content.service.js';

@ApiTags('admin-content')
@Controller('admin')
export class AdminContentController {
  constructor(
    private readonly content: AdminContentService,
    private readonly audit: AuditService,
  ) {}

  @Get('banners')
  @AdminAuth('content:write')
  banners(): Promise<AdminBanner[]> {
    return this.content.banners();
  }

  @Post('banners')
  @AdminAuth('content:write')
  async createBanner(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(bannerInputSchema)) body: BannerInput,
    @Req() req: Request,
  ): Promise<AdminBanner> {
    const banner = await this.content.saveBanner(null, body);
    await this.record('banner.created', 'Banner', banner.id, auth, req);
    return banner;
  }

  @Put('banners/:id')
  @AdminAuth('content:write')
  async updateBanner(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(bannerInputSchema)) body: BannerInput,
    @Req() req: Request,
  ): Promise<AdminBanner> {
    const banner = await this.content.saveBanner(id, body);
    await this.record('banner.updated', 'Banner', id, auth, req);
    return banner;
  }

  @Delete('banners/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('content:write')
  async deleteBanner(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.content.deleteBanner(id);
    await this.record('banner.deleted', 'Banner', id, auth, req);
  }

  @Get('homepage-sections')
  @AdminAuth('content:write')
  sections(): Promise<AdminHomepageSection[]> {
    return this.content.sections();
  }

  @Put('homepage-sections/:id')
  @AdminAuth('content:write')
  async updateSection(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(homepageSectionInputSchema)) body: HomepageSectionInput,
    @Req() req: Request,
  ): Promise<AdminHomepageSection> {
    const section = await this.content.saveSection(id, body);
    await this.record('homepage_section.updated', 'HomepageSection', id, auth, req);
    return section;
  }

  private record(action: string, entityType: string, id: string, auth: AuthContext, req: Request) {
    return this.audit.record({
      action,
      entityType,
      entityId: id,
      actorId: auth.userId,
      request: req,
    });
  }
}
