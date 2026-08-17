import { prisma } from '@/server/db/prisma';
import { hashPassword, verifyPassword } from '@/server/auth/password';
import { signOrgAccessPassToken, verifyOrgAccessPassToken } from '@/server/auth/token';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '@/lib/errors';
import { ROLES, RoleType } from '@/server/permissions/roles';
import { PERMISSIONS, checkRolePermission } from '@/server/permissions/permissions';
import { OrgType, OrgStatus, OrgPrivacy, Prisma, Role, MemberStatus } from '@prisma/client';

export interface CreateOrganisationInput {
  name: string;
  slug: string;
  type: OrgType;
  officialEmail: string;
  contactPhone?: string;
  country?: string;
  state?: string;
  city?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  privacy?: OrgPrivacy;
  initialOwnerUserId: string;
  accessPassword?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ListOrganisationsParams {
  search?: string;
  type?: OrgType;
  city?: string;
  page?: number;
  limit?: number;
  requestingUserId?: string;
}

export function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validates access password strength (min 6 chars, not trivially simple).
 */
export function validateAccessPassword(password: string, slug?: string): void {
  if (!password || password.length < 6) {
    throw new BadRequestError('Organisation access password must be at least 6 characters long.');
  }
  const lower = password.toLowerCase().trim();
  const trivial = ['password', '123456', '12345678', 'admin123', 'access123', 'passcode'];
  if (trivial.includes(lower) || (slug && lower === slug.toLowerCase())) {
    throw new BadRequestError('Access password is too simple. Please choose a stronger passcode.');
  }
}

/**
 * Creates an organisation atomically in a transaction with Owner membership,
 * Argon2id access settings, default storage quota, and an initial audit log record.
 */
export async function createOrganisation(input: CreateOrganisationInput) {
  const cleanSlug = normalizeSlug(input.slug);
  if (!cleanSlug || cleanSlug.length < 3) {
    throw new BadRequestError('Organisation slug must be at least 3 characters long and URL-friendly.');
  }

  if (!input.name || input.name.trim().length < 2) {
    throw new BadRequestError('Organisation name must be at least 2 characters long.');
  }

  const existingOrg = await prisma.organisation.findUnique({
    where: { slug: cleanSlug },
  });
  if (existingOrg) {
    throw new ConflictError(`Organisation slug '${cleanSlug}' is already taken.`);
  }

  let ownerUser = await prisma.user.findUnique({
    where: { id: input.initialOwnerUserId },
  });

  if (!ownerUser) {
    try {
      ownerUser = await prisma.user.upsert({
        where: { id: input.initialOwnerUserId },
        update: {},
        create: {
          id: input.initialOwnerUserId,
          email: input.officialEmail.toLowerCase().trim(),
          name: input.officialEmail.split('@')[0],
          passwordHash: 'FIREBASE_AUTH_MANAGED',
          status: 'ACTIVE',
        },
      });
    } catch {
      // If email exists with another ID, try finding by email
      ownerUser = await prisma.user.findUnique({
        where: { email: input.officialEmail.toLowerCase().trim() },
      });
    }
  }

  if (!ownerUser) {
    throw new NotFoundError('Owner user account could not be initialized.');
  }

  // Access Password validation & hashing
  const accessPassword = input.accessPassword || `OrgPass-${Math.random().toString(36).slice(2, 10)}!`;
  validateAccessPassword(accessPassword, cleanSlug);
  const accessPasswordHash = await hashPassword(accessPassword);

  return await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: {
        name: input.name.trim(),
        slug: cleanSlug,
        type: input.type,
        officialEmail: input.officialEmail.toLowerCase().trim(),
        contactPhone: input.contactPhone?.trim(),
        country: input.country?.trim(),
        state: input.state?.trim(),
        city: input.city?.trim(),
        website: input.website?.trim(),
        description: input.description?.trim(),
        logoUrl: input.logoUrl,
        coverUrl: input.coverUrl,
        privacy: input.privacy || OrgPrivacy.DISCOVERABLE,
        status: OrgStatus.ACTIVE,
        members: {
          create: {
            userId: ownerUser.id,
            role: ROLES.ORGANISATION_OWNER,
            status: MemberStatus.ACTIVE,
          },
        },
        accessSettings: {
          create: {
            passwordHash: accessPasswordHash,
            enabled: true,
            accessVersion: 1,
          },
        },
        quota: {
          create: {
            storageLimitBytes: BigInt(53687091200), // Default 50 GB
            storageUsedBytes: BigInt(0),
            storageReservedBytes: BigInt(0),
            maxConcurrentUploads: 20,
          },
        },
      },
      include: {
        accessSettings: {
          select: {
            enabled: true,
            accessVersion: true,
            passwordChangedAt: true,
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: org.id,
        actorUserId: ownerUser.id,
        action: 'ORGANISATION_CREATED',
        resourceType: 'ORGANISATION',
        resourceId: org.id,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          name: org.name,
          slug: org.slug,
          type: org.type,
          privacy: org.privacy,
        },
      },
    });

