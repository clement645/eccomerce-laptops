import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminContactMessage, ContactStatus, Paginated } from '@repo/shared-types';
import {
  adminListQuerySchema,
  contactMessageSchema,
  contactStatusSchema,
  type AdminListQuery,
  type ContactMessageInput,
} from '@repo/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { ContactService } from './contact.service.js';

@ApiTags('contact')
@Controller()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post('contact')
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit({ name: 'contact', limit: 3, windowSeconds: 600, failClosed: true })
  async submit(@Body(new ZodValidationPipe(contactMessageSchema)) body: ContactMessageInput) {
    await this.contact.submit(body);
    return { message: "Thanks, we've received your message and will reply by email." };
  }

  /** Support work: anyone who can see customers can read and file messages. */
  @Get('admin/messages')
  @AdminAuth('customers:read')
  list(
    @Query(new ZodValidationPipe(adminListQuerySchema)) query: AdminListQuery,
  ): Promise<Paginated<AdminContactMessage> & { counts: Record<string, number> }> {
    return this.contact.adminList(query);
  }

  @Post('admin/messages/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('customers:read')
  async status(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(contactStatusSchema)) body: { status: ContactStatus },
  ): Promise<void> {
    await this.contact.setStatus(id, body.status, auth.userId);
  }
}
