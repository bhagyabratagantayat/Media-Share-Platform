import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import {
  canCreateEvent,
  canUpdateEvent,
  canPublishEvent,
  canArchiveEvent,
  canRestoreEvent,
  canSetEventCover,
  canViewEvent,
} from '@/server/permissions/event-guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { normalizeSlug } from '@/server/organisations/service';
import { EventStatus, EventVisibility, EventCategory, MediaType, ApprovalStatus } from '@prisma/client';

export interface CreateEventInput {
  organisationId: string;
  name: string;
  slug?: string;
  description?: string;
  category?: EventCategory;
  startDate?: string | Date;
  endDate?: string | Date;
  eventDate?: string | Date;
  startTime?: string;
  endTime?: string;
  location?: string;
  coverMediaId?: string | null;
  status?: EventStatus;
  visibility?: EventVisibility;
  isFeatured?: boolean;
  allowUserUploads?: boolean;
  allowDownloads?: boolean;
  allowOriginalDownloads?: boolean;
  allowBulkDownloads?: boolean;
  faceSearchEnabled?: boolean;
  createdByUserId: string;
}

export interface UpdateEventInput {
  name?: string;
  slug?: string;
  description?: string;
  category?: EventCategory;
  startDate?: string | Date;
  endDate?: string | Date;
  eventDate?: string | Date;
  startTime?: string;
  endTime?: string;
  location?: string;
  status?: EventStatus;
  visibility?: EventVisibility;
  isFeatured?: boolean;
  allowUserUploads?: boolean;
  allowDownloads?: boolean;
  allowOriginalDownloads?: boolean;
  allowBulkDownloads?: boolean;
  faceSearchEnabled?: boolean;
  coverMediaId?: string | null;
}

export interface ListEventsOptions {
  organisationId: string;
  status?: EventStatus;
  visibility?: EventVisibility;
  category?: EventCategory;
  year?: number;
  timeFrame?: 'upcoming' | 'past' | 'all';
  isFeatured?: boolean;
  search?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  sortBy?: 'newest' | 'oldest' | 'upcoming' | 'name';
  cursor?: string;
  limit?: number;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
}

/**
 * Resolves user role in organisation context
 */
async function resolveUserRole(organisationId: string, userId: string): Promise<RoleType> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  if (user.isPlatformAdmin) {
    return ROLES.PLATFORM_ADMIN;
  }

  const member = await prisma.organisationMember.findUnique({
    where: {
      unique_organisation_user: {
        organisationId,
        userId,
      },
    },
  });

  if (!member || member.status !== 'ACTIVE') {
    throw new ForbiddenError('You are not an active member of this organisation.');
  }

  return member.role as RoleType;
}

/**
 * Creates an event within an organisation after verifying role permissions and slug uniqueness.
 */
