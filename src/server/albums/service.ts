import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import {
  canCreateAlbum,
  canUpdateAlbum,
  canArchiveAlbum,
  canRestoreAlbum,
  canReorderAlbums,
  canMoveMedia,
  canViewEvent,
  EVENT_ADMIN_ROLES,
} from '@/server/permissions/event-guards';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { normalizeSlug } from '@/server/organisations/service';
import { AlbumStatus, EventVisibility, MediaType } from '@prisma/client';

export interface CreateAlbumInput {
  organisationId: string;
  eventId: string;
  name: string;
  slug?: string;
  description?: string;
  coverMediaId?: string | null;
  sortOrder?: number;
  status?: AlbumStatus;
  visibility?: EventVisibility;
  createdByUserId: string;
}

export interface UpdateAlbumInput {
  name?: string;
  slug?: string;
  description?: string;
  coverMediaId?: string | null;
  sortOrder?: number;
  status?: AlbumStatus;
  visibility?: EventVisibility;
}

export interface BulkMoveMediaInput {
  organisationId: string;
  eventId: string;
  mediaIds: string[];
  targetAlbumId: string | null;
  userId: string;
}

export interface MoveMediaToEventInput {
  organisationId: string;
  sourceEventId: string;
  targetEventId: string;
  mediaIds: string[];
  targetAlbumId?: string | null;
  userId: string;
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
 * Creates an album within an event after verifying tenant ownership, role, and slug uniqueness.
 */
export async function createAlbum(input: CreateAlbumInput) {
  if (!input.name || input.name.trim().length < 2) {
    throw new BadRequestError('Album name must be at least 2 characters long.');
  }

  // 1. Verify event existence and tenant ownership
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { id: true, organisationId: true, status: true },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  assertTenantOwnership(event.organisationId, input.organisationId, 'Event');

  // 2. Verify user role
  const userRole = await resolveUserRole(input.organisationId, input.createdByUserId);

  if (!canCreateAlbum(userRole)) {
    throw new ForbiddenError(
      `Access denied. Role '${userRole}' cannot create albums in this organisation.`
    );
  }

  // 3. Compute and check slug uniqueness per event
  const finalSlug = normalizeSlug(input.slug || input.name);
  if (!finalSlug || finalSlug.length < 2) {
    throw new BadRequestError('Invalid album slug generated.');
  }

  const existing = await prisma.album.findUnique({
    where: {
      unique_event_album_slug: {
        eventId: input.eventId,
        slug: finalSlug,
      },
    },
  });

  if (existing) {
    throw new ConflictError(
      `An album with slug '${finalSlug}' already exists in this event.`
    );
  }

  // 4. Compute default sort order if not provided
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const maxAlbum = await prisma.album.findFirst({
      where: { eventId: input.eventId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    sortOrder = (maxAlbum?.sortOrder ?? -1) + 1;
  }

  // 5. Transactional creation + audit log
  const result = await prisma.$transaction(async (tx) => {
    const album = await tx.album.create({
      data: {
        organisationId: input.organisationId,
        eventId: input.eventId,
        name: input.name.trim(),
        slug: finalSlug,
        description: input.description?.trim() || null,
        coverMediaId: input.coverMediaId || null,
        sortOrder,
        status: input.status || AlbumStatus.PUBLISHED,
        visibility: input.visibility || EventVisibility.ORGANISATION,
        createdBy: input.createdByUserId,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.createdByUserId,
        action: 'ALBUM_CREATED',
        resourceType: 'ALBUM',
        resourceId: album.id,
        metadata: {
          name: album.name,
          slug: album.slug,
          eventId: input.eventId,
          sortOrder: album.sortOrder,
          visibility: album.visibility,
        },
      },
    });

    return album;
  });

  return result;
}

/**
 * Retrieves album by ID with parent event visibility verification.
 */
export async function getAlbumById(
  albumId: string,
  userRole?: RoleType | null,
  hasOrgAccess = false
) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          visibility: true,
          organisationId: true,
        },
      },
      _count: {
        select: {
          mediaItems: { where: { status: 'READY' } },
        },
      },
    },
  });

  if (!album) {
    throw new NotFoundError('Album not found.');
  }

  if (!canViewEvent(album.event, userRole, hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to view this album.');
  }

  // Compute breakdown for photos vs videos
  const [photosCount, videosCount] = await Promise.all([
    prisma.mediaItem.count({
      where: {
        albumId: album.id,
        mediaType: MediaType.IMAGE,
        status: 'READY',
      },
    }),
    prisma.mediaItem.count({
      where: {
        albumId: album.id,
        mediaType: MediaType.VIDEO,
        status: 'READY',
      },
    }),
  ]);

  return {
    ...album,
    photosCount,
    videosCount,
  };
}

