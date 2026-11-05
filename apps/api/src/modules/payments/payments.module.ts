import { Module } from '@nestjs/common';
import { AdminPaymentsController } from './admin-payments.controller.js';
import { MpesaCallbackController } from './mpesa-callback.controller.js';

@Module({ controllers: [MpesaCallbackController, AdminPaymentsController] })
export class PaymentsModule {}
