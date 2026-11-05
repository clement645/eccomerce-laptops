import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { API_ENV } from '../../config/env.js';

/** Builds public URLs for objects in the public media bucket. */
@Injectable()
export class MediaUrlService {
  private readonly base: string | null;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.base = env.R2_PUBLIC_BASE_URL?.replace(/\/$/, '') ?? null;
  }

  /** Null when there is no key or no media origin is configured. */
  publicUrl(storageKey: string | null | undefined): string | null {
    if (!storageKey || !this.base) return null;
    return `${this.base}/${storageKey.split('/').map(encodeURIComponent).join('/')}`;
  }
}
