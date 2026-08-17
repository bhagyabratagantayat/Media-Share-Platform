import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { checkRolePermission, PERMISSIONS } from '@/server/permissions/permissions';
import { Role, MemberStatus, UploadStatus } from '@prisma/client';

export interface AddTeamMemberInput {
  organisationId: string;
  email: string;
  role: 'SOCIAL_MEDIA_MANAGER' | 'SOCIAL_MEDIA_MEMBER' | 'MODERATOR';
  actorUserId: string;
}

export interface UpdateTeamRoleInput {
  organisationId: string;
  targetUserId: string;
  newRole: Role;
  actorUserId: string;
}

export interface RemoveTeamMemberInput {
  organisationId: string;
  targetUserId: string;
  actorUserId: string;
}

export class TeamService {
  /**
   * Verifies actor membership and role.
   */
  private static async getActorRole(userId: string, organisationId: string): Promise<RoleType> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isPlatformAdmin: true },
    });

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    if (user.isPlatformAdmin) {
      return ROLES.PLATFORM_ADMIN;
    }

    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId,
          userId,
        },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenError('You are not an active member of this organisation.');
    }

    return member.role as RoleType;
  }

  /**
   * Lists all media team and staff members of the organisation.
   */
  static async listTeamMembers(organisationId: string, actorUserId: string) {
    await this.getActorRole(actorUserId, organisationId);

    const members = await prisma.organisationMember.findMany({
      where: {
        organisationId,
        role: {
          in: [
            Role.ORGANISATION_OWNER,
            Role.ORGANISATION_ADMIN,
            Role.SOCIAL_MEDIA_MANAGER,
            Role.SOCIAL_MEDIA_MEMBER,
            Role.MODERATOR,
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            lastLoginAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return members;
  }

  /**
   * Adds an existing user to the media team.
   */
  static async addTeamMember(input: AddTeamMemberInput) {
    const { organisationId, email, role, actorUserId } = input;

    const actorRole = await this.getActorRole(actorUserId, organisationId);
    const canManage = checkRolePermission(actorRole, PERMISSIONS.TEAM_MANAGE);
    if (!canManage) {
      throw new ForbiddenError('You do not have permission to manage team members.');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      throw new NotFoundError(`User with email '${email}' was not found. They must register first.`);
    }

    const existingMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId,
          userId: user.id,
        },
      },
    });

    let member;
    if (existingMember) {
      if (
        existingMember.role === Role.ORGANISATION_OWNER ||
        existingMember.role === Role.ORGANISATION_ADMIN
      ) {
        throw new BadRequestError('User is already an organisation administrator or owner.');
      }

      member = await prisma.organisationMember.update({
        where: { id: existingMember.id },
        data: {
          role,
          status: MemberStatus.ACTIVE,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });
    } else {
      member = await prisma.organisationMember.create({
        data: {
          organisationId,
          userId: user.id,
          role,
          status: MemberStatus.ACTIVE,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        organisationId,
        actorUserId,
        action: 'SOCIAL_MEDIA_MEMBER_ADDED',
        resourceType: 'ORGANISATION_MEMBER',
        resourceId: member.id,
        metadata: {
          targetUserId: user.id,
          targetEmail: email,
          assignedRole: role,
        },
      },
    });

    return member;
  }

  /**
   * Updates the role of a team member.
   */
  static async updateTeamRole(input: UpdateTeamRoleInput) {
    const { organisationId, targetUserId, newRole, actorUserId } = input;

    const actorRole = await this.getActorRole(actorUserId, organisationId);
    const canManage = checkRolePermission(actorRole, PERMISSIONS.TEAM_MANAGE);
    if (!canManage) {
      throw new ForbiddenError('You do not have permission to change team roles.');
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestError('You cannot change your own role.');
    }

    const targetMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Team member not found in this organisation.');
    }

    if (targetMember.role === Role.ORGANISATION_OWNER && actorRole !== ROLES.PLATFORM_ADMIN) {
      throw new ForbiddenError('Only Platform Admins can modify Organisation Owner roles.');
    }

    const updatedMember = await prisma.organisationMember.update({
      where: { id: targetMember.id },
      data: { role: newRole },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        organisationId,
        actorUserId,
        action: 'SOCIAL_MEDIA_ROLE_CHANGED',
        resourceType: 'ORGANISATION_MEMBER',
        resourceId: targetMember.id,
        metadata: {
          targetUserId,
          previousRole: targetMember.role,
          newRole,
        },
      },
    });

    return updatedMember;
  }

  /**
   * Removes a member from the media team.
   */
  static async removeTeamMember(input: RemoveTeamMemberInput) {
    const { organisationId, targetUserId, actorUserId } = input;

    const actorRole = await this.getActorRole(actorUserId, organisationId);
    const canManage = checkRolePermission(actorRole, PERMISSIONS.TEAM_MANAGE);
    if (!canManage) {
      throw new ForbiddenError('You do not have permission to remove team members.');
    }

    if (actorUserId === targetUserId) {
      throw new BadRequestError('You cannot remove yourself from the team.');
    }

    const targetMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundError('Team member not found.');
    }

    if (targetMember.role === Role.ORGANISATION_OWNER) {
      throw new ForbiddenError('Organisation Owner cannot be removed from the team.');
    }

    // Demote to standard USER or remove membership
    await prisma.organisationMember.update({
      where: { id: targetMember.id },
      data: {
        role: Role.USER,
      },
    });

    // Invalidate active / created upload sessions for this user in this organisation
    await prisma.uploadSession.updateMany({
      where: {
        organisationId,
        userId: targetUserId,
        status: { in: [UploadStatus.CREATED, UploadStatus.UPLOADING] },
      },
      data: {
        status: UploadStatus.CANCELLED,
      },
    });

    await prisma.auditLog.create({
      data: {
        organisationId,
        actorUserId,
        action: 'SOCIAL_MEDIA_MEMBER_REMOVED',
        resourceType: 'ORGANISATION_MEMBER',
        resourceId: targetMember.id,
        metadata: {
          targetUserId,
          previousRole: targetMember.role,
        },
      },
    });

    return { success: true };
  }
}
