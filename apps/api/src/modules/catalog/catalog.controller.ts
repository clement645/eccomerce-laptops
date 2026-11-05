import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type {
  BrandDetail,
  BrandSummary,
  CategoryDetail,
  CategorySummary,
  ProductCard,
  ProductDetail,
  ProductListResponse,
  SearchSuggestions,
  SitemapData,
} from '@repo/shared-types';
import {
  productListQuerySchema,
  searchSuggestQuerySchema,
  slugSchema,
  type ProductListQuery,
} from '@repo/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { CatalogService } from './catalog.service.js';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
const slugPipe = new ZodValidationPipe(slugSchema);

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * Products with filters, sorting and pagination.
   * Query: q, category, brand (repeatable), condition, spec=Key:Value (repeatable), minPrice, maxPrice
   * (whole KES), inStock, onSale, featured, sort, page, pageSize.
   */
  @Get('products')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOkResponse({ description: 'Paginated product cards with facets' })
  listProducts(
    @Query(new ZodValidationPipe(productListQuerySchema)) query: ProductListQuery,
  ): Promise<ProductListResponse> {
    return this.catalog.list(query);
  }

  @Get('products/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOkResponse({ description: 'Product detail' })
  @ApiNotFoundResponse({ description: 'Unknown or unpublished product' })
  getProduct(@Param('slug', slugPipe) slug: string): Promise<ProductDetail> {
    return this.catalog.getProduct(slug);
  }

  @Get('products/:slug/related')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOkResponse({ description: 'Related products' })
  getRelated(@Param('slug', slugPipe) slug: string): Promise<ProductCard[]> {
    return this.catalog.getRelated(slug);
  }

  @Get('categories')
  @Header('Cache-Control', PUBLIC_CACHE)
  listCategories(): Promise<(CategorySummary & { parentSlug: string | null })[]> {
    return this.catalog.listCategories();
  }

  @Get('categories/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiNotFoundResponse({ description: 'Unknown category' })
  getCategory(@Param('slug', slugPipe) slug: string): Promise<CategoryDetail> {
    return this.catalog.getCategory(slug);
  }

  @Get('brands')
  @Header('Cache-Control', PUBLIC_CACHE)
  listBrands(): Promise<BrandSummary[]> {
    return this.catalog.listBrands();
  }

  @Get('brands/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiNotFoundResponse({ description: 'Unknown brand' })
  getBrand(@Param('slug', slugPipe) slug: string): Promise<BrandDetail> {
    return this.catalog.getBrand(slug);
  }

  /** Autocomplete: up to 6 products plus matching categories and brands. */
  @Get('search/suggest')
  @RateLimit({ name: 'search-suggest', limit: 120, windowSeconds: 60 })
  @Header('Cache-Control', 'public, max-age=30')
  suggest(
    @Query(new ZodValidationPipe(searchSuggestQuerySchema)) query: { q: string },
  ): Promise<SearchSuggestions> {
    return this.catalog.suggest(query.q);
  }

  /** Slugs and modification dates for the storefront's sitemap.xml. */
  @Get('sitemap')
  @Header('Cache-Control', 'public, max-age=300')
  sitemap(): Promise<SitemapData> {
    return this.catalog.sitemap();
  }
}