    return org;
  });
}

/**
 * Lists discoverable, public or member-accessible organisations with server-side pagination and search filters.
 */
export async function listOrganisations(params: ListOrganisationsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(50, Math.max(1, params.limit || 12));
  const skip = (page - 1) * limit;

  const where: Prisma.OrganisationWhereInput = {
    status: OrgStatus.ACTIVE,
    OR: [
      { privacy: { in: [OrgPrivacy.DISCOVERABLE, OrgPrivacy.PUBLIC] } },
      ...(params.requestingUserId
        ? [
            {
              members: {
                some: {
                  userId: params.requestingUserId,
                  status: MemberStatus.ACTIVE,
                },
              },
            },
          ]
        : []),
    ],
  };

  if (params.type) {
    where.type = params.type;
  }

  if (params.city) {
    where.city = { contains: params.city, mode: 'insensitive' };
  }

  if (params.search) {
    const term = params.search.trim();
    where.AND = [
      {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
          { state: { contains: term, mode: 'insensitive' } },
        ],
      },
    ];
  }

  try {
    const [total, items] = await Promise.all([
      prisma.organisation.count({ where }),
      prisma.organisation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          description: true,
          city: true,
          state: true,
          country: true,
          logoUrl: true,
          privacy: true,
          status: true,
          createdAt: true,
          _count: {
            select: { members: true },
          },
        },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  } catch {
    return {
      items: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
        hasMore: false,
      },
    };
  }
}

/**
 * Retrieves organization details by slug (safe public profile).
 */
export async function getOrganisationBySlug(slug: string, requestingUserId?: string) {
  const cleanSlug = normalizeSlug(slug);
  const org = await prisma.organisation.findUnique({
    where: { slug: cleanSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      description: true,
      officialEmail: true,
      contactPhone: true,
      country: true,
      state: true,
      city: true,
      website: true,
      logoUrl: true,
      coverUrl: true,
      privacy: true,
      status: true,
      createdAt: true,
      accessSettings: {
        select: {
          enabled: true,
          accessVersion: true,
        },
      },
      _count: {
        select: { members: true },
      },
    },
  });

  if (!org) {
    throw new NotFoundError('Organisation not found.');
  }

  let userMembership = null;
  if (requestingUserId) {
    userMembership = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: org.id,
          userId: requestingUserId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });
  }

  return {
    ...org,
    userMembership,
  };
}

/**
 * Retrieves all organisations where a user is an active member.
 */
