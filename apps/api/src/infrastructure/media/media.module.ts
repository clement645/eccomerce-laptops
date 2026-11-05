import { Global, Module } from '@nestjs/common';
import { MediaUrlService } from './media-url.service.js';

@Global()
@Module({
  providers: [MediaUrlService],
  exports: [MediaUrlService],
})
export class MediaModule {}
