import { UnprocessableEntityException } from '@nestjs/common';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

/** Image keys must come from our own upload endpoint, never an arbitrary path. */
export async function assertUploaded(
  prisma: PrismaService,
  keys: (string | null | undefined)[],
): Promise<void> {
  const wanted = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (wanted.length === 0) return;
  const found = await prisma.client.mediaAsset.count({
    where: { storageKey: { in: wanted }, status: 'READY', bucket: 'PUBLIC' },
  });
  if (found !== wanted.length)
    throw new UnprocessableEntityException({
      code: 'IMAGE_NOT_FOUND',
      message: 'One of the images was not uploaded. Upload it again.',
    });
}
