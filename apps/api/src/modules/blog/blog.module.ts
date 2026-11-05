import { Module } from '@nestjs/common';
import { AdminBlogController } from './admin-blog.controller.js';
import { BlogCoreModule } from './blog-core.module.js';
import { BlogController } from './blog.controller.js';

@Module({ imports: [BlogCoreModule], controllers: [BlogController, AdminBlogController] })
export class BlogModule {}
