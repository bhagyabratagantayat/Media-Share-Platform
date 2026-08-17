import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GallerySearchService,
  encodeCursor,
  decodeCursor,
} from '@/server/gallery/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { MediaType, MediaStatus, ApprovalStatus } from '@prisma/client';

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

describe('Phase 9 — Gallery Search, Keyset Pagination & Tenant Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Keyset Cursor Encoding / Decoding', () => {
    it('encodes and decodes cursor deterministically', () => {
      const payload = {
        createdAt: '2026-08-15T18:00:00.000Z',
        id: 'media-item-12345',
      };
      const cursor = encodeCursor(payload);
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(10);

      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual(payload);
    });

    it('gracefully returns null for malformed or corrupted cursor strings', () => {
      expect(decodeCursor('invalid-base64-random')).toBeNull();
      expect(decodeCursor('')).toBeNull();
    });
  });

  describe('Tenant Isolation & Cross-Tenant Security', () => {
    it('strictly isolates search within the requested organisation scope', async () => {
      const orgAId = 'org-a-111';
      const orgBId = 'org-b-222';

      vi.mocked(prisma.event.findMany).mockResolvedValueOnce([
        {
          id: 'event-a-1',
          name: 'Independence Day 2026',
          slug: 'independence-day-2026',
          eventDate: new Date('2026-08-15'),
          location: 'Main Auditorium',
        } as any,
      ]);

      vi.mocked(prisma.album.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.mediaItem.findMany).mockResolvedValueOnce([
        {
          id: 'media-a-1',
          mediaType: MediaType.IMAGE,
          status: MediaStatus.READY,
          originalFileName: 'independence_celebration_001.jpg',
          fileSize: BigInt(2048000),
          createdAt: new Date('2026-08-15T10:00:00Z'),
          event: { id: 'event-a-1', name: 'Independence Day 2026', slug: 'independence-day-2026' },
          album: null,
          variants: [],
        } as any,
      ]);

      const result = await GallerySearchService.searchOrganisation({
        organisationId: orgAId,
        query: 'Independence',
        userRole: ROLES.USER,
      });

      expect(result.events).toHaveLength(1);
      expect(result.media).toHaveLength(1);

      // Verify Prisma query was strictly filtered by organisationId = orgAId
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organisationId: orgAId,
          }),
        })
      );

      expect(prisma.mediaItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organisationId: orgAId,
          }),
        })
      );
    });

    it('rejects access if event belongs to another organisation', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
        id: 'event-b-1',
        organisationId: 'org-b-222',
        status: 'PUBLISHED',
      } as any);

      await expect(
        GallerySearchService.getGalleryMedia({
          organisationId: 'org-a-111',
          eventId: 'event-b-1',
        })
      ).rejects.toThrow('Cross-tenant access violation');
    });
  });

  describe('Normal User vs Staff Moderation Visibility Guard', () => {
    it('hides unpublished and pending items from regular users', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
        id: 'ev-1',
        organisationId: 'org-1',
        status: 'PUBLISHED',
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValueOnce([]);

      await GallerySearchService.getGalleryMedia({
        organisationId: 'org-1',
        eventId: 'ev-1',
        userRole: ROLES.USER,
      });

      expect(prisma.mediaItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublished: true,
            approvalStatus: {
              in: [ApprovalStatus.APPROVED, ApprovalStatus.NOT_REQUIRED],
            },
          }),
        })
      );
    });

    it('allows staff roles to view pending/unpublished items', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
        id: 'ev-1',
        organisationId: 'org-1',
        status: 'PUBLISHED',
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValueOnce([]);

      await GallerySearchService.getGalleryMedia({
        organisationId: 'org-1',
        eventId: 'ev-1',
        userRole: ROLES.ORGANISATION_ADMIN,
      });

      // Staff query does not restrict isPublished to true
      const calledWhere = vi.mocked(prisma.mediaItem.findMany).mock.calls[0][0]?.where;
      expect(calledWhere?.isPublished).toBeUndefined();
    });
  });

  describe('Fast Aggregation & Summary Service', () => {
    it('returns combined counts and album breakdown in parallel queries', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValueOnce({
        id: 'ev-1',
        organisationId: 'org-1',
        name: 'Annual Tech Gala 2026',
        slug: 'annual-tech-gala-2026',
        description: 'Tech showcase',
        eventDate: new Date('2026-10-10'),
        location: 'Hall A',
        status: 'PUBLISHED',
        visibility: 'ORGANISATION',
        allowUserUploads: true,
        allowDownloads: true,
        albums: [
          { id: 'alb-1', name: 'Keynote', slug: 'keynote', sortOrder: 1 },
          { id: 'alb-2', name: 'Hackathon', slug: 'hackathon', sortOrder: 2 },
        ],
      } as any);

      vi.mocked(prisma.mediaItem.count)
        .mockResolvedValueOnce(350) // Photos
        .mockResolvedValueOnce(45); // Videos

      vi.mocked(prisma.mediaItem.groupBy).mockResolvedValueOnce([
        { albumId: 'alb-1', _count: { id: 200 } },
        { albumId: 'alb-2', _count: { id: 195 } },
      ] as any);

      const summary = await GallerySearchService.getEventGallerySummary('org-1', 'ev-1', ROLES.USER);

      expect(summary.stats.totalPhotos).toBe(350);
      expect(summary.stats.totalVideos).toBe(45);
      expect(summary.stats.totalMedia).toBe(395);
      expect(summary.albums[0].mediaCount).toBe(200);
      expect(summary.albums[1].mediaCount).toBe(195);
    });
  });
});
