import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpException,
  Post,
  Req,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { MediaUpload, Permission } from '@repo/shared-types';
import type { Request } from 'express';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { MediaUrlService } from '../../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { inspectImage } from '../../../infrastructure/storage/image-info.js';
import {
  ObjectStorageService,
  StorageError,
} from '../../../infrastructure/storage/object-storage.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const UPLOAD_PERMISSIONS: Permission[] = [
  'products:write',
  'categories:write',
  'brands:write',
  'content:write',
  'blog:write',
];
const FOLDERS = ['products', 'categories', 'brands', 'banners', 'blog'] as const;

@ApiTags('admin-media')
@Controller('admin/media')
export class MediaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly media: MediaUrlService,
  ) {}

  /**
   * Uploads one image to the public bucket. Send the raw file as the body. The type is detected from
   * the bytes; only JPEG, PNG, WebP and AVIF are accepted. Keys are random, so files never collide.
   */
  @Post()
  @AdminAuth()
  @RateLimit({ name: 'admin-upload', limit: 60, windowSeconds: 60 })
  @ApiConsumes('image/jpeg', 'image/png', 'image/webp', 'image/avif')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  async upload(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
    @Req() req: Request,
  ): Promise<MediaUpload> {
    if (!UPLOAD_PERMISSIONS.some((p) => auth.permissions.includes(p)))
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot upload images' });
    if (!this.storage.enabled || !this.storage.publicBucket)
      throw new ServiceUnavailableException({
        code: 'STORAGE_NOT_CONFIGURED',
        message: 'Image uploads are not set up on this server',
      });
    if (!Buffer.isBuffer(body) || body.length === 0)
      throw new BadRequestException({
        code: 'EMPTY_UPLOAD',
        message: 'Send the image file as the request body',
      });
    if (body.length > MAX_UPLOAD_BYTES)
      throw new HttpException(
        { code: 'FILE_TOO_LARGE', message: 'Images must be 8 MB or smaller' },
        413,
      );
    const image = inspectImage(body);
    if (!image)
      throw new UnsupportedMediaTypeException({
        code: 'UNSUPPORTED_IMAGE',
        message: 'Upload a JPEG, PNG, WebP or AVIF image',
      });
    if (image.width && image.height && (image.width > 8000 || image.height > 8000))
      throw new BadRequestException({
        code: 'IMAGE_TOO_LARGE',
        message: 'Images must be at most 8000 pixels per side',
      });

    const requested = typeof req.query.folder === 'string' ? req.query.folder : 'products';
    const folder = (FOLDERS as readonly string[]).includes(requested) ? requested : 'products';
    const now = new Date();
    const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${image.extension}`;

    try {
      await this.storage.put(this.storage.publicBucket, key, body, image.mimeType);
    } catch (error) {
      if (error instanceof StorageError)
        throw new ServiceUnavailableException({
          code: 'STORAGE_UNAVAILABLE',
          message: 'Could not store the image. Try again.',
        });
      throw error;
    }
    const asset = await this.prisma.client.mediaAsset.create({
      data: {
        bucket: 'PUBLIC',
        storageKey: key,
        mimeType: image.mimeType,
        bytes: body.length,
        width: image.width,
        height: image.height,
        status: 'READY',
        uploadedById: auth.userId,
      },
    });
    return {
      id: asset.id,
      storageKey: key,
      url: this.media.publicUrl(key),
      mimeType: image.mimeType,
      bytes: body.length,
      width: image.width,
      height: image.height,
    };
  }
}