/**
 * Lists albums belonging to an event with cursor/ordering support.
 */
export async function listAlbumsByEvent(
  eventId: string,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  includeArchived = false
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      status: true,
      visibility: true,
      organisationId: true,
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  if (!canViewEvent(event, userRole, hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to view albums in this event.');
  }

  const STAFF_ROLES: RoleType[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.ORGANISATION_OWNER,
    ROLES.ORGANISATION_ADMIN,
    ROLES.SOCIAL_MEDIA_MANAGER,
    ROLES.SOCIAL_MEDIA_MEMBER,
    ROLES.MODERATOR,
  ];
  const isStaff = userRole && STAFF_ROLES.includes(userRole);

  const whereClause: any = { eventId };
  if (!isStaff) {
    whereClause.status = AlbumStatus.PUBLISHED;
  } else if (!includeArchived) {
    whereClause.status = { not: AlbumStatus.ARCHIVED };
  }

  const albums = await prisma.album.findMany({
    where: whereClause,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      _count: {
        select: {
          mediaItems: { where: { status: 'READY' } },
        },
      },
    },
  });

  return albums;
}

/**
 * Updates an album's properties.
 */
export async function updateAlbum(
  albumId: string,
  userId: string,
  input: UpdateAlbumInput
) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found.');
  }

  const userRole = await resolveUserRole(album.organisationId, userId);

  if (!canUpdateAlbum(userRole)) {
    throw new ForbiddenError('You do not have permission to update this album.');
  }

  const updateData: any = {};
  if (input.name !== undefined) {
    if (input.name.trim().length < 2) {
      throw new BadRequestError('Album name must be at least 2 characters long.');
    }
    updateData.name = input.name.trim();
  }

  if (input.slug !== undefined) {
    const newSlug = normalizeSlug(input.slug);
    if (!newSlug || newSlug.length < 2) throw new BadRequestError('Invalid album slug.');

    if (newSlug !== album.slug) {
      const existing = await prisma.album.findUnique({
        where: {
          unique_event_album_slug: {
            eventId: album.eventId,
            slug: newSlug,
          },
        },
      });
      if (existing) {
        throw new ConflictError(`Album slug '${newSlug}' already exists in this event.`);
      }
      updateData.slug = newSlug;
    }
  }

  if (input.description !== undefined) updateData.description = input.description?.trim() || null;
  if (input.coverMediaId !== undefined) updateData.coverMediaId = input.coverMediaId;
  if (input.sortOrder !== undefined) updateData.sortOrder = Number(input.sortOrder);
  if (input.status !== undefined) updateData.status = input.status;
  if (input.visibility !== undefined) updateData.visibility = input.visibility;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.album.update({
      where: { id: albumId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        organisationId: album.organisationId,
        actorUserId: userId,
        action: 'ALBUM_UPDATED',
        resourceType: 'ALBUM',
        resourceId: albumId,
        metadata: updateData,
      },
    });

    return updated;
  });

  return result;
}

/**
 * Reorders albums within an event.
 */
