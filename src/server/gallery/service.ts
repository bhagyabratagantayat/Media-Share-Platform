import { prisma } from '@/server/db/prisma';
import {
  MediaType,
  MediaStatus,
  ApprovalStatus,
  Prisma,
} from '@prisma/client';
import { ROLES, RoleType } from '@/server/permissions/roles';
import { NotFoundError, BadRequestError, ForbiddenError } from '@/lib/errors';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { getRedisClient } from '@/server/queue/redis';

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    if (parsed && parsed.createdAt && parsed.id) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export interface GetGalleryMediaInput {
  organisationId: string;
  eventId?: string;
  albumId?: string;
  userId?: string;
  userRole?: RoleType;
  mediaType?: MediaType;
  search?: string;
  startDate?: string;
  endDate?: string;
  sort?: 'newest' | 'oldest';
  cursor?: string;
  limit?: number;
}

export interface SearchOrganisationInput {
  organisationId: string;
  userId?: string;
  userRole?: RoleType;
  query: string;
  mediaType?: MediaType;
  eventId?: string;
  albumId?: string;
  year?: number;
  cursor?: string;
  limit?: number;
}

export class GallerySearchService {
  /**
   * Determine if user role qualifies as staff (can view unpublished or pending media).
   */
  private static isStaffRole(role?: RoleType): boolean {
    if (!role) return false;
    const staffRoles: string[] = [
      ROLES.PLATFORM_ADMIN,
      ROLES.ORGANISATION_OWNER,
      ROLES.ORGANISATION_ADMIN,
      ROLES.SOCIAL_MEDIA_MANAGER,
      ROLES.SOCIAL_MEDIA_MEMBER,
    ];
    return staffRoles.includes(role);
  }

