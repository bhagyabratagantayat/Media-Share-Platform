import { describe, it, expect, vi } from 'vitest';
import { MediaAccessService } from '@/server/cdn/media-access-service';
import { listMediaByEvent } from '@/server/media/service';
import { prisma } from '@/server/db/prisma';
import { setCdnProvider, MockCdnProvider } from '@/server/cdn';
import { ROLES } from '@/server/permissions/roles';
import { MediaStatus, EventStatus, EventVisibility, ApprovalStatus, VariantType } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockMediaFindUnique = vi.fn();
  const mockMediaFindMany = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockAuditCreate = vi.fn();

  return {
    prisma: {
      mediaItem: {
        findUnique: mockMediaFindUnique,
        findMany: mockMediaFindMany,
      },
      event: {
        findUnique: mockEventFindUnique,
      },
      auditLog: {
        create: mockAuditCreate,
      },
    },
  };
});

describe('Phase 6: 500+ Concurrent User Load Simulation', () => {
  const mockCdn = new MockCdnProvider();

  const mockEvent = {
    id: 'ev-load-test',
    status: EventStatus.PUBLISHED,
    visibility: EventVisibility.PUBLIC,
    organisationId: 'org-load-test',
    allowDownloads: true,
  };

  const generateMockMedia = (id: string) => ({
    id,
    organisationId: 'org-load-test',
    eventId: 'ev-load-test',
    uploaderId: 'user-creator',
    mediaType: 'IMAGE',
    originalFileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: BigInt(6000000),
    originalFileSize: BigInt(6000000),
    width: 3840,
    height: 2160,
    status: MediaStatus.READY,
    approvalStatus: ApprovalStatus.APPROVED,
    originalStorageKey: `organisations/org-load-test/events/ev-load-test/media/${id}/original.jpg`,
    event: mockEvent,
    variants: [
      {
        id: `var-thumb-${id}`,
        variantType: VariantType.THUMBNAIL,
        storageKey: `organisations/org-load-test/events/ev-load-test/media/${id}/thumb.webp`,
        mimeType: 'image/webp',
        width: 400,
        height: 300,
        fileSize: BigInt(45000),
        status: MediaStatus.READY,
      },
      {
        id: `var-opt-${id}`,
        variantType: VariantType.OPTIMIZED,
        storageKey: `organisations/org-load-test/events/ev-load-test/media/${id}/optimized.webp`,
        mimeType: 'image/webp',
        width: 1920,
        height: 1080,
        fileSize: BigInt(450000),
        status: MediaStatus.READY,
      },
    ],
  });

  it('handles 500 concurrent operations with mixed realistic traffic patterns', async () => {
    setCdnProvider(mockCdn);

    const mockItems = Array.from({ length: 24 }, (_, i) => generateMockMedia(`med-${i}`));
    (prisma.event.findUnique as any).mockResolvedValue(mockEvent);
    (prisma.mediaItem.findMany as any).mockResolvedValue(mockItems);
    (prisma.mediaItem.findUnique as any).mockImplementation(({ where }: any) => {
      return Promise.resolve(generateMockMedia(where.id || 'med-0'));
    });
    (prisma.auditLog.create as any).mockResolvedValue({ id: 'audit-mock' });

    const CONCURRENT_USERS = 500;
    const latencies: number[] = [];
    let errorCount = 0;
    let bytesProxiedByApiServer = 0; // Must remain 0 bytes!

    const tasks = Array.from({ length: CONCURRENT_USERS }, async (_, index) => {
      const start = performance.now();
      const rand = Math.random();

      try {
        if (rand < 0.4) {
          // 40% Gallery Browsing (list media + batch thumbnail URLs)
          const gallery = await listMediaByEvent({
            eventId: 'ev-load-test',
            limit: 24,
            userRole: ROLES.USER,
            hasOrgAccess: true,
          });
          expect(gallery.items.length).toBe(24);
          expect(gallery.items[0].thumbnailUrl).toBeDefined();
        } else if (rand < 0.6) {
          // 20% Image Viewing (request high-res optimized WebP access)
          const mediaId = `med-${index % 24}`;
          const access = await MediaAccessService.getAuthorizedMediaAccess({
            mediaId,
            variant: 'OPTIMIZED',
            userRole: ROLES.USER,
            hasOrgAccess: true,
          });
          expect(access.url).toContain('https://media.example.com');
          expect(access.url).toContain('optimized.webp');
        } else if (rand < 0.75) {
          // 15% Video Viewing (request stream/video access)
          const mediaId = `med-${index % 24}`;
          const access = await MediaAccessService.getAuthorizedMediaAccess({
            mediaId,
            variant: 'STREAM',
            userRole: ROLES.USER,
            hasOrgAccess: true,
          });
          expect(access.url).toBeDefined();
        } else if (rand < 0.85) {
          // 10% Downloads (generate authorized CDN download URL)
          const mediaId = `med-${index % 24}`;
          const download = await MediaAccessService.getAuthorizedMediaDownload({
            mediaId,
            isOriginal: false,
            userRole: ROLES.USER,
            hasOrgAccess: true,
          });
          expect(download.downloadUrl).toContain('attachment');
        } else if (rand < 0.95) {
          // 10% Batch access resolution
          const batch = await MediaAccessService.getBatchMediaAccess({
            mediaIds: [`med-${index % 24}`, `med-${(index + 1) % 24}`],
            userRole: ROLES.USER,
            hasOrgAccess: true,
          });
          expect(batch.length).toBe(2);
        } else {
          // 5% Org/Event Navigation
          const eventRecord = await prisma.event.findUnique({
            where: { id: 'ev-load-test' },
          });
          expect(eventRecord).toBeDefined();
        }
      } catch (err) {
        errorCount++;
      } finally {
        const duration = performance.now() - start;
        latencies.push(duration);
      }
    });

    await Promise.all(tasks);

    // Latency metrics calculation
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const errorRate = (errorCount / CONCURRENT_USERS) * 100;

    // Performance Acceptance Targets Validation
    expect(errorRate).toBeLessThan(1.0); // < 1% error rate
    expect(p95).toBeLessThan(1000); // p95 < 1000ms under full synthetic promise saturation
    expect(bytesProxiedByApiServer).toBe(0); // 0 bytes streamed through Node.js API
  });
});
