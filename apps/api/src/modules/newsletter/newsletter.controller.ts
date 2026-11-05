import { Body, Controller, Get, Header, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminSubscriber, Paginated } from '@repo/shared-types';
import {
  adminListQuerySchema,
  linkTokenSchema,
  newsletterSubscribeSchema,
  type AdminListQuery,
  type NewsletterSubscribeInput,
} from '@repo/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import { AdminAuth } from '../auth/guards/auth.decorators.js';
import { NewsletterService } from './newsletter.service.js';

const SENT = { message: 'Check your inbox to confirm your subscription.' };

@ApiTags('newsletter')
@Controller()
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /** Same answer for new, pending and existing subscribers. */
  @Post('newsletter/subscribe')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'newsletter', limit: 5, windowSeconds: 600, failClosed: true })
  async subscribe(
    @Body(new ZodValidationPipe(newsletterSubscribeSchema)) body: NewsletterSubscribeInput,
  ) {
    await this.newsletter.subscribe(body.email, body.source);
    return SENT;
  }

  @Post('newsletter/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'newsletter-link', limit: 20, windowSeconds: 600 })
  async confirm(@Body(new ZodValidationPipe(linkTokenSchema)) body: { token: string }) {
    await this.newsletter.confirm(body.token);
    return { message: "You're subscribed." };
  }

  @Post('newsletter/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'newsletter-link', limit: 20, windowSeconds: 600 })
  async unsubscribe(@Body(new ZodValidationPipe(linkTokenSchema)) body: { token: string }) {
    await this.newsletter.unsubscribe(body.token);
    return { message: "You've been unsubscribed." };
  }

  @Get('admin/newsletter/subscribers')
  @AdminAuth('customers:read')
  list(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<Paginated<AdminSubscriber> & { counts: Record<string, number> }> {
    return this.newsletter.adminList(query);
  }

  @Get('admin/newsletter/export.csv')
  @AdminAuth('customers:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"')
  @Header('Cache-Control', 'no-store')
  export(): Promise<string> {
    return this.newsletter.exportCsv();
  }
}
