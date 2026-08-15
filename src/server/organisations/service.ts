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
import { OrgType, OrgStatus, OrgPrivacy, Prisma } from '@prisma/client';

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
 * Creates an organisation atomically in a transaction with Owner membership,
 * Argon2id access settings, and an initial audit log record.
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

  const ownerUser = await prisma.user.findUnique({
    where: { id: input.initialOwnerUserId },
  });
  if (!ownerUser) {
    throw new NotFoundError('Owner user account does not exist.');
  }

  // Access Password validation & hashing
  const accessPassword = input.accessPassword || `OrgPass-${Math.random().toString(36).slice(2, 10)}!`;
  if (accessPassword.length < 6) {
    throw new BadRequestError('Organisation access password must be at least 6 characters long.');
  }
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
            status: 'ACTIVE',
          },
        },
        accessSettings: {
          create: {
            passwordHash: accessPasswordHash,
            enabled: true,
            accessVersion: 1,
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
 * Lists discoverable and public organisations with server-side pagination and search filters.
 */
export async function listOrganisations(params: ListOrganisationsParams) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(50, Math.max(1, params.limit || 12));
  const skip = (page - 1) * limit;

  const where: Prisma.OrganisationWhereInput = {
    status: OrgStatus.ACTIVE,
    privacy: { in: [OrgPrivacy.DISCOVERABLE, OrgPrivacy.PUBLIC] },
  };

  if (params.type) {
    where.type = params.type;
  }

  if (params.city) {
    where.city = { contains: params.city, mode: 'insensitive' };
  }

  if (params.search) {
    const term = params.search.trim();
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { slug: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
      { state: { contains: term, mode: 'insensitive' } },
    ];
  }

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
  userAgent?: string
) {
  if (!newAccessPassword || newAccessPassword.length < 6) {
    throw new BadRequestError('New access password must be at least 6 characters long.');
  }

  // Guard: Verify user has ORG_ACCESS_MANAGE permission
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
  },
  ipAddress?: string,
  userAgent?: string
) {
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

  if (member && member.status === 'ACTIVE') {
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
      isMember: Boolean(member && member.status === 'ACTIVE'),
      accessSettingsEnabled: org.accessSettings?.enabled ?? false,
    },
  };
}