export async function reorderAlbums(
  eventId: string,
  userId: string,
  orderedAlbumIds: string[]
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  const userRole = await resolveUserRole(event.organisationId, userId);

  if (!canReorderAlbums(userRole)) {
    throw new ForbiddenError('You do not have permission to reorder albums in this event.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updates = orderedAlbumIds.map((albumId, idx) =>
      tx.album.update({
        where: { id: albumId },
        data: { sortOrder: idx },
      })
    );
    await Promise.all(updates);

    await tx.auditLog.create({
      data: {
        organisationId: event.organisationId,
        actorUserId: userId,
        action: 'ALBUM_REORDERED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: { orderedAlbumIds },
      },
    });

    return true;
  });

  return result;
}

/**
 * Soft-archives an album (sets status to ARCHIVED, sets archivedAt timestamp).
 */
export async function archiveAlbum(albumId: string, userId: string) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found.');
  }

  const userRole = await resolveUserRole(album.organisationId, userId);

  if (!canArchiveAlbum(userRole)) {
    throw new ForbiddenError('You do not have permission to archive this album.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const archived = await tx.album.update({
      where: { id: albumId },
      data: {
        status: AlbumStatus.ARCHIVED,
        archivedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: album.organisationId,
        actorUserId: userId,
        action: 'ALBUM_ARCHIVED',
        resourceType: 'ALBUM',
        resourceId: albumId,
      },
    });

    return archived;
  });

  return result;
}

/**
 * Restores an archived album to PUBLISHED status.
 */
export async function restoreAlbum(albumId: string, userId: string) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found.');
  }

  if (album.status !== AlbumStatus.ARCHIVED) {
    throw new BadRequestError('Only archived albums can be restored.');
  }

  const userRole = await resolveUserRole(album.organisationId, userId);

  if (!canRestoreAlbum(userRole)) {
    throw new ForbiddenError('You do not have permission to restore this album.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const restored = await tx.album.update({
      where: { id: albumId },
      data: {
        status: AlbumStatus.PUBLISHED,
        archivedAt: null,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: album.organisationId,
        actorUserId: userId,
        action: 'ALBUM_RESTORED',
        resourceType: 'ALBUM',
        resourceId: albumId,
      },
    });

    return restored;
  });

  return result;
}

/**
 * Sets album cover from an existing media item in the album.
 */
export async function setAlbumCoverFromMedia(
  albumId: string,
  userId: string,
  mediaId: string
) {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found.');
  }

  const userRole = await resolveUserRole(album.organisationId, userId);

  if (!canUpdateAlbum(userRole)) {
    throw new ForbiddenError('You do not have permission to modify this album.');
  }

  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    select: { id: true, organisationId: true, eventId: true, albumId: true, status: true },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  if (media.organisationId !== album.organisationId) {
    throw new ForbiddenError('Media item does not belong to this organisation.');
  }

  if (media.albumId !== album.id) {
    throw new BadRequestError('Media item must belong to this specific album.');
  }

  if (media.status !== 'READY') {
    throw new BadRequestError('Only processed, READY media items can be set as cover.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.album.update({
      where: { id: albumId },
      data: { coverMediaId: mediaId },
    });

    await tx.auditLog.create({
      data: {
        organisationId: album.organisationId,
        actorUserId: userId,
        action: 'ALBUM_COVER_CHANGED',
        resourceType: 'ALBUM',
        resourceId: albumId,
        metadata: { coverMediaId: mediaId },
      },
    });

    return updated;
  });

  return result;
}

/**
 * Moves media items within an event from one album to another (or unassigned/null).
 */
