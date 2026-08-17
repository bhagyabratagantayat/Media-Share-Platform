import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAlbum, getAlbumById, listAlbumsByEvent, reorderAlbums, archiveAlbum } from '@/server/albums/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { AlbumStatus, EventStatus, EventVisibility } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockAlbumCreate = vi.fn();
  const mockAlbumFindUnique = vi.fn();
  const mockAlbumFindFirst = vi.fn();
  const mockAlbumFindMany = vi.fn();
  const mockAlbumUpdate = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockAuditLogCreate = vi.fn();
  const mockUserFindUnique = vi.fn();
  const mockMemberFindUnique = vi.fn();

  return {
    prisma: {
      album: {
        create: mockAlbumCreate,
        findUnique: mockAlbumFindUnique,
        findFirst: mockAlbumFindFirst,
        findMany: mockAlbumFindMany,
        update: mockAlbumUpdate,
      },
      event: {
        findUnique: mockEventFindUnique,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      user: {
        findUnique: mockUserFindUnique,
      },
      organisationMember: {
        findUnique: mockMemberFindUnique,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          album: {
            create: mockAlbumCreate,
            update: mockAlbumUpdate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 3: Albums Service & Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an album with automatic sortOrder assignment and audit logging', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_1',
      organisationId: 'org_1',
      status: EventStatus.PUBLISHED,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_mgr_1',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_mgr',
      role: ROLES.SOCIAL_MEDIA_MANAGER,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.album.findUnique).mockResolvedValue(null); // No slug collision
    vi.mocked(prisma.album.findFirst).mockResolvedValue({ sortOrder: 2 } as any); // Existing max is 2 -> next is 3

    const createdRecord = {
      id: 'alb_101',
      organisationId: 'org_1',
      eventId: 'evt_1',
      name: 'Flag Hoisting',
      slug: 'flag-hoisting',
      sortOrder: 3,
      status: AlbumStatus.PUBLISHED,
    };

    vi.mocked(prisma.album.create).mockResolvedValue(createdRecord as any);

    const result = await createAlbum({
      organisationId: 'org_1',
      eventId: 'evt_1',
      name: 'Flag Hoisting',
      createdByUserId: 'usr_mgr_1',
    });

    expect(result.id).toBe('alb_101');
    expect(result.sortOrder).toBe(3);
    expect(prisma.album.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Flag Hoisting',
          slug: 'flag-hoisting',
          sortOrder: 3,
        }),
      })
    );
  });

  it('strictly blocks cross-tenant tampering when creating an album for another org event', async () => {
    // Event belongs to org_2, but caller specifies org_1
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_foreign',
      organisationId: 'org_2',
    } as any);

    await expect(
      createAlbum({
        organisationId: 'org_1',
        eventId: 'evt_foreign',
        name: 'Malicious Album',
        createdByUserId: 'usr_mgr_1',
      })
    ).rejects.toThrow(/Cross-tenant access violation/);
  });

  it('reorders albums inside an event atomically', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_1',
      organisationId: 'org_1',
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_admin',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_admin',
      role: ROLES.ORGANISATION_ADMIN,
      status: 'ACTIVE',
    } as any);

    const result = await reorderAlbums('evt_1', 'usr_admin', ['alb_3', 'alb_1', 'alb_2']);

    expect(result).toBe(true);
    expect(prisma.album.update).toHaveBeenCalledTimes(3);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'ALBUM_REORDERED',
          resourceType: 'EVENT',
          resourceId: 'evt_1',
        }),
      })
    );
  });

  it('soft-archives an album', async () => {
    vi.mocked(prisma.album.findUnique).mockResolvedValue({
      id: 'alb_old',
      organisationId: 'org_1',
      status: AlbumStatus.PUBLISHED,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_admin',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_admin',
      role: ROLES.ORGANISATION_ADMIN,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.album.update).mockResolvedValue({
      id: 'alb_old',
      status: AlbumStatus.ARCHIVED,
    } as any);

    const result = await archiveAlbum('alb_old', 'usr_admin');
    expect(result.status).toBe(AlbumStatus.ARCHIVED);
  });
});
