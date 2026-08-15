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
 */
export async function signOrgAccessPassToken(orgId: string): Promise<string> {
  return await new SignJWT({ orgId, accessGranted: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(sessionSecretKey);
}

/**
 * Verifies an organisation-scoped access pass token.
 */
export async function verifyOrgAccessPassToken(token: string, expectedOrgId: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey);
    const pass = payload as OrgAccessPassPayload;
    return pass.orgId === expectedOrgId && pass.accessGranted === true;
  } catch {
    return false;
  }
}
