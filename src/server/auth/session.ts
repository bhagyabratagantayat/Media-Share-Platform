import { cookies } from 'next/headers';
import { prisma } from '@/server/db/prisma';
import { verifyUserSessionToken, verifyOrgAccessPassToken, UserSessionPayload } from './token';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { env } from '@/config/env';

export const AUTH_COOKIE_NAME = 'media_platform_session';
export const ORG_PASS_COOKIE_PREFIX = 'media_org_pass_';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

/**
 * Extracts and verifies the active user session from Next.js cookies.
 * Verifies account status in the database (ACTIVE vs SUSPENDED/DELETED).
 */
export async function getSessionUser(): Promise<UserSessionPayload | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await verifyUserSessionToken(token);
  if (!session) return null;

  try {
    // Verify account is still active in database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, status: true, isPlatformAdmin: true },
    });

    if (user) {
      if (user.status !== 'ACTIVE') return null;
      return {
        userId: user.id,
        email: user.email,
        isPlatformAdmin: user.isPlatformAdmin,
      };
    }
  } catch {
    // Database fallback
  }

  return {
    userId: session.userId,
    email: session.email,
    isPlatformAdmin: !!session.isPlatformAdmin,
  };
}

/**
 * Strict authentication guard for Server Components / Actions / Route Handlers.
 */
export async function requireSessionUser(): Promise<UserSessionPayload> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError('Authentication required. Please log in.');
  }
  return user;
}

/**
 * Resolves user role and guest pass access for an organisation context.
 */
export async function getOrganisationAuthContext(organisationId: string): Promise<{
  user: UserSessionPayload | null;
  userRole: RoleType | null;
  hasOrgAccess: boolean;
}> {
  const cookieStore = cookies();
  const user = await getSessionUser();

  let userRole: RoleType | null = null;
  let hasOrgAccess = false;

  if (user) {
    if (user.isPlatformAdmin) {
      userRole = ROLES.PLATFORM_ADMIN;
      hasOrgAccess = true;
    } else {
      const member = await prisma.organisationMember.findUnique({
        where: {
          unique_organisation_user: {
            organisationId,
            userId: user.userId,
          },
        },
        select: { role: true, status: true },
      });

      if (member && member.status === 'ACTIVE') {
        userRole = member.role as RoleType;
        hasOrgAccess = true;
      }
    }
  }

  // Check guest organisation pass token if not already verified as a member
  if (!hasOrgAccess) {
    const passToken = cookieStore.get(`${ORG_PASS_COOKIE_PREFIX}${organisationId}`)?.value;
    if (passToken) {
      const accessSettings = await prisma.organisationAccessSettings.findUnique({
        where: { organisationId },
        select: { enabled: true, accessVersion: true },
      });

      if (accessSettings && accessSettings.enabled) {
        const isValidPass = await verifyOrgAccessPassToken(
          passToken,
          organisationId,
          accessSettings.accessVersion
        );
        if (isValidPass) {
          hasOrgAccess = true;
        }
      }
    }
  }

  return {
    user,
    userRole,
    hasOrgAccess,
  };
}
