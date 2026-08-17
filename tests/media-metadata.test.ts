import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMediaMetadata,
  getMediaItemById,
  listMediaByEvent,
  updateMediaMetadata,
  deleteMediaMetadata,
} from '@/server/media/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { MediaType, MediaStatus, MediaVisibility, ApprovalStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockMediaItemCreate = vi.fn();
  const mockMediaVariantCreate = vi.fn();
  const mockMediaItemFindUnique = vi.fn();
  const mockMediaItemFindMany = vi.fn();
  const mockMediaItemUpdate = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockAlbumFindUnique = vi.fn();
  const mockAuditLogCreate = vi.fn();
  const mockUserFindUnique = vi.fn();
  const mockMemberFindUnique = vi.fn();

  return {
    prisma: {
      mediaItem: {
        create: mockMediaItemCreate,
        findUnique: mockMediaItemFindUnique,
        findMany: mockMediaItemFindMany,
        update: mockMediaItemUpdate,
      },
      mediaVariant: {
        create: mockMediaVariantCreate,
      },
      event: {
        findUnique: mockEventFindUnique,
      },
      album: {
        findUnique: mockAlbumFindUnique,
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
          mediaItem: {
            create: mockMediaItemCreate,
            update: mockMediaItemUpdate,
          },
          mediaVariant: {
            create: mockMediaVariantCreate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 3: Media Metadata Foundation & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates media metadata and deterministic storage key entries', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_1',
      organisationId: 'org_1',
      allowUserUploads: false,
      faceSearchEnabled: true,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_staff_1',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_1',
      role: ROLES.SOCIAL_MEDIA_MEMBER,
      status: 'ACTIVE',
    } as any);

    const mockCreatedMedia = {
      id: 'med_999',
      organisationId: 'org_1',
      eventId: 'evt_1',
      originalFileName: 'independence_day_flag.jpg',
      mediaType: MediaType.IMAGE,
      fileSize: BigInt(3500000),
      mimeType: 'image/jpeg',
      originalStorageKey: 'organisations/org_1/events/evt_1/media/med_999/original',
      status: MediaStatus.READY,
    };

    vi.mocked(prisma.mediaItem.create).mockResolvedValue(mockCreatedMedia as any);
    vi.mocked(prisma.mediaVariant.create).mockResolvedValue({ id: 'var_1' } as any);

    const result = await createMediaMetadata({
      organisationId: 'org_1',
      eventId: 'evt_1',
      uploaderId: 'usr_staff_1',
      mediaType: MediaType.IMAGE,
      originalFileName: 'independence_day_flag.jpg',
      mimeType: 'image/jpeg',
      fileSize: 3500000,
      width: 3840,
      height: 2160,
    });

    expect(result.originalFileName).toBe('independence_day_flag.jpg');
    expect(prisma.mediaItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organisationId: 'org_1',
          eventId: 'evt_1',
          originalStorageKey: expect.stringMatching(/^organisations\/org_1\/events\/evt_1\/media\/.*\/original$/),
        }),
      })
    );
    expect(prisma.mediaVariant.create).toHaveBeenCalled();
  });

  it('rejects community upload when allowUserUploads is disabled on the event', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_restricted',
      organisationId: 'org_1',
      allowUserUploads: false, // Closed to users
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_student',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_student',
      role: ROLES.USER,
      status: 'ACTIVE',
    } as any);

    await expect(
      createMediaMetadata({
        organisationId: 'org_1',
        eventId: 'evt_restricted',
        uploaderId: 'usr_student',
        mediaType: MediaType.IMAGE,
        originalFileName: 'my_photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024000,
      })
    ).rejects.toThrow(/do not have permission/);
  });

  it('allows community upload when allowUserUploads is enabled on the event', async () => {
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: 'evt_open',
      organisationId: 'org_1',
      allowUserUploads: true, // Open to community
      faceSearchEnabled: false,
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'usr_student',
      isPlatformAdmin: false,
    } as any);

    vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
      id: 'mem_student',
      role: ROLES.USER,
      status: 'ACTIVE',
    } as any);

    vi.mocked(prisma.mediaItem.create).mockResolvedValue({
      id: 'med_open_1',
      originalFileName: 'student_pic.jpg',
    } as any);

    const res = await createMediaMetadata({
      organisationId: 'org_1',
      eventId: 'evt_open',
      uploaderId: 'usr_student',
      mediaType: MediaType.IMAGE,
      originalFileName: 'student_pic.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1024000,
    });

    expect(res.id).toBe('med_open_1');
  });

  it('soft-deletes media metadata by updating status to DELETED', async () => {
    vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
      id: 'med_del',
      organisationId: 'org_1',
      uploaderId: 'usr_uploader',
      status: MediaStatus.READY,
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

    vi.mocked(prisma.mediaItem.update).mockResolvedValue({
      id: 'med_del',
      status: MediaStatus.DELETED,
    } as any);

    const result = await deleteMediaMetadata('med_del', 'usr_admin');
    expect(result.status).toBe(MediaStatus.DELETED);
    expect(prisma.mediaItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'med_del' },
        data: { status: MediaStatus.DELETED },
      })
    );
  });
});