export async function createEvent(input: CreateEventInput) {
  if (!input.name || input.name.trim().length < 2) {
    throw new BadRequestError('Event name must be at least 2 characters long.');
  }

  const primaryDateInput = input.startDate || input.eventDate;
  if (!primaryDateInput) {
    throw new BadRequestError('Valid start or event date is required.');
  }

  const parsedStartDate = new Date(primaryDateInput);
  if (isNaN(parsedStartDate.getTime())) {
    throw new BadRequestError('Invalid start/event date provided.');
  }

  let parsedEndDate: Date | null = null;
  if (input.endDate) {
    parsedEndDate = new Date(input.endDate);
    if (isNaN(parsedEndDate.getTime())) {
      throw new BadRequestError('Invalid end date provided.');
    }
    if (parsedEndDate.getTime() < parsedStartDate.getTime()) {
      throw new BadRequestError('End date must be greater than or equal to start date.');
    }
  }

  // 1. Verify user membership and role in organisation
  const userRole = await resolveUserRole(input.organisationId, input.createdByUserId);

  if (!canCreateEvent(userRole)) {
    throw new ForbiddenError(
      `Access denied. Role '${userRole}' cannot create events for this organisation.`
    );
  }

  // 2. Compute and validate slug
  const finalSlug = normalizeSlug(input.slug || input.name);
  if (!finalSlug || finalSlug.length < 2) {
    throw new BadRequestError('Invalid event slug generated from name.');
  }

  // 3. Verify slug uniqueness per organisation
  const existingEvent = await prisma.event.findUnique({
    where: {
      unique_org_event_slug: {
        organisationId: input.organisationId,
        slug: finalSlug,
      },
    },
  });

  if (existingEvent) {
    throw new ConflictError(
      `An event with slug '${finalSlug}' already exists in this organisation.`
    );
  }

  // 4. If coverMediaId provided, verify it belongs to organisation
  if (input.coverMediaId) {
    const media = await prisma.mediaItem.findUnique({
      where: { id: input.coverMediaId },
      select: { id: true, organisationId: true, status: true },
    });
    if (!media || media.organisationId !== input.organisationId) {
      throw new BadRequestError('Provided cover media does not belong to this organisation.');
    }
  }

  // 5. Create event + audit log atomically
  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        organisationId: input.organisationId,
        name: input.name.trim(),
        slug: finalSlug,
        description: input.description?.trim() || null,
        category: input.category || EventCategory.OTHER,
        eventDate: parsedStartDate,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        startTime: input.startTime?.trim() || null,
        endTime: input.endTime?.trim() || null,
        location: input.location?.trim() || null,
        coverMediaId: input.coverMediaId || null,
        status: input.status || EventStatus.DRAFT,
        visibility: input.visibility || EventVisibility.ORGANISATION,
        isFeatured: input.isFeatured ?? false,
        allowUserUploads: input.allowUserUploads ?? false,
        allowDownloads: input.allowDownloads ?? true,
        allowOriginalDownloads: input.allowOriginalDownloads ?? false,
        allowBulkDownloads: input.allowBulkDownloads ?? true,
        faceSearchEnabled: input.faceSearchEnabled ?? false,
        createdBy: input.createdByUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.createdByUserId,
        action: 'EVENT_CREATED',
        resourceType: 'EVENT',
        resourceId: event.id,
        metadata: {
          name: event.name,
          slug: event.slug,
          status: event.status,
          visibility: event.visibility,
          category: event.category,
        },
      },
    });

    return event;
  });

  return result;
}

/**
 * Retrieves event by ID, evaluating role and pass-token visibility guards.
 */
export async function getEventById(
  eventId: string,
  userRole?: RoleType | null,
  hasOrgAccess = false
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      organisation: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          timezone: true,
        },
      },
      _count: {
        select: {
          albums: true,
          mediaItems: {
            where: { status: 'READY' },
          },
        },
      },
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (!canViewEvent(event, userRole, hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to view this event.');
  }

  // Compute breakdown for photos vs videos vs pending user uploads
  const [photosCount, videosCount, pendingUploadsCount] = await Promise.all([
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        mediaType: MediaType.IMAGE,
        status: 'READY',
      },
    }),
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        mediaType: MediaType.VIDEO,
        status: 'READY',
      },
    }),
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        approvalStatus: ApprovalStatus.PENDING,
      },
    }),
  ]);

  return {
    ...event,
    photosCount,
    videosCount,
    pendingUploadsCount,
  };
}

/**
 * Retrieves event by slug and organisationId.
 */
export async function getEventBySlug(
  organisationId: string,
  slug: string,
  userRole?: RoleType | null,
  hasOrgAccess = false
) {
  const event = await prisma.event.findUnique({
    where: {
      unique_org_event_slug: {
        organisationId,
        slug,
      },
    },
    include: {
      organisation: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          timezone: true,
        },
      },
      _count: {
        select: {
          albums: true,
          mediaItems: {
            where: { status: 'READY' },
          },
        },
      },
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (!canViewEvent(event, userRole, hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to view this event.');
  }

  const [photosCount, videosCount, pendingUploadsCount] = await Promise.all([
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        mediaType: MediaType.IMAGE,
        status: 'READY',
      },
    }),
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        mediaType: MediaType.VIDEO,
        status: 'READY',
      },
    }),
    prisma.mediaItem.count({
      where: {
        eventId: event.id,
        approvalStatus: ApprovalStatus.PENDING,
      },
    }),
  ]);

  return {
    ...event,
    photosCount,
    videosCount,
    pendingUploadsCount,
  };
}

/**
 * Lists events for an organisation using server-side filtering and cursor pagination.
 */