export async function getUserOrganisations(userId: string) {
  const memberships = await prisma.organisationMember.findMany({
    where: {
      userId,
      status: MemberStatus.ACTIVE,
      organisation: {
        status: { in: [OrgStatus.ACTIVE, OrgStatus.PENDING] },
      },
    },
    include: {
      organisation: {
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          logoUrl: true,
          city: true,
          status: true,
          privacy: true,
          accessSettings: {
            select: {
              enabled: true,
              accessVersion: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return memberships.map((m) => ({
    organisation: m.organisation,
    role: m.role,
    joinedAt: m.createdAt,
  }));
}

/**
 * Verifies organisation access password and issues an access pass token.
 */
export async function verifyAndGrantOrganisationAccess(
  orgId: string,
  plainAccessPassword: string,
  userId?: string,
  ipAddress?: string,
  userAgent?: string
) {
  if (!plainAccessPassword) {
    throw new BadRequestError('Access password is required.');
  }

  const accessSettings = await prisma.organisationAccessSettings.findUnique({
    where: { organisationId: orgId },
    include: {
      organisation: {
        select: { id: true, name: true, slug: true, status: true },
      },
    },
  });

  if (!accessSettings || !accessSettings.enabled) {
    throw new ForbiddenError('Access password is not enabled for this organisation.');
  }

  if (accessSettings.organisation.status !== OrgStatus.ACTIVE) {
    throw new ForbiddenError('This organisation is currently suspended or inactive.');
  }

  const isValid = await verifyPassword(plainAccessPassword, accessSettings.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError('Incorrect organisation access password.');
  }

  // Generate signed access token bound to organisation and current accessVersion
  const passToken = await signOrgAccessPassToken(orgId, accessSettings.accessVersion);

  // Record Audit Log
  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId: userId || null,
      action: 'ORGANISATION_ACCESS_GRANTED',
      resourceType: 'ORGANISATION',
      resourceId: orgId,
      ipAddress,
      userAgent,
    },
  });

  return {
    success: true,
    passToken,
    organisation: accessSettings.organisation,
  };
}

/**
 * Rotates or updates organisation access password (Owner/Admin only).
 * If `invalidateSessions` is true, increments `accessVersion` to instantly invalidate past passes.
 */
export async function rotateOrganisationAccessPassword(
  orgId: string,
  actorUserId: string,
  newAccessPassword: string,
  invalidateSessions = true,
  ipAddress?: string,
  userAgent?: string,
  isPlatformAdmin = false
) {
  validateAccessPassword(newAccessPassword);

  if (!isPlatformAdmin) {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!member || !checkRolePermission(member.role as RoleType, PERMISSIONS.ORG_ACCESS_MANAGE)) {
      throw new ForbiddenError('You do not have permission to manage this organisation access settings.');
    }
  }

  const newHash = await hashPassword(newAccessPassword);

  const updatedSettings = await prisma.organisationAccessSettings.update({
    where: { organisationId: orgId },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      ...(invalidateSessions ? { accessVersion: { increment: 1 } } : {}),
    },
    select: {
      enabled: true,
      accessVersion: true,
      passwordChangedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_ACCESS_PASSWORD_ROTATED',
      resourceType: 'ORGANISATION_ACCESS_SETTINGS',
      resourceId: orgId,
      ipAddress,
      userAgent,
      metadata: { invalidateSessions, newVersion: updatedSettings.accessVersion },
    },
  });

  return updatedSettings;
}

/**
 * Toggles organisation access password protection on or off (Owner/Admin only).
 */
export async function toggleOrganisationAccessPassword(
  orgId: string,
  actorUserId: string,
  enabled: boolean,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (!isPlatformAdmin) {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!member || !checkRolePermission(member.role as RoleType, PERMISSIONS.ORG_ACCESS_MANAGE)) {
      throw new ForbiddenError('You do not have permission to modify organisation access settings.');
    }
  }

  const updated = await prisma.organisationAccessSettings.update({
    where: { organisationId: orgId },
    data: {
      enabled,
      ...(enabled ? { accessVersion: { increment: 1 } } : {}),
    },
    select: {
      enabled: true,
      accessVersion: true,
      passwordChangedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: enabled ? 'ORGANISATION_ACCESS_PASSWORD_ENABLED' : 'ORGANISATION_ACCESS_PASSWORD_DISABLED',
      resourceType: 'ORGANISATION_ACCESS_SETTINGS',
      resourceId: orgId,
      ipAddress,
      userAgent,
      metadata: { enabled, accessVersion: updated.accessVersion },
    },
  });

  return updated;
}

/**
 * Revokes all active organisation guest sessions instantly by incrementing accessVersion.
 */