  /**
   * High-scale cursor-paginated media query for events, albums, or organisation galleries.
   * Capped at 100 items per request to guarantee fast response times (< 500ms p95).
   */
  static async getGalleryMedia(input: GetGalleryMediaInput) {
    const {
      organisationId,
      eventId,
      albumId,
      userId,
      userRole,
      mediaType,
      search,
      startDate,
      endDate,
      sort = 'newest',
      cursor,
    } = input;

    // Enforce reasonable limit bounds (default 40, max 100)
    const limit = Math.min(100, Math.max(1, input.limit || 40));
    const isStaff = this.isStaffRole(userRole);

    // Verify tenant ownership of event/album if provided
    if (eventId) {
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, organisationId: true, status: true },
      });
      if (!event) throw new NotFoundError('Event not found.');
      assertTenantOwnership(event.organisationId, organisationId, 'Event');
    }

    if (albumId) {
      const album = await prisma.album.findUnique({
        where: { id: albumId },
        select: { id: true, organisationId: true, eventId: true },
      });
      if (!album) throw new NotFoundError('Album not found.');
      assertTenantOwnership(album.organisationId, organisationId, 'Album');
      if (eventId && album.eventId !== eventId) {
        throw new BadRequestError('Album does not belong to specified event.');
      }
    }

    // Base filter conditions
    const where: Prisma.MediaItemWhereInput = {
      organisationId,
      status: MediaStatus.READY,
    };

    if (eventId) where.eventId = eventId;
    if (albumId) where.albumId = albumId;
    if (mediaType) where.mediaType = mediaType;

    // Strict publication & approval security guards for non-staff
    if (!isStaff) {
      where.isPublished = true;
      where.approvalStatus = {
        in: [ApprovalStatus.APPROVED, ApprovalStatus.NOT_REQUIRED],
      };
    }

    // Date range filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Filename search (case-insensitive)
    if (search && search.trim().length > 0) {
      where.originalFileName = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    // Keyset cursor pagination condition
    const cursorPayload = cursor ? decodeCursor(cursor) : null;
    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.createdAt);
      if (sort === 'newest') {
        where.OR = [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursorPayload.id } },
        ];
      } else {
        where.OR = [
          { createdAt: { gt: cursorDate } },
          { createdAt: cursorDate, id: { gt: cursorPayload.id } },
        ];
      }
    }

    const orderBy: Prisma.MediaItemOrderByWithRelationInput[] =
      sort === 'newest'
        ? [{ createdAt: 'desc' }, { id: 'desc' }]
        : [{ createdAt: 'asc' }, { id: 'asc' }];

    // Execute query with lean field selection and eager variant loading (limit + 1 for next page detection)
    const items = await prisma.mediaItem.findMany({
      where,
      orderBy,
      take: limit + 1,
      select: {
        id: true,
        mediaType: true,
        status: true,
        originalFileName: true,
        fileSize: true,
        width: true,
        height: true,
        durationMs: true,
        isPublished: true,
        approvalStatus: true,
        createdAt: true,
        event: {
          select: { id: true, name: true, slug: true },
        },
        album: {
          select: { id: true, name: true, slug: true },
        },
        variants: {
          where: {
            variantType: { in: ['THUMBNAIL', 'PREVIEW', 'OPTIMIZED'] },
          },
          select: {
            id: true,
            variantType: true,
            storageKey: true,
            width: true,
            height: true,
          },
        },
      },
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    let nextCursor: string | null = null;
    if (hasMore && resultItems.length > 0) {
      const lastItem = resultItems[resultItems.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastItem.createdAt.toISOString(),
        id: lastItem.id,
      });
    }

    return {
      items: resultItems.map((item) => ({
        ...item,
        fileSize: Number(item.fileSize),
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor,
        returnedCount: resultItems.length,
      },
    };
  }

  /**
   * Aggregated summary counts for event and album galleries.
   * Uses single grouping/count queries to avoid N+1 scans.
   */
  static async getEventGallerySummary(organisationId: string, eventId: string, userRole?: RoleType) {
    const isStaff = this.isStaffRole(userRole);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organisationId: true,
        name: true,
        slug: true,
        description: true,
        eventDate: true,
        location: true,
        status: true,
        visibility: true,
        allowUserUploads: true,
        allowDownloads: true,
        albums: {
          where: { status: 'PUBLISHED' },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            coverMediaId: true,
          },
        },
      },
    });

    if (!event) throw new NotFoundError('Event not found.');
    assertTenantOwnership(event.organisationId, organisationId, 'Event');

    // Base media filter
    const baseFilter: Prisma.MediaItemWhereInput = {
      organisationId,
      eventId,
      status: MediaStatus.READY,
    };

    if (!isStaff) {
      baseFilter.isPublished = true;
      baseFilter.approvalStatus = {
        in: [ApprovalStatus.APPROVED, ApprovalStatus.NOT_REQUIRED],
      };
    }

    // Aggregate counts in parallel
    const [photoCount, videoCount, albumCounts] = await Promise.all([
      prisma.mediaItem.count({
        where: { ...baseFilter, mediaType: MediaType.IMAGE },
      }),
      prisma.mediaItem.count({
        where: { ...baseFilter, mediaType: MediaType.VIDEO },
      }),
      prisma.mediaItem.groupBy({
        by: ['albumId'],
        where: { ...baseFilter, albumId: { not: null } },
        _count: { id: true },
      }),
    ]);

    const albumCountMap = new Map<string, number>();
    for (const group of albumCounts) {
      if (group.albumId) {
        albumCountMap.set(group.albumId, group._count.id);
      }
    }

    const albumsWithCounts = event.albums.map((album) => ({
      ...album,
      mediaCount: albumCountMap.get(album.id) || 0,
    }));

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        description: event.description,
        eventDate: event.eventDate,
        location: event.location,
        status: event.status,
        allowUserUploads: event.allowUserUploads,
        allowDownloads: event.allowDownloads,
      },
      stats: {
        totalPhotos: photoCount,
        totalVideos: videoCount,
        totalMedia: photoCount + videoCount,
      },
      albums: albumsWithCounts,
    };
  }

  /**
   * Unified Search across Events, Albums, and Media with strict tenant isolation.
   */
  static async searchOrganisation(input: SearchOrganisationInput) {
    const {
      organisationId,
      userRole,
      query,
      mediaType,
      eventId,
      albumId,
      year,
      cursor,
    } = input;

    const trimmedQuery = (query || '').trim();
    const limit = Math.min(100, Math.max(1, input.limit || 30));
    const isStaff = this.isStaffRole(userRole);

    // Parallel search across Events, Albums, and Media
    const eventPromise = prisma.event.findMany({
      where: {
        organisationId,
        ...(year
          ? {
              eventDate: {
                gte: new Date(`${year}-01-01T00:00:00.000Z`),
                lte: new Date(`${year}-12-31T23:59:59.999Z`),
              },
            }
          : {}),
        ...(trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: 'insensitive' } },
                { description: { contains: trimmedQuery, mode: 'insensitive' } },
                { location: { contains: trimmedQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: 6,
      orderBy: { eventDate: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        eventDate: true,
        location: true,
      },
    });

    const albumPromise = !eventId
      ? prisma.album.findMany({
          where: {
            organisationId,
            ...(trimmedQuery
              ? {
                  OR: [
                    { name: { contains: trimmedQuery, mode: 'insensitive' } },
                    { description: { contains: trimmedQuery, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          take: 6,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            event: { select: { id: true, name: true, slug: true } },
          },
        })
      : Promise.resolve([]);

    // Media Search via keyset cursor
    const mediaWhere: Prisma.MediaItemWhereInput = {
      organisationId,
      status: MediaStatus.READY,
    };

    if (eventId) mediaWhere.eventId = eventId;
    if (albumId) mediaWhere.albumId = albumId;
    if (mediaType) mediaWhere.mediaType = mediaType;

    if (!isStaff) {
      mediaWhere.isPublished = true;
      mediaWhere.approvalStatus = {
        in: [ApprovalStatus.APPROVED, ApprovalStatus.NOT_REQUIRED],
      };
    }

    if (trimmedQuery) {
      mediaWhere.originalFileName = {
        contains: trimmedQuery,
        mode: 'insensitive',
      };
    }

    const cursorPayload = cursor ? decodeCursor(cursor) : null;
    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.createdAt);
      mediaWhere.OR = [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: cursorPayload.id } },
      ];
    }

    const mediaPromise = prisma.mediaItem.findMany({
      where: mediaWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        mediaType: true,
        status: true,
        originalFileName: true,
        fileSize: true,
        width: true,
        height: true,
        durationMs: true,
        createdAt: true,
        event: { select: { id: true, name: true, slug: true } },
        album: { select: { id: true, name: true, slug: true } },
        variants: {
          where: { variantType: { in: ['THUMBNAIL', 'PREVIEW'] } },
          select: { id: true, variantType: true, storageKey: true },
        },
      },
    });

    const [events, albums, media] = await Promise.all([
      eventPromise,
      albumPromise,
      mediaPromise,
    ]);

    const hasMore = media.length > limit;
    const resultMedia = hasMore ? media.slice(0, limit) : media;

    let nextCursor: string | null = null;
    if (hasMore && resultMedia.length > 0) {
      const lastItem = resultMedia[resultMedia.length - 1];
      nextCursor = encodeCursor({
        createdAt: lastItem.createdAt.toISOString(),
        id: lastItem.id,
      });
    }

    return {
      query: trimmedQuery,
      events,
      albums,
      media: resultMedia.map((m) => ({
        ...m,
        fileSize: Number(m.fileSize),
      })),
      pagination: {
        limit,
        hasMore,
        nextCursor,
        returnedCount: resultMedia.length,
      },
    };
  }

  /**
   * Helper to invalidate cache keys related to an organisation's gallery when media changes occur.
   */
  static async invalidateGalleryCache(organisationId: string, eventId?: string) {
    try {
      const redis = getRedisClient();
      const pattern = eventId
        ? `org:${organisationId}:gallery:${eventId}:*`
        : `org:${organisationId}:gallery:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch {
      // Non-blocking if redis is unavailable
    }
  }
}