export async function listEvents(options: ListEventsOptions) {
  const limit = Math.min(Math.max(Number(options.limit) || 12, 1), 50);

  const STAFF_ROLES: RoleType[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.ORGANISATION_OWNER,
    ROLES.ORGANISATION_ADMIN,
    ROLES.SOCIAL_MEDIA_MANAGER,
    ROLES.SOCIAL_MEDIA_MEMBER,
    ROLES.MODERATOR,
  ];
  const isStaff = options.userRole && STAFF_ROLES.includes(options.userRole);

  const whereClause: any = {
    organisationId: options.organisationId,
  };

  // Status filtering
  if (options.status) {
    if (!isStaff && options.status !== EventStatus.PUBLISHED && options.status !== EventStatus.ONGOING && options.status !== EventStatus.COMPLETED) {
      throw new ForbiddenError('Only organisation staff can filter draft or archived events.');
    }
    whereClause.status = options.status;
  } else if (!isStaff) {
    // Normal attendees see active/published events
    whereClause.status = {
      in: [EventStatus.PUBLISHED, EventStatus.ONGOING, EventStatus.COMPLETED],
    };
  }

  // Visibility filtering
  if (options.visibility) {
    whereClause.visibility = options.visibility;
  } else if (!isStaff && !options.hasOrgAccess) {
    whereClause.visibility = EventVisibility.PUBLIC;
  }

  // Category filtering
  if (options.category) {
    whereClause.category = options.category;
  }

  // Featured filter
  if (options.isFeatured !== undefined) {
    whereClause.isFeatured = options.isFeatured;
  }

  // Year filter
  if (options.year) {
    const startOfYear = new Date(`${options.year}-01-01T00:00:00.000Z`);
    const endOfYear = new Date(`${options.year}-12-31T23:59:59.999Z`);
    whereClause.eventDate = {
      gte: startOfYear,
      lte: endOfYear,
    };
  }

  // Timeframe filter (upcoming vs past)
  if (options.timeFrame === 'upcoming') {
    const now = new Date();
    whereClause.eventDate = {
      ...(whereClause.eventDate || {}),
      gte: now,
    };
  } else if (options.timeFrame === 'past') {
    const now = new Date();
    whereClause.eventDate = {
      ...(whereClause.eventDate || {}),
      lt: now,
    };
  }

  // Explicit Date range filtering
  if (options.dateFrom || options.dateTo) {
    whereClause.eventDate = whereClause.eventDate || {};
    if (options.dateFrom) whereClause.eventDate.gte = new Date(options.dateFrom);
    if (options.dateTo) whereClause.eventDate.lte = new Date(options.dateTo);
  }

  // Text search filtering
  if (options.search && options.search.trim()) {
    const q = options.search.trim();
    whereClause.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Sort ordering
  let orderBy: any = [{ eventDate: 'desc' }, { id: 'desc' }];
  if (options.sortBy === 'oldest') {
    orderBy = [{ eventDate: 'asc' }, { id: 'asc' }];
  } else if (options.sortBy === 'upcoming') {
    orderBy = [{ eventDate: 'asc' }, { id: 'asc' }];
  } else if (options.sortBy === 'name') {
    orderBy = [{ name: 'asc' }, { id: 'asc' }];
  }

  // Cursor pagination
  const findManyArgs: any = {
    where: whereClause,
    take: limit + 1,
    orderBy,
    include: {
      _count: {
        select: {
          albums: true,
          mediaItems: { where: { status: 'READY' } },
        },
      },
    },
  };

  if (options.cursor) {
    findManyArgs.cursor = { id: options.cursor };
    findManyArgs.skip = 1;
  }

  const events = await prisma.event.findMany(findManyArgs);

  const hasMore = events.length > limit;
  const items = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

/**
 * Updates an event's metadata.
 */
export async function updateEvent(
  eventId: string,
  userId: string,
  input: UpdateEventInput
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canUpdateEvent(userRole)) {
    throw new ForbiddenError('You do not have permission to update this event.');
  }

  const updateData: any = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) {
      throw new BadRequestError('Event name must be at least 2 characters long.');
    }
    updateData.name = input.name.trim();
  }

  if (input.slug !== undefined) {
    const newSlug = normalizeSlug(input.slug);
    if (!newSlug || newSlug.length < 2) {
      throw new BadRequestError('Invalid event slug.');
    }

    if (newSlug !== event.slug) {
      const existing = await prisma.event.findUnique({
        where: {
          unique_org_event_slug: {
            organisationId: event.organisationId,
            slug: newSlug,
          },
        },
      });
      if (existing) {
        throw new ConflictError(
          `Event slug '${newSlug}' is already taken in this organisation.`
        );
      }
      updateData.slug = newSlug;
    }
  }

  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.location !== undefined) updateData.location = input.location?.trim() || null;
  if (input.startTime !== undefined) updateData.startTime = input.startTime?.trim() || null;
  if (input.endTime !== undefined) updateData.endTime = input.endTime?.trim() || null;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.visibility !== undefined) updateData.visibility = input.visibility;
  if (input.isFeatured !== undefined) updateData.isFeatured = input.isFeatured;
  if (input.allowUserUploads !== undefined) updateData.allowUserUploads = input.allowUserUploads;
  if (input.allowDownloads !== undefined) updateData.allowDownloads = input.allowDownloads;
  if (input.allowOriginalDownloads !== undefined) updateData.allowOriginalDownloads = input.allowOriginalDownloads;
  if (input.allowBulkDownloads !== undefined) updateData.allowBulkDownloads = input.allowBulkDownloads;
  if (input.faceSearchEnabled !== undefined) updateData.faceSearchEnabled = input.faceSearchEnabled;
  if (input.coverMediaId !== undefined) {
    if (input.coverMediaId) {
      const media = await prisma.mediaItem.findUnique({
        where: { id: input.coverMediaId },
        select: { id: true, organisationId: true, eventId: true, status: true },
      });
      if (!media || media.organisationId !== event.organisationId) {
        throw new BadRequestError('Cover media must belong to this organisation.');
      }
    }
    updateData.coverMediaId = input.coverMediaId;
  }

  if (input.startDate !== undefined || input.eventDate !== undefined) {
    const rawStart = input.startDate || input.eventDate;
    if (rawStart) {
      const parsedStart = new Date(rawStart);
      if (isNaN(parsedStart.getTime())) throw new BadRequestError('Invalid start date.');
      updateData.eventDate = parsedStart;
      updateData.startDate = parsedStart;
    }
  }

  if (input.endDate !== undefined) {
    if (input.endDate === null) {
      updateData.endDate = null;
    } else {
      const parsedEnd = new Date(input.endDate);
      if (isNaN(parsedEnd.getTime())) throw new BadRequestError('Invalid end date.');
      const currentStart = updateData.startDate || event.startDate || event.eventDate;
      if (parsedEnd.getTime() < new Date(currentStart).getTime()) {
        throw new BadRequestError('End date must be greater than or equal to start date.');
      }
      updateData.endDate = parsedEnd;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'EVENT_UPDATED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: updateData,
      },
    });

    return updated;
  });

  return result;
}

