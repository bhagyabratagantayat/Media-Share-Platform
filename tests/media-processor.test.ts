import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { MediaProcessorService } from '@/server/processing/media-processor';
import { setStorageProvider } from '@/server/storage';
import { MockStorageProvider } from '@/server/storage/mock-storage';
import { prisma } from '@/server/db/prisma';
import { MediaType, MediaStatus, VariantType, UploadType } from '@prisma/client';

let mockStorage: MockStorageProvider;

vi.mock('@/server/db/prisma', () => {
  const mockMediaItemFindUnique = vi.fn();
  const mockMediaItemUpdate = vi.fn();
  const mockMediaVariantFindMany = vi.fn();
  const mockMediaVariantCreate = vi.fn();
  const mockMediaVariantDeleteMany = vi.fn();
  const mockQuotaUpdate = vi.fn();
  const mockAuditLogCreate = vi.fn();

  return {
    prisma: {
      mediaItem: {
        findUnique: mockMediaItemFindUnique,
        update: mockMediaItemUpdate,
      },
      mediaVariant: {
        findMany: mockMediaVariantFindMany,
        create: mockMediaVariantCreate,
        deleteMany: mockMediaVariantDeleteMany,
      },
      organisationQuota: {
        update: mockQuotaUpdate,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          mediaItem: {
            update: mockMediaItemUpdate,
          },
          mediaVariant: {
            findMany: mockMediaVariantFindMany,
            create: mockMediaVariantCreate,
            deleteMany: mockMediaVariantDeleteMany,
          },
          organisationQuota: {
            update: mockQuotaUpdate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 5: Media Processor & Queue Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);
  });

  it('processes an image job, generates WebP variants, updates quota, and sets status to READY', async () => {
    // 1. Generate valid test image buffer
    const validImageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 0, g: 128, b: 255 },
      },
    })
      .jpeg()
      .toBuffer();

    const originalKey = 'organisations/org_1/events/evt_1/media/med_1/original';
    mockStorage.seedObject(originalKey, {
      contentLength: validImageBuffer.length,
      contentType: 'image/jpeg',
      data: validImageBuffer,
    });

    vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
      id: 'med_1',
      organisationId: 'org_1',
      eventId: 'evt_1',
      mediaType: MediaType.IMAGE,
      status: MediaStatus.QUEUED,
      originalStorageKey: originalKey,
      fileSize: BigInt(validImageBuffer.length),
      processingVersion: 1,
      variants: [],
    } as any);

    vi.mocked(prisma.mediaVariant.findMany).mockResolvedValue([]);

    const result = await MediaProcessorService.processMediaJob({
      mediaItemId: 'med_1',
      organisationId: 'org_1',
      eventId: 'evt_1',
      userId: 'usr_uploader',
      mediaType: MediaType.IMAGE,
      originalStorageKey: originalKey,
      mimeType: 'image/jpeg',
      fileName: 'campus_lawn.jpg',
      uploadType: UploadType.OFFICIAL,
      processingVersion: 1,
    });

    expect(result.success).toBe(true);
    expect(result.mediaItemId).toBe('med_1');
    expect(result.variantsCreated.length).toBe(2);

    const optimized = result.variantsCreated.find((v) => v.variantType === VariantType.OPTIMIZED);
    const thumbnail = result.variantsCreated.find((v) => v.variantType === VariantType.THUMBNAIL);

    expect(optimized).toBeDefined();
    expect(optimized?.mimeType).toBe('image/webp');
    expect(optimized?.width).toBe(1920);
    expect(optimized?.height).toBe(1080);

    expect(thumbnail).toBeDefined();
    expect(thumbnail?.mimeType).toBe('image/webp');
    expect(thumbnail?.width).toBeLessThanOrEqual(400);

    // Verify variants were stored in storage provider
    const storedOptimized = await mockStorage.headObject(optimized!.storageKey);
    expect(storedOptimized).toBeDefined();
    expect(storedOptimized?.contentLength).toBe(optimized!.fileSize);

    const storedThumbnail = await mockStorage.headObject(thumbnail!.storageKey);
    expect(storedThumbnail).toBeDefined();
    expect(storedThumbnail?.contentLength).toBe(thumbnail!.fileSize);

    // Verify database transaction updated media status to READY
    expect(prisma.mediaItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'med_1' },
        data: expect.objectContaining({
          status: MediaStatus.READY,
          processingProgress: 100,
          originalFileSize: BigInt(validImageBuffer.length),
          width: 1920,
          height: 1080,
        }),
      })
    );

    // Verify quota increment
    expect(prisma.organisationQuota.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisationId: 'org_1' },
        data: {
          storageUsedBytes: {
            increment: BigInt(optimized!.fileSize + thumbnail!.fileSize),
          },
        },
      })
    );
  });

  it('handles idempotency gracefully if media is already READY for the current processing version', async () => {
    const originalKey = 'organisations/org_1/events/evt_1/media/med_idempotent/original';

    vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
      id: 'med_idempotent',
      organisationId: 'org_1',
      eventId: 'evt_1',
      mediaType: MediaType.IMAGE,
      status: MediaStatus.READY,
      processingVersion: 1,
      originalStorageKey: originalKey,
      fileSize: BigInt(500000),
      originalFileSize: BigInt(500000),
      optimizedFileSize: BigInt(250000),
      compressionRatio: 2.0,
      variants: [
        {
          id: 'var_opt',
          variantType: VariantType.OPTIMIZED,
          storageKey: 'key_opt',
          fileSize: BigInt(250000),
          mimeType: 'image/webp',
        },
        {
          id: 'var_thm',
          variantType: VariantType.THUMBNAIL,
          storageKey: 'key_thm',
          fileSize: BigInt(25000),
          mimeType: 'image/webp',
        },
      ],
    } as any);

    const result = await MediaProcessorService.processMediaJob({
      mediaItemId: 'med_idempotent',
      organisationId: 'org_1',
      eventId: 'evt_1',
      userId: 'usr_uploader',
      mediaType: MediaType.IMAGE,
      originalStorageKey: originalKey,
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      uploadType: UploadType.OFFICIAL,
      processingVersion: 1,
    });

    expect(result.success).toBe(true);
    expect(result.variantsCreated.length).toBe(2);

    // Should NOT have run another database update or quota increment
    expect(prisma.mediaItem.update).not.toHaveBeenCalled();
    expect(prisma.organisationQuota.update).not.toHaveBeenCalled();
  });

  it('marks mediaItem as FAILED when processing corrupted payload', async () => {
    const corruptKey = 'organisations/org_1/events/evt_1/media/med_corrupt/original';
    mockStorage.seedObject(corruptKey, {
      contentLength: 50,
      contentType: 'image/jpeg',
      data: Buffer.from('this-is-not-an-image'),
    });

    vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
      id: 'med_corrupt',
      organisationId: 'org_1',
      eventId: 'evt_1',
      mediaType: MediaType.IMAGE,
      status: MediaStatus.QUEUED,
      originalStorageKey: corruptKey,
      fileSize: BigInt(50),
      processingVersion: 1,
      variants: [],
    } as any);

    await expect(
      MediaProcessorService.processMediaJob({
        mediaItemId: 'med_corrupt',
        organisationId: 'org_1',
        eventId: 'evt_1',
        userId: 'usr_uploader',
        mediaType: MediaType.IMAGE,
        originalStorageKey: corruptKey,
        mimeType: 'image/jpeg',
        fileName: 'corrupt.jpg',
        uploadType: UploadType.OFFICIAL,
        processingVersion: 1,
      })
    ).rejects.toThrow();

    // Verify media status was updated to FAILED with error message
    expect(prisma.mediaItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'med_corrupt' },
        data: expect.objectContaining({
          status: MediaStatus.FAILED,
          processingError: expect.any(String),
        }),
      })
    );
  });
});
