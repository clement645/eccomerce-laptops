import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type { BackgroundJobsHealth } from '@repo/shared-types';
import { API_ENV } from '../config/env.js';

/** What the background jobs in this process last did. Reported by GET /health; costs no I/O. */
@Injectable()
export class JobsStatusService {
  private readonly sweeps = new Map<string, BackgroundJobsHealth['sweeps'][string]>();
  emailConsumer: BackgroundJobsHealth['emailConsumer'] = 'off';
  catchUp: BackgroundJobsHealth['catchUp'] = null;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  record(name: string, ok: boolean, startedAt: Date, detail?: string): void {
    this.sweeps.set(name, {
      lastRunAt: startedAt.toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      ok,
      ...(detail ? { detail } : {}),
    });
  }

  snapshot(): BackgroundJobsHealth {
    return {
      mode: this.env.BACKGROUND_JOBS,
      emailConsumer: this.emailConsumer,
      catchUp: this.catchUp,
      sweeps: Object.fromEntries(this.sweeps),
    };
  }
}
