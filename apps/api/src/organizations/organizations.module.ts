import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { OrganizationAccessGuard } from './organization-access.guard.js';
import { OrganizationController, OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

/**
 * Organizations, memberships, RBAC, and invitations. Authentication lives in
 * AuthModule ("who are you?"); this module answers "which organizations can
 * you access?" and "what may you do there?".
 */
@Module({
  controllers: [OrganizationsController, OrganizationController, InvitationsController],
  providers: [OrganizationsService, MembersService, InvitationsService, OrganizationAccessGuard],
  exports: [OrganizationAccessGuard],
})
export class OrganizationsModule {}
