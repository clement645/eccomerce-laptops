import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@repo/database';
import { EDITABLE_SETTING_KEYS, type EditableSettingKey } from '@repo/shared-types';
import { settingKeySchema, settingSchemas } from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  StorefrontRevalidationService,
  StorefrontTags,
} from '../../infrastructure/revalidation/storefront-revalidation.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { SettingsService } from './settings.service.js';

/**
 * Store settings staff can edit, one validated document per key. Keys outside the allowlist (VAT,
 * homepage content blocks) are managed elsewhere or by migrations.
 */
@ApiTags('admin-settings')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly revalidation: StorefrontRevalidationService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @AdminAuth('settings:write')
  async all(): Promise<Record<EditableSettingKey, unknown>> {
    const rows = await this.prisma.client.storeSetting.findMany({
      where: { key: { in: [...EDITABLE_SETTING_KEYS] } },
    });
    return Object.fromEntries(
      EDITABLE_SETTING_KEYS.map((key) => [key, rows.find((r) => r.key === key)?.value ?? null]),
    ) as Record<EditableSettingKey, unknown>;
  }

  @Put(':key')
  @AdminAuth('settings:write')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('key', new ZodValidationPipe(settingKeySchema)) key: EditableSettingKey,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<unknown> {
    const value = new ZodValidationPipe(settingSchemas[key]).transform(
      body,
    ) as Prisma.InputJsonValue;
    const before = await this.prisma.client.storeSetting.findUnique({ where: { key } });
    await this.prisma.client.storeSetting.upsert({
      where: { key },
      create: { key, value, updatedById: auth.userId },
      update: { value, updatedById: auth.userId },
    });
    await this.settings.invalidate();
    await this.revalidation.revalidate([StorefrontTags.layout, StorefrontTags.homepage]);
    await this.audit.record({
      action: 'setting.updated',
      entityType: 'StoreSetting',
      entityId: null,
      actorId: auth.userId,
      before: { key, value: (before?.value ?? null) as Prisma.InputJsonValue },
      after: { key, value },
      request: req,
    });
    return value;
  }
}
