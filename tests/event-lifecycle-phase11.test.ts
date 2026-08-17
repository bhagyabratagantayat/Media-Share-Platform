import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEvent,
  updateEvent,
  publishEvent,
  archiveEvent,
  restoreEvent,
  setEventCoverFromMedia,
  getEventStats,
  getEventCalendar,
  listEvents,
} from '@/server/events/service';
import {
  createAlbum,
  updateAlbum,
  archiveAlbum,
  restoreAlbum,
  reorderAlbums,
  setAlbumCoverFromMedia,
  moveMediaToAlbum,
  moveMediaToEvent,
} from '@/server/albums/service';
import { prisma } from '@/server/db/prisma';
import { ROLES } from '@/server/permissions/roles';
import { EventStatus, EventVisibility, EventCategory, AlbumStatus, MediaType, ApprovalStatus } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockEventCreate = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockEventFindMany = vi.fn();
  const mockEventUpdate = vi.fn();

  const mockAlbumCreate = vi.fn();
  const mockAlbumFindUnique = vi.fn();
  const mockAlbumFindFirst = vi.fn();
  const mockAlbumFindMany = vi.fn();
  const mockAlbumUpdate = vi.fn();
  const mockAlbumCount = vi.fn();

  const mockMediaItemFindUnique = vi.fn();
  const mockMediaItemFindMany = vi.fn();
  const mockMediaItemCount = vi.fn();
  const mockMediaItemAggregate = vi.fn();
  const mockMediaItemUpdateMany = vi.fn();

  const mockAuditLogCreate = vi.fn();
  const mockUserFindUnique = vi.fn();
  const mockMemberFindUnique = vi.fn();

  return {
    prisma: {
      event: {
        create: mockEventCreate,
        findUnique: mockEventFindUnique,
        findMany: mockEventFindMany,
        update: mockEventUpdate,
      },
      album: {
        create: mockAlbumCreate,
        findUnique: mockAlbumFindUnique,
        findFirst: mockAlbumFindFirst,
        findMany: mockAlbumFindMany,
        update: mockAlbumUpdate,
        count: mockAlbumCount,
      },
      mediaItem: {
        findUnique: mockMediaItemFindUnique,
        findMany: mockMediaItemFindMany,
        count: mockMediaItemCount,
        aggregate: mockMediaItemAggregate,
        updateMany: mockMediaItemUpdateMany,
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
          event: {
            create: mockEventCreate,
            update: mockEventUpdate,
          },
          album: {
            create: mockAlbumCreate,
            update: mockAlbumUpdate,
          },
          mediaItem: {
            updateMany: mockMediaItemUpdateMany,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 11: Enterprise Event Management & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Event Lifecycle (Draft -> Published -> Ongoing -> Completed -> Archived -> Restored)', () => {
    it('creates an event with rich metadata (category, start/end dates, location, policies)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_admin',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_1',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue(null);

      const createdEvent = {
        id: 'evt_tech_2026',
        organisationId: 'org_mit',
        name: 'MIT Tech Innovators Summit 2026',
        slug: 'mit-tech-innovators-summit-2026',
        description: 'Flagship engineering hackathon and research exhibition',
        category: EventCategory.TECHNICAL,
        eventDate: new Date('2026-11-10T09:00:00Z'),
        startDate: new Date('2026-11-10T09:00:00Z'),
        endDate: new Date('2026-11-12T18:00:00Z'),
        location: 'Campus Tech Center, Hall A',
        status: EventStatus.DRAFT,
        visibility: EventVisibility.ORGANISATION,
        isFeatured: true,
        allowUserUploads: true,
        allowDownloads: true,
        faceSearchEnabled: false,
        createdBy: 'usr_admin',
      };

      vi.mocked(prisma.event.create).mockResolvedValue(createdEvent as any);

      const result = await createEvent({
        organisationId: 'org_mit',
        name: 'MIT Tech Innovators Summit 2026',
        description: 'Flagship engineering hackathon and research exhibition',
        category: EventCategory.TECHNICAL,
        startDate: '2026-11-10T09:00:00Z',
        endDate: '2026-11-12T18:00:00Z',
        location: 'Campus Tech Center, Hall A',
        isFeatured: true,
        allowUserUploads: true,
        createdByUserId: 'usr_admin',
      });

      expect(result.id).toBe('evt_tech_2026');
      expect(result.category).toBe(EventCategory.TECHNICAL);
      expect(result.isFeatured).toBe(true);
      expect(prisma.event.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_CREATED',
            resourceType: 'EVENT',
            resourceId: 'evt_tech_2026',
          }),
        })
      );
    });

    it('rejects event creation when endDate is before startDate', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_admin',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_1',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      await expect(
        createEvent({
          organisationId: 'org_mit',
          name: 'Invalid Date Summit',
          startDate: '2026-11-12T09:00:00Z',
          endDate: '2026-11-10T09:00:00Z',
          createdByUserId: 'usr_admin',
        })
      ).rejects.toThrow(/End date must be greater than or equal to start date/);
    });

    it('publishes a draft event and logs audit trail', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_draft_1',
        organisationId: 'org_mit',
        status: EventStatus.DRAFT,
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_mgr',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_mgr',
        role: ROLES.SOCIAL_MEDIA_MANAGER,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'evt_draft_1',
        status: EventStatus.PUBLISHED,
      } as any);

      const result = await publishEvent('evt_draft_1', 'usr_mgr');
      expect(result.status).toBe(EventStatus.PUBLISHED);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_PUBLISHED',
            resourceId: 'evt_draft_1',
          }),
        })
      );
    });

    it('soft-archives an event with timestamp', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_pub_1',
        organisationId: 'org_mit',
        status: EventStatus.PUBLISHED,
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_owner',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_owner',
        role: ROLES.ORGANISATION_OWNER,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'evt_pub_1',
        status: EventStatus.ARCHIVED,
        archivedAt: new Date(),
      } as any);

      const result = await archiveEvent('evt_pub_1', 'usr_owner');
      expect(result.status).toBe(EventStatus.ARCHIVED);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_ARCHIVED',
            resourceId: 'evt_pub_1',
          }),
        })
      );
    });

    it('restores an archived event back to COMPLETED status', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_archived_1',
        organisationId: 'org_mit',
        status: EventStatus.ARCHIVED,
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_owner',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_owner',
        role: ROLES.ORGANISATION_OWNER,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'evt_archived_1',
        status: EventStatus.COMPLETED,
        archivedAt: null,
      } as any);

      const result = await restoreEvent('evt_archived_1', 'usr_owner', EventStatus.COMPLETED);
      expect(result.status).toBe(EventStatus.COMPLETED);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_RESTORED',
            resourceId: 'evt_archived_1',
          }),
        })
      );
    });
  });

  describe('2. Event Cover Image & Statistics Aggregation', () => {
    it('sets event cover image from a valid READY media item', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_mit',
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

      vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
        id: 'med_cover_101',
        organisationId: 'org_mit',
        eventId: 'evt_1',
        status: 'READY',
      } as any);

      vi.mocked(prisma.event.update).mockResolvedValue({
        id: 'evt_1',
        coverMediaId: 'med_cover_101',
      } as any);

      const result = await setEventCoverFromMedia('evt_1', 'usr_admin', 'med_cover_101');
      expect(result.coverMediaId).toBe('med_cover_101');
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'EVENT_COVER_CHANGED',
            resourceId: 'evt_1',
          }),
        })
      );
    });

    it('rejects cover setting when media item does not belong to the event', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_mit',
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

      vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
        id: 'med_foreign',
        organisationId: 'org_mit',
        eventId: 'evt_OTHER_EVENT', // Different event
        status: 'READY',
      } as any);

      await expect(
        setEventCoverFromMedia('evt_1', 'usr_admin', 'med_foreign')
      ).rejects.toThrow(/Cover media item must belong to this specific event/);
    });

    it('computes aggregate statistics for event dashboard', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_stats_1',
        organisationId: 'org_mit',
        status: EventStatus.PUBLISHED,
        visibility: EventVisibility.PUBLIC,
      } as any);

      vi.mocked(prisma.album.count).mockResolvedValue(5);
      vi.mocked(prisma.mediaItem.count)
        .mockResolvedValueOnce(120) // Photos
        .mockResolvedValueOnce(15)  // Videos
        .mockResolvedValueOnce(8)   // Pending User Submissions
        .mockResolvedValueOnce(135); // Published Media

      vi.mocked(prisma.mediaItem.aggregate).mockResolvedValue({
        _sum: { fileSize: BigInt(524288000) }, // 500 MB
      } as any);

      const stats = await getEventStats('evt_stats_1', ROLES.ORGANISATION_ADMIN, true);

      expect(stats.totalAlbums).toBe(5);
      expect(stats.totalPhotos).toBe(120);
      expect(stats.totalVideos).toBe(15);
      expect(stats.totalMedia).toBe(135);
      expect(stats.pendingUserUploads).toBe(8);
      expect(stats.publishedMedia).toBe(135);
      expect(stats.storageUsedBytes).toBe(524288000);
    });
  });

  describe('3. Album Management & Ordering', () => {
    it('creates an album and assigns incremental sortOrder', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_mit',
        status: EventStatus.PUBLISHED,
      } as any);

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_mgr',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_mgr',
        role: ROLES.SOCIAL_MEDIA_MANAGER,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.album.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.album.findFirst).mockResolvedValue({ sortOrder: 4 } as any);

      vi.mocked(prisma.album.create).mockResolvedValue({
        id: 'alb_new',
        organisationId: 'org_mit',
        eventId: 'evt_1',
        name: 'Keynote Speeches',
        slug: 'keynote-speeches',
        sortOrder: 5,
        status: AlbumStatus.PUBLISHED,
      } as any);

      const album = await createAlbum({
        organisationId: 'org_mit',
        eventId: 'evt_1',
        name: 'Keynote Speeches',
        createdByUserId: 'usr_mgr',
      });

      expect(album.id).toBe('alb_new');
      expect(album.sortOrder).toBe(5);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ALBUM_CREATED',
            resourceId: 'alb_new',
          }),
        })
      );
    });

    it('reorders albums inside an event atomically', async () => {
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_mit',
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
    });

    it('soft-archives and restores an album', async () => {
      vi.mocked(prisma.album.findUnique).mockResolvedValue({
        id: 'alb_to_archive',
        organisationId: 'org_mit',
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
        id: 'alb_to_archive',
        status: AlbumStatus.ARCHIVED,
        archivedAt: new Date(),
      } as any);

      const archived = await archiveAlbum('alb_to_archive', 'usr_admin');
      expect(archived.status).toBe(AlbumStatus.ARCHIVED);

      // Now restore
      vi.mocked(prisma.album.findUnique).mockResolvedValue({
        id: 'alb_to_archive',
        organisationId: 'org_mit',
        status: AlbumStatus.ARCHIVED,
      } as any);

      vi.mocked(prisma.album.update).mockResolvedValue({
        id: 'alb_to_archive',
        status: AlbumStatus.PUBLISHED,
        archivedAt: null,
      } as any);

      const restored = await restoreAlbum('alb_to_archive', 'usr_admin');
      expect(restored.status).toBe(AlbumStatus.PUBLISHED);
    });
  });

  describe('4. Bulk Media Movement & Organization', () => {
    it('moves multiple media items to a target album in the same event', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_team',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_team',
        role: ROLES.SOCIAL_MEDIA_MEMBER,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.album.findUnique).mockResolvedValue({
        id: 'alb_target',
        organisationId: 'org_mit',
        eventId: 'evt_1',
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValue([
        { id: 'med_1', albumId: null },
        { id: 'med_2', albumId: null },
      ] as any);

      vi.mocked(prisma.mediaItem.updateMany).mockResolvedValue({ count: 2 });

      const result = await moveMediaToAlbum({
        organisationId: 'org_mit',
        eventId: 'evt_1',
        mediaIds: ['med_1', 'med_2'],
        targetAlbumId: 'alb_target',
        userId: 'usr_team',
      });

      expect(result.updatedCount).toBe(2);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MEDIA_MOVED_ALBUM',
            resourceId: 'evt_1',
          }),
        })
      );
    });

    it('moves media items across events within the same organisation', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_admin',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_admin',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_target',
        organisationId: 'org_mit',
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValue([
        { id: 'med_10' },
        { id: 'med_11' },
      ] as any);

      vi.mocked(prisma.mediaItem.updateMany).mockResolvedValue({ count: 2 });

      const result = await moveMediaToEvent({
        organisationId: 'org_mit',
        sourceEventId: 'evt_source',
        targetEventId: 'evt_target',
        mediaIds: ['med_10', 'med_11'],
        userId: 'usr_admin',
      });

      expect(result.updatedCount).toBe(2);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MEDIA_MOVED_EVENT',
            resourceId: 'evt_target',
          }),
        })
      );
    });

    it('blocks cross-event media movement by normal USER role', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_normal',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_normal',
        role: ROLES.USER,
        status: 'ACTIVE',
      } as any);

      await expect(
        moveMediaToEvent({
          organisationId: 'org_mit',
          sourceEventId: 'evt_source',
          targetEventId: 'evt_target',
          mediaIds: ['med_10'],
          userId: 'usr_normal',
        })
      ).rejects.toThrow(/Only organisation administrators or social media managers/);
    });
  });

  describe('5. Year-Wise Event Browsing & Calendar Querying', () => {
    it('retrieves calendar events grouped for a specific year', async () => {
      const mockCalendarEvents = [
        {
          id: 'evt_1',
          name: 'Spring Convocation 2026',
          slug: 'spring-convocation-2026',
          category: EventCategory.CEREMONY,
          eventDate: new Date('2026-03-20T10:00:00Z'),
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.PUBLIC,
          _count: { albums: 2, mediaItems: 45 },
        },
        {
          id: 'evt_2',
          name: 'Annual Hackathon 2026',
          slug: 'annual-hackathon-2026',
          category: EventCategory.HACKATHON,
          eventDate: new Date('2026-10-15T09:00:00Z'),
          status: EventStatus.PUBLISHED,
          visibility: EventVisibility.ORGANISATION,
          _count: { albums: 3, mediaItems: 80 },
        },
      ];

      vi.mocked(prisma.event.findMany).mockResolvedValue(mockCalendarEvents as any);

      const calendar = await getEventCalendar('org_mit', 2026, ROLES.USER, true);

      expect(calendar.year).toBe(2026);
      expect(calendar.totalEvents).toBe(2);
      expect(calendar.events).toHaveLength(2);
      expect(prisma.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organisationId: 'org_mit',
            eventDate: {
              gte: new Date('2026-01-01T00:00:00.000Z'),
              lte: new Date('2026-12-31T23:59:59.999Z'),
            },
          }),
        })
      );
    });
  });
});