export async function revokeAllOrganisationSessions(
  orgId: string,
  actorUserId: string,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (!isPlatformAdmin) {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!member || !checkRolePermission(member.role as RoleType, PERMISSIONS.ORG_ACCESS_MANAGE)) {
      throw new ForbiddenError('You do not have permission to revoke organisation access sessions.');
    }
  }

  const updated = await prisma.organisationAccessSettings.update({
    where: { organisationId: orgId },
    data: {
      accessVersion: { increment: 1 },
    },
    select: {
      enabled: true,
      accessVersion: true,
      passwordChangedAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_SESSIONS_REVOKED',
      resourceType: 'ORGANISATION_ACCESS_SETTINGS',
      resourceId: orgId,
      ipAddress,
      userAgent,
      metadata: { newAccessVersion: updated.accessVersion },
    },
  });

  return updated;
}

/**
 * Transfers organisation ownership to another active member atomically.
 * Demotes previous owner(s) to ORGANISATION_ADMIN and sets the new owner.
 */
export async function transferOrganisationOwnership(
  orgId: string,
  actorUserId: string,
  targetUserId: string,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (actorUserId === targetUserId) {
    throw new BadRequestError('Cannot transfer ownership to yourself.');
  }

  if (!isPlatformAdmin) {
    const actorMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!actorMember || actorMember.role !== ROLES.ORGANISATION_OWNER) {
      throw new ForbiddenError('Only the current organisation owner can initiate ownership transfer.');
    }
  }

  const targetMember = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId: orgId,
        userId: targetUserId,
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!targetMember || targetMember.status !== MemberStatus.ACTIVE) {
    throw new NotFoundError('Target user must be an active member of this organisation.');
  }

  return await prisma.$transaction(async (tx) => {
    // Demote current owner(s) to ORGANISATION_ADMIN
    await tx.organisationMember.updateMany({
      where: {
        organisationId: orgId,
        role: ROLES.ORGANISATION_OWNER,
      },
      data: {
        role: ROLES.ORGANISATION_ADMIN,
      },
    });

    // Promote target member to ORGANISATION_OWNER
    const updatedTarget = await tx.organisationMember.update({
      where: { id: targetMember.id },
      data: {
        role: ROLES.ORGANISATION_OWNER,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: orgId,
        actorUserId,
        action: 'ORGANISATION_OWNER_TRANSFERRED',
        resourceType: 'ORGANISATION',
        resourceId: orgId,
        ipAddress,
        userAgent,
        metadata: {
          previousOwnerId: actorUserId,
          newOwnerId: targetUserId,
          newOwnerEmail: targetMember.user.email,
        },
      },
    });

    return updatedTarget;
  });
}

/**
 * Updates a member's role inside the organisation.
 * Blocks self-modification, role escalation, and demoting the final owner.
 */
export async function updateMemberRole(
  orgId: string,
  actorUserId: string,
  targetUserId: string,
  newRole: RoleType,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (actorUserId === targetUserId && !isPlatformAdmin) {
    throw new ForbiddenError('You cannot modify your own role.');
  }

  if (!isPlatformAdmin) {
    const actorMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!actorMember || !checkRolePermission(actorMember.role as RoleType, PERMISSIONS.TEAM_MANAGE)) {
      throw new ForbiddenError('You do not have permission to manage member roles.');
    }

    if (newRole === ROLES.ORGANISATION_OWNER) {
      throw new ForbiddenError('Use the ownership transfer process to assign the owner role.');
    }
  }

  const targetMember = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId: orgId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMember) {
    throw new NotFoundError('Member not found in this organisation.');
  }

  if (targetMember.role === ROLES.ORGANISATION_OWNER && !isPlatformAdmin) {
    throw new ForbiddenError('Cannot change the role of the organisation owner without owner transfer.');
  }

  const updated = await prisma.organisationMember.update({
    where: { id: targetMember.id },
    data: { role: newRole as Role },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_MEMBER_ROLE_CHANGED',
      resourceType: 'ORGANISATION_MEMBER',
      resourceId: updated.id,
      ipAddress,
      userAgent,
      metadata: { targetUserId, oldRole: targetMember.role, newRole },
    },
  });

  return updated;
}

/**
 * Removes a member from the organisation.
 * Blocks self-removal and removal of the organisation owner.
 */
