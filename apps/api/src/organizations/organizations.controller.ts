import type {
  AuthUser,
  CreatedInvitationResponse,
  InvitationListResponse,
  MemberListResponse,
  MemberResponse,
  OrganizationListResponse,
  OrganizationResponse,
  TransferOwnershipResponse,
} from '@app/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators.js';
import { ResourceIdPipe } from '../common/validation/uuid.js';
import {
  CreateInvitationDto,
  CreateOrganizationDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
  UpdateOrganizationDto,
} from './dto/organization.dto.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from './organization-context.js';
import { invitationNotFound, membershipNotFound } from './organization-errors.js';
import { OrganizationsService } from './organizations.service.js';

/** Organization collection: any signed-in user (global SessionAuthGuard). */
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationResponse> {
    return this.organizations.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<OrganizationListResponse> {
    return this.organizations.listForUser(user.id);
  }
}

/**
 * Everything under /organizations/:organizationId. The class-level
 * OrganizationAccessGuard verifies membership for EVERY route here; each
 * handler declares the permission it needs.
 */
@Controller('organizations/:organizationId')
@UseGuards(OrganizationAccessGuard)
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @RequirePermissions('ORGANIZATION_READ')
  get(@OrgContext() context: OrganizationContext): OrganizationResponse {
    return this.organizations.get(context);
  }

  @Patch()
  @RequirePermissions('ORGANIZATION_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationResponse> {
    return this.organizations.update(context, body);
  }

  // --- Members ------------------------------------------------------------------

  @Get('members')
  @RequirePermissions('MEMBERS_READ')
  listMembers(@OrgContext() context: OrganizationContext): Promise<MemberListResponse> {
    return this.members.list(context.organization.id);
  }

  @Patch('members/:memberId/role')
  @RequirePermissions('MEMBERS_UPDATE_ROLE')
  changeMemberRole(
    @OrgContext() context: OrganizationContext,
    @Param('memberId', new ResourceIdPipe(membershipNotFound)) memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ): Promise<MemberResponse> {
    return this.members.changeRole(context, memberId, body.role);
  }

  @Delete('members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('MEMBERS_REMOVE')
  removeMember(
    @OrgContext() context: OrganizationContext,
    @Param('memberId', new ResourceIdPipe(membershipNotFound)) memberId: string,
  ): Promise<void> {
    return this.members.remove(context, memberId);
  }

  @Post('ownership/transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('OWNERSHIP_TRANSFER')
  transferOwnership(
    @OrgContext() context: OrganizationContext,
    @Body() body: TransferOwnershipDto,
  ): Promise<TransferOwnershipResponse> {
    return this.members.transferOwnership(context, body.targetMemberId.toLowerCase());
  }

  // --- Invitations ----------------------------------------------------------------

  @Post('invitations')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('MEMBERS_INVITE')
  createInvitation(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateInvitationDto,
  ): Promise<CreatedInvitationResponse> {
    return this.invitations.create(context, body);
  }

  @Get('invitations')
  @RequirePermissions('MEMBERS_INVITE')
  listInvitations(@OrgContext() context: OrganizationContext): Promise<InvitationListResponse> {
    return this.invitations.list(context.organization.id);
  }

  @Delete('invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('MEMBERS_INVITE')
  revokeInvitation(
    @OrgContext() context: OrganizationContext,
    @Param('invitationId', new ResourceIdPipe(invitationNotFound)) invitationId: string,
  ): Promise<void> {
    return this.invitations.revoke(context, invitationId);
  }
}
