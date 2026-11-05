import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { PublicStoreSettings } from '@repo/shared-types';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Announcement bar, trust indicators, contact details and other public store settings. */
  @Get('public')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOkResponse({ description: 'Public store settings' })
  getPublic(): Promise<PublicStoreSettings> {
    return this.settings.getPublic();
  }
}
