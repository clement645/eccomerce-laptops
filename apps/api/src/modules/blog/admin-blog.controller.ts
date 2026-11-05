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
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminBlogCategory, AdminBlogPost, Paginated } from '@repo/shared-types';
import {
  adminBlogListQuerySchema,
  blogCategoryInputSchema,
  blogPostInputSchema,
  blogPublishSchema,
  type AdminBlogListQuery,
  type BlogCategoryInput,
  type BlogPostInput,
  type BlogPublishInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { BlogService } from './blog.service.js';

@ApiTags('admin-blog')
@Controller('admin/blog')
export class AdminBlogController {
  constructor(
    private readonly blog: BlogService,
    private readonly audit: AuditService,
  ) {}

  @Get('posts')
  @AdminAuth('blog:write')
  list(
    @Query(new ZodValidationPipe(adminBlogListQuerySchema)) query: AdminBlogListQuery,
  ): Promise<Paginated<AdminBlogPost>> {
    return this.blog.adminList(query);
  }

  @Get('posts/:id')
  @AdminAuth('blog:write')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<AdminBlogPost> {
    return this.blog.adminGet(id);
  }

  @Post('posts')
  @AdminAuth('blog:write')
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(blogPostInputSchema)) body: BlogPostInput,
    @Req() req: Request,
  ): Promise<AdminBlogPost> {
    const post = await this.blog.save(null, body, auth.userId);
    await this.record('blog_post.created', post.id, auth, req, post.slug);
    return post;
  }

  @Put('posts/:id')
  @AdminAuth('blog:write')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(blogPostInputSchema)) body: BlogPostInput,
    @Req() req: Request,
  ): Promise<AdminBlogPost> {
    const post = await this.blog.save(id, body, auth.userId);
    await this.record('blog_post.updated', id, auth, req, post.slug);
    return post;
  }

  /** Publish now, schedule, unpublish (draft) or archive. */
  @Post('posts/:id/status')
  @HttpCode(HttpStatus.OK)
  @AdminAuth('blog:publish')
  async status(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(blogPublishSchema)) body: BlogPublishInput,
    @Req() req: Request,
  ): Promise<AdminBlogPost> {
    const post = await this.blog.setStatus(id, body);
    await this.record(`blog_post.${body.status.toLowerCase()}`, id, auth, req, post.slug);
    return post;
  }

  @Get('categories')
  @AdminAuth('blog:write')
  categories(): Promise<AdminBlogCategory[]> {
    return this.blog.adminCategories();
  }

  @Post('categories')
  @AdminAuth('blog:write')
  createCategory(
    @Body(new ZodValidationPipe(blogCategoryInputSchema)) body: BlogCategoryInput,
  ): Promise<AdminBlogCategory> {
    return this.blog.saveCategory(null, body);
  }

  @Put('categories/:id')
  @AdminAuth('blog:write')
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(blogCategoryInputSchema)) body: BlogCategoryInput,
  ): Promise<AdminBlogCategory> {
    return this.blog.saveCategory(id, body);
  }

  /** Posts in the category stay, without a category. */
  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('blog:write')
  async deleteCategory(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.blog.deleteCategory(id);
  }

  private record(action: string, id: string, auth: AuthContext, req: Request, slug: string) {
    return this.audit.record({
      action,
      entityType: 'BlogPost',
      entityId: id,
      actorId: auth.userId,
      after: { slug },
      request: req,
    });
  }
}
