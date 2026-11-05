import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  BlogCategoryItem,
  BlogPostDetail,
  BlogPostSummary,
  Paginated,
} from '@repo/shared-types';
import { blogListQuerySchema, slugSchema, type BlogListQuery } from '@repo/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { notFound } from '../admin/admin-errors.js';
import { BlogService } from './blog.service.js';

@ApiTags('blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get('posts')
  posts(
    @Query(new ZodValidationPipe(blogListQuerySchema)) query: BlogListQuery,
  ): Promise<Paginated<BlogPostSummary>> {
    return this.blog.posts(query);
  }

  @Get('posts/:slug')
  post(@Param('slug') slug: string): Promise<BlogPostDetail> {
    if (!slugSchema.safeParse(slug).success) throw notFound('Post');
    return this.blog.post(slug);
  }

  @Get('categories')
  categories(): Promise<BlogCategoryItem[]> {
    return this.blog.categories();
  }
}
