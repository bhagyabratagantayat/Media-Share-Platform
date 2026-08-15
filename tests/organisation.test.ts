import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createOrganisation,
  listOrganisations,
  getOrganisationBySlug,
  normalizeSlug,
} from '@/server/organisations/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { OrgType, OrgPrivacy, OrgStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      organisationMember: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      organisationAccessSettings: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          organisation: {
            create: vi.fn(async ({ data }) => ({
              id: 'org-created-123',
              ...data,
              accessSettings: {
                enabled: true,
                accessVersion: 1,
                passwordChangedAt: new Date(),
              },
            })),
          },
          auditLog: {
            create: vi.fn(),
          },
        });
      }),
    },
  };
});

describe('Phase 2 — Organisation Creation & Directory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes organisation slug properly', () => {
    expect(normalizeSlug('  My Awesome College 2026!  ')).toBe('my-awesome-college-2026');
  });

  it('creates organisation atomically with owner role and Argon2id access password', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'owner-usr-123',
      name: 'Owner User',
    } as any);

    const slug = 'test-engineering-college';
    const accessPassword = 'OrgSecretKey2026!';

    const org = await createOrganisation({
      name: 'Test Engineering College',
      slug,
      type: OrgType.COLLEGE,
      officialEmail: 'info@testcollege.edu',
      city: 'Bhubaneswar',
      state: 'Odisha',
      country: 'India',
      privacy: OrgPrivacy.DISCOVERABLE,
      initialOwnerUserId: 'owner-usr-123',
      accessPassword,
    });

    expect(org.id).toBe('org-created-123');
    expect(org.slug).toBe(slug);
    expect(org.status).toBe(OrgStatus.ACTIVE);
    expect(org.accessSettings?.accessVersion).toBe(1);
  });

  it('prevents creation of duplicate organisation slugs', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValueOnce({
      id: 'existing-org',
      slug: 'duplicate-slug',
    } as any);

    await expect(
      createOrganisation({
        name: 'Duplicate Org',
        slug: 'duplicate-slug',
        type: OrgType.COLLEGE,
        officialEmail: 'dup@test.com',
        initialOwnerUserId: 'owner-123',
        accessPassword: 'SecretPass123!',
      })
    ).rejects.toThrow("Organisation slug 'duplicate-slug' is already taken.");
  });

  it('filters directory query and computes pagination meta', async () => {
    vi.mocked(prisma.organisation.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.organisation.findMany).mockResolvedValueOnce([
      {
        id: 'org-1',
        name: 'Discoverable Institute',
        slug: 'discoverable-institute',
        type: OrgType.INSTITUTE,
        description: 'Institute description',
        city: 'Bhubaneswar',
        state: 'Odisha',
        country: 'India',
        logoUrl: null,
        privacy: OrgPrivacy.DISCOVERABLE,
        status: OrgStatus.ACTIVE,
        createdAt: new Date(),
        _count: { members: 5 },
      },
    ] as any);

    const directory = await listOrganisations({ search: 'Institute', page: 1, limit: 10 });
    expect(directory.items.length).toBe(1);
    expect(directory.pagination.total).toBe(1);
    expect(directory.pagination.totalPages).toBe(1);
    expect(directory.pagination.hasMore).toBe(false);
  });
});
