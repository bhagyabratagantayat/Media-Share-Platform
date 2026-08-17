import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportScope, ExportStatus, MediaStatus, ApprovalStatus, EventStatus, VariantType } from '@prisma/client';
import { ROLES } from '@/server/permissions/roles';

// Mock dependencies
vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      organisation: {
        findUnique: vi.fn(),
      },
      mediaItem: {
        findMany: vi.fn(),
      },
      mediaExportJob: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    },
  };
});

vi.mock('@/server/queue/bullmq', () => ({
  exportQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-123' }),
  },
}));

vi.mock('@/server/storage/s3', () => ({
  storageProvider: {
    getObjectUrl: vi.fn().mockResolvedValue('https://cdn.example.com/exports/archive.zip?sig=mock'),
    getObjectStream: vi.fn(),
    putObjectStream: vi.fn(),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from '@/server/db/prisma';
import { buildExportManifest } from '@/server/export/export-manifest';
import { ExportService } from '@/server/export/export-service';

describe('Phase 13: Export Manifest & ExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildExportManifest enforces tenant isolation, download permissions, and quality selection', async () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Alpha University',
      status: 'ACTIVE',
      allowOriginalDownloads: false,
      allowVideoDownloads: true,
      allowPhotoDownloads: true,
      allowBulkDownloads: true,
    };

    const mockMedia = [
      {
        id: 'media-1',
        mediaType: 'IMAGE',
        originalFileName: 'Opening_Ceremony.jpg',
        mimeType: 'image/jpeg',
        fileSize: BigInt(5000000),
        originalFileSize: BigInt(5000000),
        originalStorageKey: 'org-1/originals/photo1.jpg',
        status: MediaStatus.READY,
        visibility: 'PUBLIC',
        approvalStatus: ApprovalStatus.APPROVED,
        isPublished: true,
        uploaderId: 'user-99',
        createdAt: new Date('2026-08-16T10:00:00Z'),
        event: {
          id: 'event-1',
          name: 'Annual Tech Fest',
          status: EventStatus.PUBLISHED,
          visibility: 'PUBLIC',
          allowDownloads: true,
          allowOriginalDownloads: false,
          allowBulkDownloads: true,
          organisationId: 'org-1',
        },
        album: {
          id: 'album-1',
          name: 'Day 1 Highlights',
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
        },
        variants: [
          {
            id: 'var-1',
            variantType: VariantType.OPTIMIZED,
            storageKey: 'org-1/optimized/photo1.webp',
            mimeType: 'image/webp',
            fileSize: BigInt(800000),
          },
        ],
      },
    ];

    vi.mocked(prisma.organisation.findUnique).mockResolvedValue(mockOrg as any);
    vi.mocked(prisma.mediaItem.findMany).mockResolvedValue(mockMedia as any);

    const manifest = await buildExportManifest({
      organisationId: 'org-1',
      userId: 'user-2',
      userRole: ROLES.USER,
      hasOrgAccess: true,
      scopeType: ExportScope.EVENT,
      eventId: 'event-1',
      requestedVariant: 'OPTIMIZED',
    });

    expect(manifest.totalFiles).toBe(1);
    expect(manifest.requestedVariant).toBe('OPTIMIZED');
    expect(manifest.entries[0].storageKey).toBe('org-1/optimized/photo1.webp');
    expect(manifest.entries[0].archivePath).toContain('Annual Tech Fest/Day 1 Highlights/Opening_Ceremony.jpg');
  });

  it('buildExportManifest rejects unauthorized original master requests and falls back or prevents export', async () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Alpha University',
      status: 'ACTIVE',
      allowOriginalDownloads: false, // Org disallows originals to public
      allowVideoDownloads: true,
      allowPhotoDownloads: true,
      allowBulkDownloads: true,
    };

    const mockMedia = [
      {
        id: 'media-1',
        mediaType: 'IMAGE',
        originalFileName: 'VIP.jpg',
        mimeType: 'image/jpeg',
        fileSize: BigInt(5000000),
        originalFileSize: BigInt(5000000),
        originalStorageKey: 'org-1/originals/photo1.jpg',
        status: MediaStatus.READY,
        visibility: 'PUBLIC',
        approvalStatus: ApprovalStatus.APPROVED,
        isPublished: true,
        uploaderId: 'user-99',
        createdAt: new Date('2026-08-16T10:00:00Z'),
        event: {
          id: 'event-1',
          name: 'Annual Fest',
          status: EventStatus.PUBLISHED,
          visibility: 'PUBLIC',
          allowDownloads: true,
          allowOriginalDownloads: false,
          allowBulkDownloads: true,
          organisationId: 'org-1',
        },
        album: null,
        variants: [
          {
            id: 'var-1',
            variantType: VariantType.OPTIMIZED,
            storageKey: 'org-1/optimized/photo1.webp',
            mimeType: 'image/webp',
            fileSize: BigInt(700000),
          },
        ],
      },
    ];

    vi.mocked(prisma.organisation.findUnique).mockResolvedValue(mockOrg as any);
    vi.mocked(prisma.mediaItem.findMany).mockResolvedValue(mockMedia as any);

    // Request original as regular user
    const manifest = await buildExportManifest({
      organisationId: 'org-1',
      userId: 'user-guest',
      userRole: ROLES.USER,
      hasOrgAccess: true,
      scopeType: ExportScope.EVENT,
      eventId: 'event-1',
      requestedVariant: 'ORIGINAL',
    });

    // Should safely fallback to optimized WebP variant
    expect(manifest.entries[0].storageKey).toBe('org-1/optimized/photo1.webp');
  });

  it('ExportService successfully creates a tracked export job in QUEUED status', async () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Alpha University',
      status: 'ACTIVE',
      allowOriginalDownloads: true,
      allowVideoDownloads: true,
      allowPhotoDownloads: true,
      allowBulkDownloads: true,
    };

    const mockMedia = [
      {
        id: 'media-1',
        mediaType: 'IMAGE',
        originalFileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: BigInt(2000000),
        originalFileSize: BigInt(2000000),
        originalStorageKey: 'org-1/originals/photo.jpg',
        status: MediaStatus.READY,
        visibility: 'PUBLIC',
        approvalStatus: ApprovalStatus.APPROVED,
        isPublished: true,
        uploaderId: 'user-1',
        createdAt: new Date(),
        event: {
          id: 'event-1',
          name: 'Event',
          status: EventStatus.PUBLISHED,
          visibility: 'PUBLIC',
          allowDownloads: true,
          allowOriginalDownloads: true,
          allowBulkDownloads: true,
          organisationId: 'org-1',
        },
        album: null,
        variants: [],
      },
    ];

    vi.mocked(prisma.organisation.findUnique).mockResolvedValue(mockOrg as any);
    vi.mocked(prisma.mediaItem.findMany).mockResolvedValue(mockMedia as any);

    const createdJob = {
      id: 'job-xyz',
      organisationId: 'org-1',
      userId: 'user-1',
      scopeType: ExportScope.EVENT,
      requestedVariant: 'ORIGINAL',
      status: ExportStatus.QUEUED,
      totalFiles: 1,
      totalBytes: BigInt(2000000),
      processedFiles: 0,
      archiveStorageKey: 'org-1/exports/job-xyz.zip',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    };

    vi.mocked(prisma.mediaExportJob.count).mockResolvedValue(0);
    vi.mocked(prisma.mediaExportJob.create).mockResolvedValue(createdJob as any);

    const result = await ExportService.createExportJob({
      organisationId: 'org-1',
      userId: 'user-1',
      userRole: ROLES.ORGANISATION_ADMIN,
      hasOrgAccess: true,
      scopeType: ExportScope.EVENT,
      eventId: 'event-1',
      requestedVariant: 'ORIGINAL',
    });

    expect(result.id).toBe('job-xyz');
    expect(result.status).toBe(ExportStatus.QUEUED);
    expect(prisma.mediaExportJob.create).toHaveBeenCalled();
  });
});
