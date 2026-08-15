import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyAndGrantOrganisationAccess,
  rotateOrganisationAccessPassword,
  getOrganisationDashboard,
} from '@/server/organisations/service';
import { hashPassword } from '@/server/auth/password';
import { verifyOrgAccessPassToken, signOrgAccessPassToken } from '@/server/auth/token';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { OrgStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn(),
      },
      organisationMember: {
        findUnique: vi.fn(),
      },
      organisationAccessSettings: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

describe('Phase 2 — Organisation Access Password & Instant Revocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants access with valid organisation password and issues scoped pass token', async () => {
    const orgId = 'org-gate-123';
    const password = 'SuperSecretGate2026!';
    const passwordHash = await hashPassword(password);

    vi.mocked(prisma.organisationAccessSettings.findUnique).mockResolvedValueOnce({
      id: 'settings-123',
      organisationId: orgId,
      passwordHash,
      enabled: true,
      accessVersion: 1,
      organisation: {
        id: orgId,
        name: 'Gate Test Org',
        slug: 'gate-test-org',
        status: OrgStatus.ACTIVE,
      },
    } as any);

    const accessResult = await verifyAndGrantOrganisationAccess(orgId, password);
    expect(accessResult.success).toBe(true);
    expect(accessResult.passToken).toBeDefined();

    // Verify pass token validates against orgId and version 1
    const isValid = await verifyOrgAccessPassToken(accessResult.passToken, orgId, 1);
    expect(isValid).toBe(true);
  });

  it('rejects access when incorrect password is provided', async () => {
    const orgId = 'org-gate-123';
    const passwordHash = await hashPassword('CorrectPassword123!');

    vi.mocked(prisma.organisationAccessSettings.findUnique).mockResolvedValueOnce({
      id: 'settings-123',
      organisationId: orgId,
      passwordHash,
      enabled: true,
      accessVersion: 1,
      organisation: {
        id: orgId,
        name: 'Gate Test Org',
        slug: 'gate-test-org',
        status: OrgStatus.ACTIVE,
      },
    } as any);

    await expect(
      verifyAndGrantOrganisationAccess(orgId, 'WrongPassword456!')
    ).rejects.toThrow('Incorrect organisation access password.');
  });

  it('invalidates existing sessions when password is rotated with invalidateSessions: true', async () => {
    const orgId = 'org-rotate-123';
    const userId = 'owner-usr-123';

    // Verify owner membership check
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce({
      id: 'mem-123',
      organisationId: orgId,
      userId,
      role: ROLES.ORGANISATION_OWNER,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.organisationAccessSettings.update).mockResolvedValueOnce({
      enabled: true,
      accessVersion: 2,
      passwordChangedAt: new Date(),
    } as any);

    const rotationResult = await rotateOrganisationAccessPassword(
      orgId,
      userId,
      'BrandNewGatePassword123!',
      true
    );

    expect(rotationResult.accessVersion).toBe(2);

    // Verify old pass token (issued at version 1) fails verification against version 2
    const oldPassToken = await signOrgAccessPassToken(orgId, 1);
    const isOldPassValid = await verifyOrgAccessPassToken(oldPassToken, orgId, 2);
    expect(isOldPassValid).toBe(false);

    // Verify new pass token (issued at version 2) succeeds verification against version 2
    const newPassToken = await signOrgAccessPassToken(orgId, 2);
    const isNewPassValid = await verifyOrgAccessPassToken(newPassToken, orgId, 2);
    expect(isNewPassValid).toBe(true);
  });
});
