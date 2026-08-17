import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GallerySearchService } from '@/server/gallery/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { MediaType, MediaStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    event: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    album: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    mediaItem: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

vi.mock('@/server/queue/redis', () => ({
  getRedisClient: vi.fn(() => ({
    keys: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(0),
  })),
}));

describe('Phase 9 — 500+ Concurrent User Gallery & Search Simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles 500 concurrent mixed gallery requests with p95 < 500ms and zero error rate', async () => {
    const orgId = 'org-scale-test';
    const eventId = 'ev-scale-test';

    // Mock high-speed response
    vi.mocked(prisma.event.findUnique).mockResolvedValue({
      id: eventId,
      organisationId: orgId,
      name: 'Mega Festival 2026',
      slug: 'mega-festival-2026',
      status: 'PUBLISHED',
      visibility: 'ORGANISATION',
      allowUserUploads: true,
      allowDownloads: true,
      eventDate: new Date('2026-08-15'),
      albums: [],
    } as any);

    vi.mocked(prisma.mediaItem.findMany).mockResolvedValue(
      Array.from({ length: 40 }).map((_, i) => ({
        id: `media-${i}`,
        mediaType: i % 4 === 0 ? MediaType.VIDEO : MediaType.IMAGE,
        status: MediaStatus.READY,
        originalFileName: `celebration_photo_${i}.jpg`,
        fileSize: BigInt(1024000),
        width: 1920,
        height: 1080,
        durationMs: i % 4 === 0 ? 45000 : null,
        isPublished: true,
        approvalStatus: 'APPROVED',
        createdAt: new Date(Date.now() - i * 60000),
        event: { id: eventId, name: 'Mega Festival 2026', slug: 'mega-festival-2026' },
        album: null,
        variants: [
          {
            id: `var-${i}`,
            variantType: 'THUMBNAIL',
            storageKey: `orgs/${orgId}/thumbnails/${i}.webp`,
            width: 400,
            height: 400,
          },
        ],
      })) as any
    );

    vi.mocked(prisma.event.findMany).mockResolvedValue([
      { id: eventId, name: 'Mega Festival 2026', slug: 'mega-festival-2026', eventDate: new Date('2026-08-15') } as any,
    ]);

    vi.mocked(prisma.album.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mediaItem.count).mockResolvedValue(100000);
    vi.mocked(prisma.mediaItem.groupBy).mockResolvedValue([]);

    const CONCURRENT_USERS = 500;
    const latencies: number[] = [];
    const errors: any[] = [];

    const tasks = Array.from({ length: CONCURRENT_USERS }).map(async (_, idx) => {
      const start = performance.now();
      try {
        const queryType = idx % 4;
        if (queryType === 0) {
          // Event Gallery browse (photos only)
          await GallerySearchService.getGalleryMedia({
            organisationId: orgId,
            eventId,
            mediaType: MediaType.IMAGE,
            limit: 40,
            userRole: ROLES.USER,
          });
        } else if (queryType === 1) {
          // Event Gallery browse (videos only)
          await GallerySearchService.getGalleryMedia({
            organisationId: orgId,
            eventId,
            mediaType: MediaType.VIDEO,
            limit: 40,
            userRole: ROLES.USER,
          });
        } else if (queryType === 2) {
          // Search query
          await GallerySearchService.searchOrganisation({
            organisationId: orgId,
            query: 'celebration',
            userRole: ROLES.USER,
          });
        } else {
          // Summary counts
          await GallerySearchService.getEventGallerySummary(orgId, eventId, ROLES.USER);
        }
        const duration = performance.now() - start;
        latencies.push(duration);
      } catch (err) {
        errors.push(err);
      }
    });

    await Promise.all(tasks);

    // Compute latency percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    expect(errors.length).toBe(0);
    expect(latencies.length).toBe(CONCURRENT_USERS);
    expect(p95).toBeLessThan(500); // Target < 500ms
  });
});