/**
 * Publishes a draft or ongoing event.
 */
export async function publishEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canPublishEvent(userRole)) {
    throw new ForbiddenError('You do not have permission to publish this event.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
    });

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'EVENT_PUBLISHED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: { previousStatus: event.status },
      },
    });

    return updated;
  });

  return result;
}

/**
 * Soft-archives an event (changes status to ARCHIVED, sets archivedAt timestamp).
 */
export async function archiveEvent(eventId: string, userId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canArchiveEvent(userRole)) {
    throw new ForbiddenError('You do not have permission to archive this event.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const archived = await tx.event.update({
      where: { id: eventId },
      data: {
        status: EventStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'EVENT_ARCHIVED',
        resourceType: 'EVENT',
        resourceId: eventId,
      },
    });

    return archived;
  });

  return result;
}

/**
 * Restores an archived event to COMPLETED or PUBLISHED status.
 */
export async function restoreEvent(
  eventId: string,
  userId: string,
  targetStatus: EventStatus = EventStatus.COMPLETED
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (event.status !== EventStatus.ARCHIVED) {
    throw new BadRequestError('Only archived events can be restored.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canRestoreEvent(userRole)) {
    throw new ForbiddenError('You do not have permission to restore this event.');
  }

  const safeTargetStatus =
    targetStatus === EventStatus.PUBLISHED || targetStatus === EventStatus.COMPLETED
      ? targetStatus
      : EventStatus.COMPLETED;

  const result = await prisma.$transaction(async (tx) => {
    const restored = await tx.event.update({
      where: { id: eventId },
      data: {
        status: safeTargetStatus,
        archivedAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'EVENT_RESTORED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: { restoredToStatus: safeTargetStatus },
      },
    });

    return restored;
  });

  return result;
}

/**
 * Sets event cover from an existing media item in the event.
 */
export async function setEventCoverFromMedia(
  eventId: string,
  userId: string,
  mediaId: string
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canSetEventCover(userRole)) {
    throw new ForbiddenError('You do not have permission to change the cover image.');
  }

  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    select: { id: true, organisationId: true, eventId: true, status: true },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  if (media.organisationId !== event.organisationId) {
    throw new ForbiddenError('Media item does not belong to this organisation.');
  }

  if (media.eventId !== event.id) {
    throw new BadRequestError('Cover media item must belong to this specific event.');
  }

  if (media.status !== 'READY') {
    throw new BadRequestError('Only processed, READY media items can be set as cover.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { coverMediaId: mediaId },
    });

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'EVENT_COVER_CHANGED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: { coverMediaId: mediaId },
      },
    });

    return updated;
  });

  return result;
}

