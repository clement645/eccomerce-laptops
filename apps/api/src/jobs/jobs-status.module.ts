import { Global, Module } from '@nestjs/common';
import { JobsStatusService } from './jobs-status.service.js';

/** Always loaded, so GET /health can report job status whatever BACKGROUND_JOBS is. */
@Global()
@Module({ providers: [JobsStatusService], exports: [JobsStatusService] })
export class JobsStatusModule {}
