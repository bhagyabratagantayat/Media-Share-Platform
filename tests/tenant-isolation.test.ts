import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrganisationDashboard,
  updateOrganisationSettings,
  rotateOrganisationAccessPassword,
} from '@/server/organisations/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { OrgStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn(),
        update: vi.fn(),
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

describe('Phase 2 — Multi-Tenant Isolation & Role Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents cross-tenant access without valid membership or pass token', async () => {
    const slugB = 'tenant-b-slug';
    const orgBId = 'org-b-456';
    const userAId = 'usr-a-123';

    vi.mocked(prisma.organisation.findUnique).mockResolvedValueOnce({
      id: orgBId,
      name: 'Tenant B Org',
      slug: slugB,
      status: OrgStatus.ACTIVE,
      accessSettings: { enabled: true, accessVersion: 1 },
      _count: { members: 10 },
    } as any);

    // User A has no membership in Org B
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce(null);

    // Access to dashboard is DENIED
    await expect(
      getOrganisationDashboard(slugB, userAId)
    ).rejects.toThrow('You do not have active access to this organisation.');
  });

  it('prevents unauthorized users from updating organisation settings', async () => {
    const orgBId = 'org-b-456';
    const userAId = 'usr-a-123';

    // User A has no membership in Org B
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce(null);

    await expect(
      updateOrganisationSettings(orgBId, userAId, { name: 'Hacked Org Name' })
    ).rejects.toThrow('You do not have permission to update organisation settings.');
  });

  it('prevents regular members (role: USER) from rotating organisation access password', async () => {
    const orgId = 'org-123';
    const regularUserId = 'usr-regular-456';

    // Member has USER role which lacks ORG_ACCESS_MANAGE permission
    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValueOnce({
      id: 'mem-456',
      organisationId: orgId,
      userId: regularUserId,
      role: ROLES.USER,
      status: 'ACTIVE',
    } as any);

    await expect(
      rotateOrganisationAccessPassword(orgId, regularUserId, 'NewPassword123!', true)
    ).rejects.toThrow('You do not have permission to manage this organisation access settings.');
  });
});