export async function removeMember(
  orgId: string,
  actorUserId: string,
  targetUserId: string,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (actorUserId === targetUserId && !isPlatformAdmin) {
    throw new ForbiddenError('You cannot remove yourself. Use leave organisation instead.');
  }

  if (!isPlatformAdmin) {
    const actorMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!actorMember || !checkRolePermission(actorMember.role as RoleType, PERMISSIONS.TEAM_MANAGE)) {
      throw new ForbiddenError('You do not have permission to remove members.');
    }
  }

  const targetMember = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId: orgId,
        userId: targetUserId,
      },
    },
  });

  if (!targetMember) {
    throw new NotFoundError('Member not found in this organisation.');
  }

  if (targetMember.role === ROLES.ORGANISATION_OWNER) {
    throw new ForbiddenError('Cannot remove the organisation owner. Transfer ownership first.');
  }

  await prisma.organisationMember.delete({
    where: { id: targetMember.id },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_MEMBER_REMOVED',
      resourceType: 'ORGANISATION_MEMBER',
      resourceId: targetMember.id,
      ipAddress,
      userAgent,
      metadata: { targetUserId, removedRole: targetMember.role },
    },
  });

  return { success: true };
}

/**
 * Invites or adds a registered user directly as a member of an organisation.
 */
export async function inviteOrAddMember(
  orgId: string,
  actorUserId: string,
  input: { email: string; role?: RoleType },
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  const email = input.email.toLowerCase().trim();
  const role = input.role || ROLES.USER;

  if (role === ROLES.ORGANISATION_OWNER) {
    throw new ForbiddenError('Cannot invite a user directly as organisation owner.');
  }

  if (!isPlatformAdmin) {
    const actorMember = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!actorMember || !checkRolePermission(actorMember.role as RoleType, PERMISSIONS.TEAM_INVITE)) {
      throw new ForbiddenError('You do not have permission to invite members to this organisation.');
    }
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new NotFoundError(`No user found with email '${email}'. The user must register an account first.`);
  }

  const existingMember = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId: orgId,
        userId: user.id,
      },
    },
  });

  if (existingMember) {
    if (existingMember.status === MemberStatus.ACTIVE) {
      throw new ConflictError('User is already an active member of this organisation.');
    }
    const updated = await prisma.organisationMember.update({
      where: { id: existingMember.id },
      data: { status: MemberStatus.ACTIVE, role: role as Role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return updated;
  }

  const newMember = await prisma.organisationMember.create({
    data: {
      organisationId: orgId,
      userId: user.id,
      role: role as Role,
      status: MemberStatus.ACTIVE,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_MEMBER_ADDED',
      resourceType: 'ORGANISATION_MEMBER',
      resourceId: newMember.id,
      ipAddress,
      userAgent,
      metadata: { targetUserId: user.id, email, role },
    },
  });

  return newMember;
}

/**
 * Updates organisation status (ACTIVE, SUSPENDED, ARCHIVED).
 * Platform admin can suspend/activate; Owner can archive/activate.
 */
export async function updateOrganisationStatus(
  orgId: string,
  actorUserId: string,
  status: OrgStatus,
  isPlatformAdmin = false,
  ipAddress?: string,
  userAgent?: string
) {
  if (!isPlatformAdmin) {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!member || member.role !== ROLES.ORGANISATION_OWNER) {
      throw new ForbiddenError('Only the organisation owner or platform admin can change organisation status.');
    }

    if (status === OrgStatus.SUSPENDED) {
      throw new ForbiddenError('Only platform administrators can suspend an organisation.');
    }
  }

  const updated = await prisma.organisation.update({
    where: { id: orgId },
    data: { status },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_STATUS_CHANGED',
      resourceType: 'ORGANISATION',
      resourceId: orgId,
      ipAddress,
      userAgent,
      metadata: { newStatus: status },
    },
  });

  return updated;
}

/**
 * Updates general organisation profile settings (Owner/Admin only).
 */
