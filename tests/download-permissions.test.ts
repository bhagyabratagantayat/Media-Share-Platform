import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canDownloadMedia, canDownloadOriginal } from '@/server/permissions/event-guards';
import { MediaAccessService } from '@/server/cdn/media-access-service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { MediaStatus, EventStatus, EventVisibility, ApprovalStatus, MediaVisibility, VariantType } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockMediaFindUnique = vi.fn();
  const mockAuditCreate = vi.fn();

  return {
    prisma: {
      mediaItem: {
        findUnique: mockMediaFindUnique,
      },
      auditLog: {
        create: mockAuditCreate,
      },
    },
  };
});

describe('Phase 6: Media Download Permissions & Auditing', () => {
  const baseEvent = {
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    organisationId: 'org-1',
    allowDownloads: true,
  };

  const baseMedia = {
    status: MediaStatus.READY,
    visibility: MediaVisibility.PUBLIC,
    approvalStatus: ApprovalStatus.APPROVED,
    uploaderId: 'user-uploader',
  };

  it('allows normal attendees to download when event allowDownloads is true', () => {
    expect(canDownloadMedia(baseMedia, baseEvent, ROLES.USER, false, 'user-attendee')).toBe(true);
  });

  it('blocks normal attendees from downloading when event allowDownloads is false', () => {
    const noDownloadEvent = { ...baseEvent, allowDownloads: false };
    expect(canDownloadMedia(baseMedia, noDownloadEvent, ROLES.USER, false, 'user-attendee')).toBe(false);
  });

  it('allows staff and original uploader to download even if event allowDownloads is false', () => {
    const noDownloadEvent = { ...baseEvent, allowDownloads: false };
    expect(canDownloadMedia(baseMedia, noDownloadEvent, ROLES.ORGANISATION_ADMIN, true, 'admin-1')).toBe(true);
    expect(canDownloadMedia(baseMedia, noDownloadEvent, ROLES.USER, false, 'user-uploader')).toBe(true);
  });

  it('restricts original master downloads to staff/uploader by default', () => {
    expect(canDownloadOriginal(baseMedia, baseEvent, ROLES.USER, false, 'user-attendee')).toBe(false);
    expect(canDownloadOriginal(baseMedia, baseEvent, ROLES.ORGANISATION_OWNER, true, 'owner-1')).toBe(true);
    expect(canDownloadOriginal(baseMedia, baseEvent, ROLES.USER, false, 'user-uploader')).toBe(true);
  });

  it('records audit log when download is authorized', async () => {
    const mockMedia: any = {
      id: 'med-201',
      organisationId: 'org-1',
      eventId: 'ev-1',
      uploaderId: 'uploader-1',
      originalFileName: 'high_res_concert.jpg',
      mimeType: 'image/jpeg',
      fileSize: BigInt(8000000),
      originalFileSize: BigInt(8000000),
      status: MediaStatus.READY,
      approvalStatus: ApprovalStatus.APPROVED,
      originalStorageKey: 'org-1/ev-1/med-201/original.jpg',
      event: {
        id: 'ev-1',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
        organisationId: 'org-1',
        allowDownloads: true,
      },
      variants: [
        {
          id: 'var-1',
          variantType: VariantType.OPTIMIZED,
          storageKey: 'org-1/ev-1/med-201/optimized.webp',
          mimeType: 'image/webp',
          fileSize: BigInt(750000),
          status: MediaStatus.READY,
        },
      ],
    };

    (prisma.mediaItem.findUnique as any).mockResolvedValue(mockMedia);
    (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-1' });

    const downloadResult = await MediaAccessService.getAuthorizedMediaDownload({
      mediaId: 'med-201',
      isOriginal: false,
      userId: 'attendee-1',
      userRole: ROLES.USER,
      hasOrgAccess: true,
    });

    expect(downloadResult.downloadUrl).toContain('optimized.webp');
    expect(downloadResult.filename).toBe('optimized_high_res_concert.jpg');
    expect(downloadResult.fileSize).toBe(750000);

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'MEDIA_DOWNLOAD_REQUESTED',
        resourceType: 'MEDIA_ITEM',
        resourceId: 'med-201',
        actorUserId: 'attendee-1',
      }),
    });
  });
});
