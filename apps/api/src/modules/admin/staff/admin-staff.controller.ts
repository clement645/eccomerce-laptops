import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AdminRoleDetail, AdminStaffMember } from '@repo/shared-types';
import {
  roleInputSchema,
  setStaffPasswordSchema,
  staffInviteSchema,
  staffUpdateSchema,
  type RoleInput,
  type SetStaffPasswordInput,
  type StaffInviteInput,
  type StaffUpdateInput,
} from '@repo/validation';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthContext } from '../../auth/auth.types.js';
import { AdminAuth, CurrentAuth } from '../../auth/guards/auth.decorators.js';
import { AdminStaffService } from './admin-staff.service.js';

@ApiTags('admin-staff')
@Controller('admin')
export class AdminStaffController {
  constructor(
    private readonly staff: AdminStaffService,
    private readonly audit: AuditService,
  ) {}

  @Get('roles')
  @AdminAuth('staff:manage')
  roles(): Promise<AdminRoleDetail[]> {
    return this.staff.roles();
  }

  @Post('roles')
  @AdminAuth('staff:manage')
  async createRole(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(roleInputSchema)) body: RoleInput,
    @Req() req: Request,
  ): Promise<AdminRoleDetail> {
    const role = await this.staff.saveRole(null, body);
    await this.record('role.created', 'AdminRole', role.id, auth, req, {
      permissions: role.permissions,
    });
    return role;
  }

  @Put('roles/:id')
  @AdminAuth('staff:manage')
  async updateRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(roleInputSchema)) body: RoleInput,
    @Req() req: Request,
  ): Promise<AdminRoleDetail> {
    const role = await this.staff.saveRole(id, body);
    await this.record('role.updated', 'AdminRole', id, auth, req, {
      permissions: role.permissions,
    });
    return role;
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('staff:manage')
  async deleteRole(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.staff.deleteRole(id);
    await this.record('role.deleted', 'AdminRole', id, auth, req);
  }

  @Get('staff')
  @AdminAuth('staff:manage')
  list(): Promise<AdminStaffMember[]> {
    return this.staff.staff();
  }

  @Post('staff')
  @AdminAuth('staff:manage')
  @RateLimit({ name: 'staff-invite', limit: 20, windowSeconds: 3600 })
  async invite(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(staffInviteSchema)) body: StaffInviteInput,
    @Req() req: Request,
  ): Promise<AdminStaffMember> {
    const member = await this.staff.invite(body, auth.userId);
    await this.record('staff.invited', 'User', member.id, auth, req, {
      email: member.email,
      roles: member.roles.map((r) => r.key),
    });
    return member;
  }

  @Put('staff/:id')
  @AdminAuth('staff:manage')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(staffUpdateSchema)) body: StaffUpdateInput,
    @Req() req: Request,
  ): Promise<AdminStaffMember> {
    const member = await this.staff.update(id, body, auth.userId);
    await this.record('staff.updated', 'User', id, auth, req, {
      status: member.status,
      roles: member.roles.map((r) => r.key),
    });
    return member;
  }

  @Post('staff/:id/resend-invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('staff:manage')
  @RateLimit({ name: 'staff-invite', limit: 20, windowSeconds: 3600 })
  async resend(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.staff.resendInvite(id);
    await this.record('staff.invite_resent', 'User', id, auth, req);
  }

  @Post('staff/:id/reset-mfa')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AdminAuth('staff:manage')
  async resetMfa(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.staff.resetMfa(id, auth.userId);
    await this.record('staff.mfa_reset', 'User', id, auth, req);
  }

  /** Public: completes an invite. The token in the emailed link is the only credential. */
  @Post('auth/set-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ name: 'staff-set-password', limit: 10, windowSeconds: 900, failClosed: true })
  async setPassword(
    @Body(new ZodValidationPipe(setStaffPasswordSchema)) body: SetStaffPasswordInput,
  ): Promise<void> {
    await this.staff.setPassword(body);
  }

  private record(
    action: string,
    entityType: string,
    id: string,
    auth: AuthContext,
    req: Request,
    after?: Record<string, string | string[]>,
  ) {
    return this.audit.record({
      action,
      entityType,
      entityId: id,
      actorId: auth.userId,
      after,
      request: req,
    });
  }
}