/**
 * Retrieves aggregate statistics for an event dashboard efficiently.
 */
export async function getEventStats(
  eventId: string,
  userRole?: RoleType | null,
  hasOrgAccess = false
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, organisationId: true, status: true, visibility: true },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (!canViewEvent(event, userRole, hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to view stats for this event.');
  }

  const [
    totalAlbums,
    totalPhotos,
    totalVideos,
    pendingUserUploads,
    publishedMedia,
    storageAgg,
  ] = await Promise.all([
    prisma.album.count({
      where: { eventId, status: { not: 'ARCHIVED' } },
    }),
    prisma.mediaItem.count({
      where: { eventId, mediaType: MediaType.IMAGE, status: 'READY' },
    }),
    prisma.mediaItem.count({
      where: { eventId, mediaType: MediaType.VIDEO, status: 'READY' },
    }),
    prisma.mediaItem.count({
      where: { eventId, approvalStatus: ApprovalStatus.PENDING },
    }),
    prisma.mediaItem.count({
      where: { eventId, isPublished: true, status: 'READY' },
    }),
    prisma.mediaItem.aggregate({
      where: { eventId, status: 'READY' },
      _sum: { fileSize: true },
    }),
  ]);

  return {
    totalAlbums,
    totalPhotos,
    totalVideos,
    totalMedia: totalPhotos + totalVideos,
    pendingUserUploads,
    publishedMedia,
    storageUsedBytes: Number(storageAgg._sum?.fileSize || 0),
  };
}

/**
 * Retrieves event calendar and year grouped metadata.
 */
export async function getEventCalendar(
  organisationId: string,
  year?: number,
  userRole?: RoleType | null,
  hasOrgAccess = false
) {
  const targetYear = year || new Date().getFullYear();
  const startOfYear = new Date(`${targetYear}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${targetYear}-12-31T23:59:59.999Z`);

  const STAFF_ROLES: RoleType[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.ORGANISATION_OWNER,
    ROLES.ORGANISATION_ADMIN,
    ROLES.SOCIAL_MEDIA_MANAGER,
    ROLES.SOCIAL_MEDIA_MEMBER,
    ROLES.MODERATOR,
  ];
  const isStaff = userRole && STAFF_ROLES.includes(userRole);

  const whereClause: any = {
    organisationId,
    eventDate: {
      gte: startOfYear,
      lte: endOfYear,
    },
  };

  if (!isStaff) {
    whereClause.status = { in: [EventStatus.PUBLISHED, EventStatus.ONGOING, EventStatus.COMPLETED] };
    if (!hasOrgAccess) {
      whereClause.visibility = EventVisibility.PUBLIC;
    }
  }

  const events = await prisma.event.findMany({
    where: whereClause,
    orderBy: { eventDate: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      eventDate: true,
      startDate: true,
      endDate: true,
      startTime: true,
      endTime: true,
      location: true,
      coverMediaId: true,
      status: true,
      visibility: true,
      isFeatured: true,
      allowUserUploads: true,
      _count: {
        select: {
          albums: true,
          mediaItems: { where: { status: 'READY' } },
        },
      },
    },
  });

  return {
    year: targetYear,
    totalEvents: events.length,
    events,
  };
}
