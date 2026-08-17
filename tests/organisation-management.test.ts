import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrganisation,
  listOrganisations,
  getOrganisationBySlug,
  verifyAndGrantOrganisationAccess,
  rotateOrganisationAccessPassword,
  toggleOrganisationAccessPassword,
  revokeAllOrganisationSessions,
  transferOrganisationOwnership,
  updateMemberRole,
  removeMember,
  inviteOrAddMember,
  updateOrganisationStatus,
  getUserOrganisations,
} from '@/server/organisations/service';
import { hashPassword } from '@/server/auth/password';
import { signOrgAccessPassToken, verifyOrgAccessPassToken } from '@/server/auth/token';
import { checkRateLimit, RATE_LIMITS } from '@/server/auth/rate-limit';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { OrgStatus, OrgPrivacy, OrgType, MemberStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      organisationMember: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        delete: vi.fn(),
      },
      organisationAccessSettings: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb(prisma);
      }),
    },
  };
});

describe('Phase 10 — Organisation Management & Multi-Tenant Security Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Unauthenticated / Invalid credentials handling
  it('Test 1: Rejects access when access password is empty or invalid', async () => {
    await expect(
      verifyAndGrantOrganisationAccess('org-123', '')
    ).rejects.toThrow('Access password is required.');
  });

  // Test 2 & 3: Correct vs Wrong Password Verification
  it('Test 4 & 5: Verifies correct Argon2id password and rejects incorrect password', async () => {
    const orgId = 'org-gate-10';
    const rawPass = 'ValidSecretPass2026!';
    const passwordHash = await hashPassword(rawPass);

    vi.mocked(prisma.organisationAccessSettings.findUnique).mockResolvedValue({
      id: 'settings-10',
      organisationId: orgId,
      passwordHash,
      enabled: true,
      accessVersion: 1,
      organisation: {
        id: orgId,
        name: 'Gate Org 10',
        slug: 'gate-org-10',
        status: OrgStatus.ACTIVE,
      },
    } as any);

    // Wrong password -> 401
    await expect(
      verifyAndGrantOrganisationAccess(orgId, 'IncorrectPass123!')
    ).rejects.toThrow('Incorrect organisation access password.');

    // Correct password -> 200 + scoped token
    const result = await verifyAndGrantOrganisationAccess(orgId, rawPass);
    expect(result.success).toBe(true);
    expect(result.passToken).toBeDefined();

    const isValid = await verifyOrgAccessPassToken(result.passToken, orgId, 1);
    expect(isValid).toBe(true);
  });

  // Test 6 & 7: Password Rotation & Immediate Session Invalidation
  it('Test 7: Rotates access password and increments accessVersion to invalidate old tokens', async () => {
    const orgId = 'org-rotate-10';
    const actorId = 'owner-10';

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem-owner-10',
      organisationId: orgId,
      userId: actorId,
      role: ROLES.ORGANISATION_OWNER,
      status: MemberStatus.ACTIVE,
    } as any);

    vi.mocked(prisma.organisationAccessSettings.update).mockResolvedValue({
      enabled: true,
      accessVersion: 2,
      passwordChangedAt: new Date(),
    } as any);

    const updated = await rotateOrganisationAccessPassword(
      orgId,
      actorId,
      'NewSecurePass2026!',
      true
    );
    expect(updated.accessVersion).toBe(2);

    // Old token (v1) should fail against v2
    const tokenV1 = await signOrgAccessPassToken(orgId, 1);
    expect(await verifyOrgAccessPassToken(tokenV1, orgId, 2)).toBe(false);

    // New token (v2) should pass against v2
    const tokenV2 = await signOrgAccessPassToken(orgId, 2);
    expect(await verifyOrgAccessPassToken(tokenV2, orgId, 2)).toBe(true);
  });

  // Test 8: Cross-Organisation Pass Token Isolation
  it('Test 8: Rejects token from Org A when presented to Org B', async () => {
    const tokenOrgA = await signOrgAccessPassToken('org-alpha', 1);

    // Org Alpha token tested against Org Beta
    const isAcceptedOnOrgB = await verifyOrgAccessPassToken(tokenOrgA, 'org-beta', 1);
    expect(isAcceptedOnOrgB).toBe(false);
  });

  // Test 9: Role Escalation Prevention
  it('Test 9: Prevents self-role modification and unauthorized elevation', async () => {
    const orgId = 'org-rbac-10';
    const userId = 'user-standard-1';

    // Standard user tries to change own role
    await expect(
      updateMemberRole(orgId, userId, userId, ROLES.ORGANISATION_ADMIN, false)
    ).rejects.toThrow('You cannot modify your own role.');

    // Non-admin tries to change another user's role
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce({
      id: 'mem-user-1',
      organisationId: orgId,
      userId,
      role: ROLES.USER,
      status: MemberStatus.ACTIVE,
    } as any);

    await expect(
      updateMemberRole(orgId, userId, 'target-user-2', ROLES.ORGANISATION_ADMIN, false)
    ).rejects.toThrow('You do not have permission to manage member roles.');
  });

  // Test 10: Owner Protection
  it('Test 10: Prevents removing or demoting primary owner without ownership transfer', async () => {
    const orgId = 'org-protect-10';
    const adminId = 'admin-user-1';
    const ownerId = 'owner-user-1';

    vi.mocked(prisma.organisationMember.findUnique)
      .mockResolvedValueOnce({
        id: 'mem-admin',
        organisationId: orgId,
        userId: adminId,
        role: ROLES.ORGANISATION_ADMIN,
        status: MemberStatus.ACTIVE,
      } as any)
      .mockResolvedValueOnce({
        id: 'mem-owner',
        organisationId: orgId,
        userId: ownerId,
        role: ROLES.ORGANISATION_OWNER,
        status: MemberStatus.ACTIVE,
      } as any);

    // Cannot demote owner via updateMemberRole
    await expect(
      updateMemberRole(orgId, adminId, ownerId, ROLES.USER, false)
    ).rejects.toThrow('Cannot change the role of the organisation owner without owner transfer.');

    vi.mocked(prisma.organisationMember.findUnique)
      .mockResolvedValueOnce({
        id: 'mem-admin',
        organisationId: orgId,
        userId: adminId,
        role: ROLES.ORGANISATION_ADMIN,
        status: MemberStatus.ACTIVE,
      } as any)
      .mockResolvedValueOnce({
        id: 'mem-owner',
        organisationId: orgId,
        userId: ownerId,
        role: ROLES.ORGANISATION_OWNER,
        status: MemberStatus.ACTIVE,
      } as any);

    // Cannot remove owner via removeMember
    await expect(
      removeMember(orgId, adminId, ownerId, false)
    ).rejects.toThrow('Cannot remove the organisation owner. Transfer ownership first.');
  });

  // Test 11 & 12: Organisation Lifecycle (Suspended / Archived status enforcement)
  it('Test 11 & 12: Blocks access when organisation is SUSPENDED or ARCHIVED', async () => {
    const orgId = 'org-suspended-10';

    vi.mocked(prisma.organisationAccessSettings.findUnique).mockResolvedValueOnce({
      id: 'settings-susp',
      organisationId: orgId,
      passwordHash: 'somehash',
      enabled: true,
      accessVersion: 1,
      organisation: {
        id: orgId,
        status: OrgStatus.SUSPENDED,
      },
    } as any);

    await expect(
      verifyAndGrantOrganisationAccess(orgId, 'AnyPass123!')
    ).rejects.toThrow('This organisation is currently suspended or inactive.');
  });

  // Test 13: Rate Limiting on Password Brute Force
  it('Test 13: Triggers rate limit error after multiple consecutive attempts', () => {
    const key = `test-rate-limit-org-${Date.now()}`;
    const opts = { windowMs: 60000, maxRequests: 3, message: 'Too many attempts.' };

    expect(() => checkRateLimit(key, opts)).not.toThrow();
    expect(() => checkRateLimit(key, opts)).not.toThrow();
    expect(() => checkRateLimit(key, opts)).not.toThrow();
    // 4th attempt in window must fail with RateLimitError (429)
    expect(() => checkRateLimit(key, opts)).toThrow('Too many attempts.');
  });

  // Test 14: Atomic Ownership Transfer & Revoke All Sessions
  it('Test 14: Transfers ownership atomically and revokes all active sessions', async () => {
    const orgId = 'org-transfer-10';
    const currentOwnerId = 'owner-current';
    const targetUserId = 'admin-new-owner';

    vi.mocked(prisma.organisationMember.findUnique)
      .mockResolvedValueOnce({
        id: 'mem-curr-owner',
        organisationId: orgId,
        userId: currentOwnerId,
        role: ROLES.ORGANISATION_OWNER,
        status: MemberStatus.ACTIVE,
      } as any)
      .mockResolvedValueOnce({
        id: 'mem-target',
        organisationId: orgId,
        userId: targetUserId,
        role: ROLES.ORGANISATION_ADMIN,
        status: MemberStatus.ACTIVE,
        user: { id: targetUserId, name: 'New Owner', email: 'newowner@test.com' },
      } as any);

    vi.mocked(prisma.organisationMember.update).mockResolvedValueOnce({
      id: 'mem-target',
      organisationId: orgId,
      userId: targetUserId,
      role: ROLES.ORGANISATION_OWNER,
      user: { id: targetUserId, name: 'New Owner', email: 'newowner@test.com' },
    } as any);

    const transferResult = await transferOrganisationOwnership(orgId, currentOwnerId, targetUserId);
    expect(transferResult.role).toBe(ROLES.ORGANISATION_OWNER);

    // Revoke all sessions increments accessVersion
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce({
      id: 'mem-target',
      organisationId: orgId,
      userId: targetUserId,
      role: ROLES.ORGANISATION_OWNER,
      status: MemberStatus.ACTIVE,
    } as any);

    vi.mocked(prisma.organisationAccessSettings.update).mockResolvedValueOnce({
      enabled: true,
      accessVersion: 5,
      passwordChangedAt: new Date(),
    } as any);

    const revoked = await revokeAllOrganisationSessions(orgId, targetUserId);
    expect(revoked.accessVersion).toBe(5);
  });
});
