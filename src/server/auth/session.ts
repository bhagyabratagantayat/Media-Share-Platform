import { cookies } from 'next/headers';
import { prisma } from '@/server/db/prisma';
import { verifyUserSessionToken, UserSessionPayload } from './token';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';
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

  // Verify account is still active in database
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, status: true, isPlatformAdmin: true },
  });

  if (!user || user.status !== 'ACTIVE') {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
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
