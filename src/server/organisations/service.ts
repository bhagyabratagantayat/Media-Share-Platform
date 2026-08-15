import { prisma } from '@/server/db/prisma';
import { hashPassword } from '@/server/auth/password';
import { ConflictError, NotFoundError, BadRequestError } from '@/lib/errors';
import { ROLES } from '@/server/permissions/roles';
import { OrgType } from '@prisma/client';

export interface CreateOrganisationInput {
  name: string;
  slug: string;
  type: OrgType;
  officialEmail: string;
  description?: string;
  contactPhone?: string;
  logoUrl?: string;
  coverUrl?: string;
  initialOwnerUserId: string;
  accessPassword?: string;
}

/**
 * Normalizes an organisation slug (lowercase, alphanumeric + hyphens).
 */
export function normalizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Creates a new Organisation, attaches the creator as ORGANISATION_OWNER,
 * initializes Argon2id access password settings, and logs an audit record.
 */
export async function createOrganisation(input: CreateOrganisationInput) {
  const cleanSlug = normalizeSlug(input.slug);
  if (!cleanSlug || cleanSlug.length < 3) {
    throw new BadRequestError('Organisation slug must be at least 3 characters long and URL-friendly.');
  }

  // Check slug uniqueness
  const existingOrg = await prisma.organisation.findUnique({
    where: { slug: cleanSlug },
  });
  if (existingOrg) {
    throw new ConflictError(`Organisation slug '${cleanSlug}' is already taken.`);
  }

  // Check owner user exists
  const ownerUser = await prisma.user.findUnique({
    where: { id: input.initialOwnerUserId },
  });
  if (!ownerUser) {
    throw new NotFoundError('Initial owner user account does not exist.');
  }

  // Generate access password hash if provided (or default secure random password)
  const defaultAccessPass = input.accessPassword || `OrgPass-${Math.random().toString(36).slice(2, 10)}`;
  const accessPasswordHash = await hashPassword(defaultAccessPass);

  // Atomic creation via transaction
  return await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: {
        name: input.name.trim(),
        slug: cleanSlug,
        type: input.type,
        officialEmail: input.officialEmail.toLowerCase().trim(),
        description: input.description?.trim(),
        contactPhone: input.contactPhone?.trim(),
        logoUrl: input.logoUrl,
        coverUrl: input.coverUrl,
        status: 'ACTIVE',
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
          },
        },
      },
      include: {
        accessSettings: {
          select: {
            enabled: true,
            passwordChangedAt: true,
            passwordExpiresAt: true,
          },
        },
      },
    });

    // Create Audit Log
    await tx.auditLog.create({
      data: {
        organisationId: org.id,
        actorUserId: ownerUser.id,
        action: 'ORGANISATION_CREATED',
        resourceType: 'ORGANISATION',
        resourceId: org.id,
        metadata: {
          name: org.name,
          slug: org.slug,
          type: org.type,
        },
      },
    });

    return org;
  });
}
