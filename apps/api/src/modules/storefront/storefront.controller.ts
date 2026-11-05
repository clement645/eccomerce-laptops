import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { StorefrontHomepage, StorefrontLayout } from '@repo/shared-types';
import { StorefrontService } from './storefront.service.js';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

@ApiTags('storefront')
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  /** Navigation categories, brands and public settings used on every storefront page. */
  @Get('layout')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOkResponse({ description: 'Storefront layout data' })
  getLayout(): Promise<StorefrontLayout> {
    return this.storefront.getLayout();
  }

  /** Banners, categories, product sections, brands, testimonials, posts and store stats. */
  @Get('homepage')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOkResponse({ description: 'Homepage content' })
  getHomepage(): Promise<StorefrontHomepage> {
    return this.storefront.getHomepage();
  }
}
