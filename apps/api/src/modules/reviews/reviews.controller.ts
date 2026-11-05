import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  type PipeTransform,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AdminReview,
  Paginated,
  ProductReviewsPage,
  ReviewEligibility,
} from '@repo/shared-types';
import {
  adminReviewListQuerySchema,
  reviewInputSchema,
  reviewListQuerySchema,
  reviewModerationSchema,
  slugSchema,
  type AdminReviewListQuery,
  type ReviewInput,
  type ReviewListQuery,
  type ReviewModerationInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, Auth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { notFound } from '../admin/admin-errors.js';
import { ReviewsService } from './reviews.service.js';

/** Malformed slugs are simply unknown products. */
class ProductSlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!slugSchema.safeParse(value).success) throw notFound('Product');
    return value;
  }
}
const slugPipe = new ProductSlugPipe();

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly audit: AuditService,
  ) {}

  /** Approved reviews and the rating summary. */
  @Get('catalog/products/:slug/reviews')
  list(
    @Param('slug', slugPipe) slug: string,
    @Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery,
  ): Promise<ProductReviewsPage> {
    return this.reviews.list(slug, query);
  }

  @Get('account/reviews/:slug')
  @Auth()
  eligibility(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', slugPipe) slug: string,
  ): Promise<ReviewEligibility> {
    return this.reviews.eligibility(auth.userId, slug);
  }

  @Put('account/reviews/:slug')
  @Auth()
  @RateLimit({ name: 'review-submit', limit: 10, windowSeconds: 3600 })
  submit(
    @CurrentAuth() auth: AuthContext,
    @Param('slug', slugPipe) slug: string,
    @Body(new ZodValidationPipe(reviewInputSchema)) body: ReviewInput,
  ): Promise<ReviewEligibility> {
    return this.reviews.submit(auth.userId, slug, body);
  }

  @Get('admin/reviews')
  @AdminAuth('reviews:moderate')
  adminList(
    @Query(new ZodValidationPipe(adminReviewListQuerySchema)) query: AdminReviewListQuery,
  ): Promise<Paginated<AdminReview>> {
    return this.reviews.adminList(query);
  }

  @Post('admin/reviews/:id/moderate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('reviews:moderate')
  async moderate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reviewModerationSchema)) body: ReviewModerationInput,
    @Req() req: Request,
  ): Promise<void> {
    await this.reviews.moderate(id, body, auth.userId);
    await this.audit.record({
      action: `review.${body.status.toLowerCase()}`,
      entityType: 'ProductReview',
      entityId: id,
      actorId: auth.userId,
      after: { note: body.note ?? null },
      request: req,
    });
  }
}