export async function updateOrganisationSettings(
  orgId: string,
  actorUserId: string,
  updates: {
    name?: string;
    description?: string;
    officialEmail?: string;
    contactPhone?: string;
    country?: string;
    state?: string;
    city?: string;
    website?: string;
    privacy?: OrgPrivacy;
    allowOriginalDownloads?: boolean;
    allowVideoDownloads?: boolean;
    allowPhotoDownloads?: boolean;
    allowBulkDownloads?: boolean;
  },
  ipAddress?: string,
  userAgent?: string,
  isPlatformAdmin = false
) {
  if (!isPlatformAdmin) {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: orgId,
          userId: actorUserId,
        },
      },
    });

    if (!member || !checkRolePermission(member.role as RoleType, PERMISSIONS.ORG_UPDATE)) {
      throw new ForbiddenError('You do not have permission to update organisation settings.');
    }
  }

  const org = await prisma.organisation.update({
    where: { id: orgId },
    data: {
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
      ...(updates.officialEmail ? { officialEmail: updates.officialEmail.toLowerCase().trim() } : {}),
      ...(updates.contactPhone !== undefined ? { contactPhone: updates.contactPhone.trim() } : {}),
      ...(updates.country !== undefined ? { country: updates.country.trim() } : {}),
      ...(updates.state !== undefined ? { state: updates.state.trim() } : {}),
      ...(updates.city !== undefined ? { city: updates.city.trim() } : {}),
      ...(updates.website !== undefined ? { website: updates.website.trim() } : {}),
      ...(updates.privacy ? { privacy: updates.privacy } : {}),
      ...(updates.allowOriginalDownloads !== undefined ? { allowOriginalDownloads: updates.allowOriginalDownloads } : {}),
      ...(updates.allowVideoDownloads !== undefined ? { allowVideoDownloads: updates.allowVideoDownloads } : {}),
      ...(updates.allowPhotoDownloads !== undefined ? { allowPhotoDownloads: updates.allowPhotoDownloads } : {}),
      ...(updates.allowBulkDownloads !== undefined ? { allowBulkDownloads: updates.allowBulkDownloads } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      organisationId: orgId,
      actorUserId,
      action: 'ORGANISATION_UPDATED',
      resourceType: 'ORGANISATION',
      resourceId: orgId,
      ipAddress,
      userAgent,
      metadata: { updatedFields: Object.keys(updates) },
    },
  });

  return org;
}

/**
 * Retrieves organisation dashboard details with strict access verification.
 * Requires user to be an active member OR provide a valid unexpired access pass token.
 */
export async function getOrganisationDashboard(
  slug: string,
  userId: string,
  passToken?: string
) {
  const cleanSlug = normalizeSlug(slug);
  const org = await prisma.organisation.findUnique({
    where: { slug: cleanSlug },
    include: {
      accessSettings: {
        select: {
          enabled: true,
          accessVersion: true,
        },
      },
      _count: {
        select: { members: true },
      },
    },
  });

  if (!org) {
    throw new NotFoundError('Organisation not found.');
  }

  if (org.status !== OrgStatus.ACTIVE) {
    throw new ForbiddenError('This organisation is suspended or inactive.');
  }

  // 1. Check if user is an active member
  const member = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId: org.id,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  let hasAccess = false;
  let userRole: RoleType | 'GUEST_ACCESS' = 'GUEST_ACCESS';

  if (member && member.status === MemberStatus.ACTIVE) {
    hasAccess = true;
    userRole = member.role as RoleType;
  } else if (passToken && org.accessSettings) {
    // 2. Validate Org Access Pass token against current accessVersion
    const isPassValid = await verifyOrgAccessPassToken(
      passToken,
      org.id,
      org.accessSettings.accessVersion
    );
    if (isPassValid) {
      hasAccess = true;
      userRole = 'GUEST_ACCESS';
    }
  }

  if (!hasAccess) {
    throw new ForbiddenError('You do not have active access to this organisation. Please enter the access password.');
  }

  return {
    organisation: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      type: org.type,
      description: org.description,
      city: org.city,
      state: org.state,
      country: org.country,
      logoUrl: org.logoUrl,
      coverUrl: org.coverUrl,
      status: org.status,
      privacy: org.privacy,
      createdAt: org.createdAt,
      memberCount: org._count.members,
    },
    access: {
      hasAccess: true,
      userRole,
      isMember: Boolean(member && member.status === MemberStatus.ACTIVE),
      accessSettingsEnabled: org.accessSettings?.enabled ?? false,
    },
  };
}
