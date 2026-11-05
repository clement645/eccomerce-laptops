import { Module } from '@nestjs/common';
import { BlogService } from './blog.service.js';

/** Blog logic without HTTP controllers, shared with the worker (scheduled publishing). */
@Module({ providers: [BlogService], exports: [BlogService] })
export class BlogCoreModule {}
