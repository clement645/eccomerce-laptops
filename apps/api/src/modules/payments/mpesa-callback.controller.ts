import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { CALLBACK_PATH, MpesaPaymentService } from './mpesa-payment.service.js';

/**
 * Safaricom posts STK Push results here. The secret path segment keeps out casual noise; it is not
 * proof of payment. Every callback is verified with STK Query before anything changes.
 */
@ApiExcludeController()
@Controller(CALLBACK_PATH)
export class MpesaCallbackController {
  constructor(private readonly mpesa: MpesaPaymentService) {}

  @Post(':secret')
  @HttpCode(HttpStatus.OK)
  async callback(@Param('secret') secret: string, @Body() body: unknown, @Req() req: Request) {
    if (!this.mpesa.isCallbackSecret(secret)) throw new NotFoundException();
    await this.mpesa.handleCallback(body, req.ip ?? null);
    // Safaricom only needs an acknowledgement.
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }
}
