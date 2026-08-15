import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { env } from '@/config/env';

const authSecretKey = new TextEncoder().encode(env.AUTH_SECRET);
const sessionSecretKey = new TextEncoder().encode(env.SESSION_SECRET);

export interface UserSessionPayload extends JWTPayload {
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
}

export interface OrgAccessPassPayload extends JWTPayload {
  orgId: string;
  accessGranted: boolean;
  version: number;
}

/**
 * Signs a user session JWT (Valid for 7 days).
 */
export async function signUserSessionToken(payload: Omit<UserSessionPayload, 'iat' | 'exp'>): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(authSecretKey);
}

/**
 * Verifies and decodes a user session JWT.
 */
export async function verifyUserSessionToken(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, authSecretKey);
    return payload as UserSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Signs an organisation-scoped access gate pass token (Valid for 24 hours).
 * Includes accessVersion for instant revocation on password rotation.
 */
export async function signOrgAccessPassToken(orgId: string, version = 1): Promise<string> {
  return await new SignJWT({ orgId, accessGranted: true, version })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(sessionSecretKey);
}

/**
 * Verifies an organisation-scoped access pass token against expected orgId and current accessVersion.
 */
export async function verifyOrgAccessPassToken(
  token: string,
  expectedOrgId: string,
  expectedVersion?: number
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey);
    const pass = payload as OrgAccessPassPayload;

    if (pass.orgId !== expectedOrgId || pass.accessGranted !== true) {
      return false;
    }

    // If expectedVersion is specified, verify token was issued under active password version
    if (expectedVersion !== undefined && pass.version !== expectedVersion) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
