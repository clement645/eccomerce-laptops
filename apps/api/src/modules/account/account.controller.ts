import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AddressDto, MessageResponse, SessionInfo, SessionUser } from '@repo/shared-types';
import {
  addressSchema,
  changePasswordSchema,
  profileUpdateSchema,
  type AddressInput,
  type ChangePasswordInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator.js';
import type { AuthContext } from '../auth/auth.types.js';
import { Auth, CurrentAuth } from '../auth/guards/auth.decorators.js';
import { AccountService } from './account.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@ApiTags('account')
@Auth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch('profile')
  updateProfile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(profileUpdateSchema))
    body: { firstName: string; lastName: string; phone: string | null; marketingOptIn: boolean },
  ): Promise<SessionUser> {
    return this.account.updateProfile(auth.userId, body);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'change-password', limit: 5, windowSeconds: 900, failClosed: true })
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
  ): Promise<MessageResponse> {
    await this.account.changePassword(auth.userId, auth.sessionId, body, req);
    return { message: 'Password changed. Other devices have been signed out.' };
  }

  @Get('addresses')
  listAddresses(@CurrentAuth() auth: AuthContext): Promise<AddressDto[]> {
    return this.account.listAddresses(auth.userId);
  }

  @Post('addresses')
  createAddress(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(addressSchema)) body: AddressInput,
  ): Promise<AddressDto> {
    return this.account.createAddress(auth.userId, body);
  }

  @Put('addresses/:id')
  updateAddress(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(addressSchema)) body: AddressInput,
  ): Promise<AddressDto> {
    return this.account.updateAddress(auth.userId, id, body);
  }

  @Post('addresses/:id/default')
  @HttpCode(HttpStatus.OK)
  setDefault(@CurrentAuth() auth: AuthContext, @Param('id', uuid) id: string): Promise<AddressDto> {
    return this.account.setDefaultAddress(auth.userId, id);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAddress(@CurrentAuth() auth: AuthContext, @Param('id', uuid) id: string): Promise<void> {
    return this.account.deleteAddress(auth.userId, id);
  }

  @Get('sessions')
  listSessions(@CurrentAuth() auth: AuthContext): Promise<SessionInfo[]> {
    return this.account.listSessions(auth.userId, auth.sessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeSession(@CurrentAuth() auth: AuthContext, @Param('id', uuid) id: string): Promise<void> {
    return this.account.revokeSession(auth.userId, id);
  }

  @Post('sessions/sign-out-others')
  @HttpCode(HttpStatus.OK)
  async signOutOthers(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<MessageResponse> {
    await this.account.revokeOtherSessions(auth.userId, auth.sessionId, req);
    return { message: 'Signed out of all other devices.' };
  }
}