export async function moveMediaToAlbum(input: BulkMoveMediaInput) {
  if (!input.mediaIds || input.mediaIds.length === 0) {
    throw new BadRequestError('No media IDs provided.');
  }

  const userRole = await resolveUserRole(input.organisationId, input.userId);

  if (!canMoveMedia(userRole)) {
    throw new ForbiddenError('You do not have permission to move media between albums.');
  }

  // 1. If targetAlbumId is provided, verify target album exists and belongs to same event
  if (input.targetAlbumId) {
    const targetAlbum = await prisma.album.findUnique({
      where: { id: input.targetAlbumId },
      select: { id: true, organisationId: true, eventId: true },
    });

    if (!targetAlbum) {
      throw new NotFoundError('Target album not found.');
    }

    if (
      targetAlbum.organisationId !== input.organisationId ||
      targetAlbum.eventId !== input.eventId
    ) {
      throw new BadRequestError(
        'Target album must belong to the same organisation and event.'
      );
    }
  }

  // 2. Verify all media items belong to the organisation and event
  const mediaItems = await prisma.mediaItem.findMany({
    where: {
      id: { in: input.mediaIds },
      organisationId: input.organisationId,
      eventId: input.eventId,
    },
    select: { id: true, albumId: true },
  });

  if (mediaItems.length !== input.mediaIds.length) {
    throw new BadRequestError(
      'Some media items could not be found or do not belong to this event.'
    );
  }

  // 3. Atomically update album assignment
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.mediaItem.updateMany({
      where: {
        id: { in: input.mediaIds },
        organisationId: input.organisationId,
        eventId: input.eventId,
      },
      data: {
        albumId: input.targetAlbumId,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'MEDIA_MOVED_ALBUM',
        resourceType: 'EVENT',
        resourceId: input.eventId,
        metadata: {
          mediaCount: updated.count,
          targetAlbumId: input.targetAlbumId,
          mediaIds: input.mediaIds,
        },
      },
    });

    return { updatedCount: updated.count };
  });

  return result;
}

/**
 * Moves media items between events within the same organisation (privileged operation).
 */
export async function moveMediaToEvent(input: MoveMediaToEventInput) {
  if (!input.mediaIds || input.mediaIds.length === 0) {
    throw new BadRequestError('No media IDs provided.');
  }

  if (input.sourceEventId === input.targetEventId) {
    throw new BadRequestError('Source and target events cannot be identical.');
  }

  const userRole = await resolveUserRole(input.organisationId, input.userId);

  if (!EVENT_ADMIN_ROLES.includes(userRole)) {
    throw new ForbiddenError(
      'Only organisation administrators or social media managers can move media between events.'
    );
  }

  // 1. Verify target event belongs to the same organisation
  const targetEvent = await prisma.event.findUnique({
    where: { id: input.targetEventId },
    select: { id: true, organisationId: true },
  });

  if (!targetEvent || targetEvent.organisationId !== input.organisationId) {
    throw new BadRequestError('Target event must belong to the same organisation.');
  }

  // 2. If targetAlbumId is provided, verify it belongs to target event
  if (input.targetAlbumId) {
    const targetAlbum = await prisma.album.findUnique({
      where: { id: input.targetAlbumId },
      select: { id: true, organisationId: true, eventId: true },
    });

    if (
      !targetAlbum ||
      targetAlbum.organisationId !== input.organisationId ||
      targetAlbum.eventId !== input.targetEventId
    ) {
      throw new BadRequestError('Target album must belong to target event.');
    }
  }

  // 3. Verify all media belong to source event and organisation
  const mediaItems = await prisma.mediaItem.findMany({
    where: {
      id: { in: input.mediaIds },
      organisationId: input.organisationId,
      eventId: input.sourceEventId,
    },
    select: { id: true },
  });

  if (mediaItems.length !== input.mediaIds.length) {
    throw new BadRequestError(
      'Some media items do not belong to the source event or organisation.'
    );
  }

  // 4. Atomically move media items
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.mediaItem.updateMany({
      where: {
        id: { in: input.mediaIds },
        organisationId: input.organisationId,
        eventId: input.sourceEventId,
      },
      data: {
        eventId: input.targetEventId,
        albumId: input.targetAlbumId || null,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'MEDIA_MOVED_EVENT',
        resourceType: 'EVENT',
        resourceId: input.targetEventId,
        metadata: {
          mediaCount: updated.count,
          sourceEventId: input.sourceEventId,
          targetEventId: input.targetEventId,
          targetAlbumId: input.targetAlbumId || null,
          mediaIds: input.mediaIds,
        },
      },
    });

    return { updatedCount: updated.count };
  });

  return result;
}
