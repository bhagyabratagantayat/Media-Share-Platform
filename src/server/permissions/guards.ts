import { prisma } from '@/server/db/prisma';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { RoleType, ROLES } from './roles';
import { Permission, checkRolePermission } from './permissions';
import { verifyUserSessionToken, UserSessionPayload } from '@/server/auth/token';

export interface AuthenticatedContext {
  user: UserSessionPayload;
}

export interface OrganisationContext extends AuthenticatedContext {
  organisationId: string;
  membershipId: string;
  role: RoleType;
}

/**
 * Validates user session token and returns authenticated session payload.
 * Throws UnauthorizedError if token is missing or invalid.
 */
export async function requireAuth(sessionToken?: string | null): Promise<UserSessionPayload> {
  if (!sessionToken) {
    throw new UnauthorizedError('Authentication token is missing. Please log in.');
  }

  const session = await verifyUserSessionToken(sessionToken);
  if (!session) {
    throw new UnauthorizedError('Session is invalid or has expired.');
  }

  return session;
}

/**
 * Validates that an authenticated user is an active member of the specified organisation.
 * Throws ForbiddenError if user is not a member of this tenant.
 */
export async function requireOrganisationMembership(
  userId: string,
  organisationId: string
): Promise<{ membershipId: string; role: RoleType }> {
  if (!userId || !organisationId) {
    throw new ForbiddenError('Invalid user or organisation context.');
  }

  const membership = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId,
        userId,
      },
    },
    select: {
      id: true,
      role: true,
      status: true,
      organisation: {
        select: {
          status: true,
        },
      },
    },
  });

  if (!membership || membership.status !== 'ACTIVE') {
    throw new ForbiddenError('You do not belong to this organisation or your membership is inactive.');
  }

  if (membership.organisation.status !== 'ACTIVE') {
    throw new ForbiddenError('This organisation is currently suspended or inactive.');
  }

  return {
    membershipId: membership.id,
    role: membership.role as RoleType,
  };
}

/**
 * Validates that user has at least one of the required roles inside the specified organisation.
 */
export async function requireOrganisationRole(
  userId: string,
  organisationId: string,
  allowedRoles: RoleType[],
  isPlatformAdmin = false
): Promise<{ membershipId: string; role: RoleType }> {
  // Platform SuperAdmins bypass organisation role checks
  if (isPlatformAdmin) {
    return { membershipId: 'platform_admin_override', role: ROLES.PLATFORM_ADMIN };
  }

  const { membershipId, role } = await requireOrganisationMembership(userId, organisationId);

  if (!allowedRoles.includes(role)) {
    throw new ForbiddenError(
      `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: ${role}`
    );
  }

  return { membershipId, role };
}

/**
 * Validates that user's role in the organisation grants the required permission.
 */
export async function requirePermission(
  userId: string,
  organisationId: string,
  permission: Permission,
  isPlatformAdmin = false
): Promise<{ membershipId: string; role: RoleType }> {
  if (isPlatformAdmin) {
    return { membershipId: 'platform_admin_override', role: ROLES.PLATFORM_ADMIN };
  }

  const { membershipId, role } = await requireOrganisationMembership(userId, organisationId);

  if (!checkRolePermission(role, permission)) {
    throw new ForbiddenError(
      `Permission denied. Role '${role}' lacks permission: '${permission}' in organisation '${organisationId}'`
    );
  }

  return { membershipId, role };
}

/**
 * Strict Multi-Tenant Assertion Guard:
 * Verifies that a target resource belongs to the currently active organisation context.
 * Throws ForbiddenError (403) on cross-tenant tampering.
 */
export function assertTenantOwnership(
  resourceOrganisationId: string,
  activeOrganisationId: string,
  resourceName = 'Resource'
): void {
  if (resourceOrganisationId !== activeOrganisationId) {
    throw new ForbiddenError(
      `Cross-tenant access violation: ${resourceName} does not belong to active organisation.`
    );
  }
}
