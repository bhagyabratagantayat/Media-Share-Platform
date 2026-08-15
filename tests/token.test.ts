import { describe, it, expect } from 'vitest';
import {
  signUserSessionToken,
  verifyUserSessionToken,
  signOrgAccessPassToken,
  verifyOrgAccessPassToken,
} from '../src/server/auth/token';

describe('JWT & Session Tokens', () => {
  it('should sign and verify a user session token', async () => {
    const payload = {
      userId: 'usr_12345678',
      email: 'student@example.test',
      isPlatformAdmin: false,
    };

    const token = await signUserSessionToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const verified = await verifyUserSessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe(payload.userId);
    expect(verified?.email).toBe(payload.email);
    expect(verified?.isPlatformAdmin).toBe(false);
  });

  it('should return null for tampered or invalid user session tokens', async () => {
    const validToken = await signUserSessionToken({
      userId: 'usr_abc',
      email: 'valid@example.test',
      isPlatformAdmin: false,
    });

    const tamperedToken = validToken.slice(0, -5) + 'xxxxx';
    const result = await verifyUserSessionToken(tamperedToken);
    expect(result).toBeNull();
  });

  it('should sign and verify an organisation access pass token', async () => {
    const orgId = 'org_99999999';
    const token = await signOrgAccessPassToken(orgId);

    const isValidForOrg = await verifyOrgAccessPassToken(token, orgId);
    expect(isValidForOrg).toBe(true);

    const isValidForDifferentOrg = await verifyOrgAccessPassToken(token, 'org_different_tenant');
    expect(isValidForDifferentOrg).toBe(false);
  });
});
