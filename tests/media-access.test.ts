import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaAccessService } from '@/server/cdn/media-access-service';
import { prisma } from '@/server/db/prisma';
import { setCdnProvider, MockCdnProvider } from '@/server/cdn';
import { ROLES } from '@/server/permissions/roles';
import { MediaStatus, EventStatus, EventVisibility, ApprovalStatus, VariantType } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockMediaFindUnique = vi.fn();
  const mockMediaFindMany = vi.fn();
  const mockAuditCreate = vi.fn();

  return {
    prisma: {
      mediaItem: {
        findUnique: mockMediaFindUnique,
        findMany: mockMediaFindMany,
      },
      auditLog: {
        create: mockAuditCreate,
      },
    },
  };
});

describe('Phase 6: MediaAccessService', () => {
  const mockCdn = new MockCdnProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    setCdnProvider(mockCdn);
  });

  it('authorizes and returns short-lived thumbnail CDN access for ready media', async () => {
    const mockMedia: any = {
      id: 'med-101',
      organisationId: 'org-1',
      eventId: 'ev-1',
      uploaderId: 'user-uploader',
      mediaType: 'IMAGE',
      originalFileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: BigInt(5000000),
      width: 4000,
      height: 3000,
      status: MediaStatus.READY,
      approvalStatus: ApprovalStatus.APPROVED,
      originalStorageKey: 'organisations/org-1/events/ev-1/media/med-101/original/photo.jpg',
      event: {
        id: 'ev-1',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        organisationId: 'org-1',
        allowDownloads: true,
      },
      variants: [
        {
          id: 'var-thumb',
          variantType: VariantType.THUMBNAIL,
          storageKey: 'organisations/org-1/events/ev-1/media/med-101/variants/thumb.webp',
          mimeType: 'image/webp',
          width: 400,
          height: 300,
          fileSize: BigInt(45000),
          status: MediaStatus.READY,
        },
      ],
    };

    (prisma.mediaItem.findUnique as any).mockResolvedValue(mockMedia);

    const result = await MediaAccessService.getAuthorizedMediaAccess({
      mediaId: 'med-101',
      variant: 'THUMBNAIL',
      userId: 'user-attendee',
    });

    expect(result.url).toContain('https://media.example.com');
    expect(result.url).toContain('thumb.webp');
    expect(result.variantType).toBe(VariantType.THUMBNAIL);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
    expect(result.fileSize).toBe(45000);
  });

  it('rejects access to processing media for ordinary attendees', async () => {
    const mockProcessingMedia: any = {
      id: 'med-102',
      organisationId: 'org-1',
      eventId: 'ev-1',
      uploaderId: 'user-other',
      status: MediaStatus.PROCESSING,
      approvalStatus: ApprovalStatus.APPROVED,
      originalStorageKey: 'organisations/org-1/events/ev-1/media/med-102/original/video.mp4',
      event: {
        id: 'ev-1',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        organisationId: 'org-1',
        allowDownloads: true,
      },
      variants: [],
    };

    (prisma.mediaItem.findUnique as any).mockResolvedValue(mockProcessingMedia);

    await expect(
      MediaAccessService.getAuthorizedMediaAccess({
        mediaId: 'med-102',
        userId: 'user-attendee',
      })
    ).rejects.toThrow('You do not have permission to view this media item.');
  });

  it('processes batch media access and blocks cross-organisation items', async () => {
    const mockItems: any[] = [
      {
        id: 'med-1',
        organisationId: 'org-1',
        status: MediaStatus.READY,
        originalFileName: 'pic1.jpg',
        mimeType: 'image/jpeg',
        originalStorageKey: 'org-1/pic1.jpg',
        event: {
          id: 'ev-1',
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PUBLIC,
          organisationId: 'org-1',
          allowDownloads: true,
        },
        variants: [
          {
            variantType: VariantType.THUMBNAIL,
            storageKey: 'org-1/thumb1.webp',
            mimeType: 'image/webp',
            width: 400,
            height: 300,
            status: MediaStatus.READY,
          },
        ],
      },
      {
        id: 'med-2',
        organisationId: 'org-OTHER-MALICIOUS',
        status: MediaStatus.READY,
        originalFileName: 'secret.jpg',
        mimeType: 'image/jpeg',
        originalStorageKey: 'other/secret.jpg',
        event: {
          id: 'ev-other',
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PRIVATE,
          organisationId: 'org-OTHER-MALICIOUS',
          allowDownloads: false,
        },
        variants: [],
      },
    ];

    (prisma.mediaItem.findMany as any).mockResolvedValue(mockItems);

    const batchResults = await MediaAccessService.getBatchMediaAccess({
      mediaIds: ['med-1', 'med-2'],
      organisationId: 'org-1',
      userId: 'user-1',
    });

    expect(batchResults.length).toBe(2);

    const item1 = batchResults.find((r) => r.mediaItemId === 'med-1')!;
    expect(item1.status).toBe('AUTHORIZED');
    expect(item1.url).toContain('thumb1.webp');

    const item2 = batchResults.find((r) => r.mediaItemId === 'med-2')!;
    expect(item2.status).toBe('DENIED');
    expect(item2.url).toBeUndefined();
  });
});
