import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/lib/errors';
import {
  canCreateMediaMetadata,
  canUpdateMediaMetadata,
  canDeleteMedia,
  canViewMedia,
  canViewEvent,
} from '@/server/permissions/event-guards';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import {
  buildOriginalMediaStorageKey,
  buildMediaVariantStorageKey,
} from './storage-keys';
import {
  MediaType,
  MediaStatus,
  MediaVisibility,
  ApprovalStatus,
  VariantType,
} from '@prisma/client';
import { getCdnProvider } from '@/server/cdn';
import crypto from 'crypto';

export interface CreateMediaMetadataInput {
  organisationId: string;
  eventId: string;
  albumId?: string | null;
  uploaderId: string;
  mediaType: MediaType;
  originalFileName: string;
  mimeType: string;
  fileSize: number | bigint;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  frameRate?: number | null;
  codec?: string | null;
  checksum?: string | null;
  visibility?: MediaVisibility;
  approvalStatus?: ApprovalStatus;
  faceSearchEnabled?: boolean;
}

export interface UpdateMediaMetadataInput {
  albumId?: string | null;
  visibility?: MediaVisibility;
  approvalStatus?: ApprovalStatus;
  faceSearchEnabled?: boolean;
  status?: MediaStatus;
}

export interface ListMediaOptions {
  eventId: string;
  albumId?: string | null;
  mediaType?: MediaType;
  cursor?: string;
  limit?: number;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
  userId?: string | null;
}

/**
 * Creates media metadata and deterministic storage key entries inside a database transaction.
 */
export async function createMediaMetadata(input: CreateMediaMetadataInput) {
  if (!input.originalFileName || input.originalFileName.trim().length === 0) {
    throw new BadRequestError('Original filename is required.');
  }

  if (!input.mimeType || (!input.mimeType.startsWith('image/') && !input.mimeType.startsWith('video/'))) {
    throw new BadRequestError('Invalid or unsupported MIME type.');
  }

  // 1. Verify Event existence and tenant ownership
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      organisationId: true,
      allowUserUploads: true,
      faceSearchEnabled: true,
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  assertTenantOwnership(event.organisationId, input.organisationId, 'Event');

  // 2. If albumId is provided, verify it belongs to this event
  if (input.albumId) {
    const album = await prisma.album.findUnique({
      where: { id: input.albumId },
      select: { id: true, eventId: true, organisationId: true },
    });

    if (!album) {
      throw new NotFoundError('Album not found.');
    }

    if (album.eventId !== input.eventId) {
      throw new BadRequestError('Selected album does not belong to this event.');
    }
  }

  // 3. Check uploader role and permissions
  const user = await prisma.user.findUnique({
    where: { id: input.uploaderId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (!user) {
    throw new NotFoundError('Uploader user not found.');
  }

  let userRole: RoleType = ROLES.USER;
  if (user.isPlatformAdmin) {
    userRole = ROLES.PLATFORM_ADMIN;
  } else {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: input.organisationId,
          userId: input.uploaderId,
        },
      },
    });

    if (member && member.status === 'ACTIVE') {
      userRole = member.role as RoleType;
    }
  }

  if (!canCreateMediaMetadata(userRole, event.allowUserUploads)) {
    throw new ForbiddenError('You do not have permission to upload media to this event.');
  }

  const mediaId = crypto.randomUUID();
  const storageKey = buildOriginalMediaStorageKey(input.organisationId, input.eventId, mediaId);

  const result = await prisma.$transaction(async (tx) => {
    const mediaItem = await tx.mediaItem.create({
      data: {
        id: mediaId,
        organisationId: input.organisationId,
        eventId: input.eventId,
        albumId: input.albumId || null,
        uploaderId: input.uploaderId,
        mediaType: input.mediaType,
        status: MediaStatus.READY,
        visibility: input.visibility || MediaVisibility.ORGANISATION,
        approvalStatus: input.approvalStatus || ApprovalStatus.NOT_REQUIRED,
        faceSearchEnabled: input.faceSearchEnabled ?? event.faceSearchEnabled,
        originalStorageKey: storageKey,
        originalFileName: input.originalFileName,
        mimeType: input.mimeType,
        fileSize: BigInt(input.fileSize),
        width: input.width || null,
        height: input.height || null,
        durationMs: input.durationMs || null,
        frameRate: input.frameRate || null,
        codec: input.codec || null,
        checksum: input.checksum || null,
      },
    });

    // Create Original variant record
    await tx.mediaVariant.create({
      data: {
        mediaItemId: mediaItem.id,
        variantType: VariantType.ORIGINAL,
        storageKey,
        mimeType: input.mimeType,
        fileSize: BigInt(input.fileSize),
        width: input.width || null,
        height: input.height || null,
        durationMs: input.durationMs || null,
        codec: input.codec || null,
        status: MediaStatus.READY,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.uploaderId,
        action: 'MEDIA_METADATA_CREATED',
        resourceType: 'MEDIA_ITEM',
        resourceId: mediaItem.id,
        metadata: {
          originalFileName: input.originalFileName,
          mediaType: input.mediaType,
          fileSize: Number(input.fileSize),
          eventId: input.eventId,
        },
      },
    });

    return mediaItem;
  });

  return result;
}

/**
 * Retrieves a media item by ID with multi-layered access visibility evaluation.
 */
export async function getMediaItemById(
  mediaId: string,
  userRole?: RoleType | null,
  hasOrgAccess = false,
  userId?: string | null
) {
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: {
      event: {
        select: {
          id: true,
          status: true,
          visibility: true,
          organisationId: true,
        },
      },
      album: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      variants: {
        select: {
          id: true,
          variantType: true,
          mimeType: true,
          fileSize: true,
          width: true,
          height: true,
          status: true,
        },
      },
    },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  if (!canViewMedia(media, media.event, userRole, hasOrgAccess, userId)) {
    throw new ForbiddenError('You do not have permission to view this media item.');
  }

  return media;
}

/**
 * Lists media items for an event using cursor-based pagination and visibility filtering.
 */
export async function listMediaByEvent(options: ListMediaOptions) {
  const limit = Math.min(Math.max(Number(options.limit) || 24, 1), 100);

  const event = await prisma.event.findUnique({
    where: { id: options.eventId },
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

  if (!canViewEvent(event, options.userRole, options.hasOrgAccess)) {
    throw new ForbiddenError('You do not have permission to access media in this event.');
  }

  const STAFF_ROLES: RoleType[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.ORGANISATION_OWNER,
    ROLES.ORGANISATION_ADMIN,
    ROLES.SOCIAL_MEDIA_MANAGER,
    ROLES.MODERATOR,
  ];
  const isStaff = options.userRole && STAFF_ROLES.includes(options.userRole);

  const whereClause: any = {
    eventId: options.eventId,
  };

  if (options.albumId !== undefined) {
    whereClause.albumId = options.albumId;
  }

  if (options.mediaType) {
    whereClause.mediaType = options.mediaType;
  }

  // Non-staff viewers only see READY + APPROVED/NOT_REQUIRED + isPublished: true + ORGANISATION/PUBLIC media
  if (!isStaff) {
    whereClause.status = MediaStatus.READY;
    whereClause.approvalStatus = { in: [ApprovalStatus.NOT_REQUIRED, ApprovalStatus.APPROVED] };
    whereClause.isPublished = true;
    if (!options.hasOrgAccess && !options.userRole) {
      whereClause.visibility = MediaVisibility.PUBLIC;
    } else {
      whereClause.visibility = { in: [MediaVisibility.PUBLIC, MediaVisibility.ORGANISATION] };
    }
  }

  const findManyArgs: any = {
    where: whereClause,
    take: limit + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      album: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      variants: {
        where: {
          status: MediaStatus.READY,
        },
      },
    },
  };

  if (options.cursor) {
    findManyArgs.cursor = { id: options.cursor };
    findManyArgs.skip = 1;
  }

  const mediaItems = await prisma.mediaItem.findMany(findManyArgs);

  const hasMore = mediaItems.length > limit;
  const rawItems = hasMore ? mediaItems.slice(0, limit) : mediaItems;
  const nextCursor = hasMore ? rawItems[rawItems.length - 1].id : null;

  const cdn = getCdnProvider();

  const items = await Promise.all(
    (rawItems as any[]).map(async (item) => {
      const variants = (item.variants || []) as any[];
      const thumbVariant = variants.find(
        (v) => v.variantType === VariantType.THUMBNAIL
      );
      const optVariant = variants.find(
        (v) => v.variantType === VariantType.OPTIMIZED
      );

      const thumbKey = thumbVariant?.storageKey || optVariant?.storageKey || item.originalStorageKey;
      const optKey = optVariant?.storageKey || item.originalStorageKey;

      let thumbnailUrl: string | null = null;
      let optimizedUrl: string | null = null;

      if (thumbKey && item.status === MediaStatus.READY) {
        try {
          thumbnailUrl = await cdn.generateMediaAccessUrl(thumbKey, {
            deliveryType: 'THUMBNAIL',
          });
        } catch {
          // Graceful fallback
        }
      }

      if (optKey && item.status === MediaStatus.READY) {
        try {
          optimizedUrl = await cdn.generateMediaAccessUrl(optKey, {
            deliveryType: 'OPTIMIZED_IMAGE',
          });
        } catch {
          // Graceful fallback
        }
      }

      return {
        ...item,
        thumbnailUrl,
        optimizedUrl,
      };
    })
  );

  return {
    items,
    nextCursor,
    hasMore,
  };
}

/**
 * Updates media metadata (album assignment, visibility, approval status).
 */
export async function updateMediaMetadata(
  mediaId: string,
  userId: string,
  input: UpdateMediaMetadataInput
) {
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
    include: {
      event: { select: { organisationId: true, id: true } },
    },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });

  let userRole: RoleType = ROLES.USER;
  if (user?.isPlatformAdmin) {
    userRole = ROLES.PLATFORM_ADMIN;
  } else {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: media.organisationId,
          userId,
        },
      },
    });
    if (member && member.status === 'ACTIVE') {
      userRole = member.role as RoleType;
    }
  }

  if (!canUpdateMediaMetadata(media, userRole, userId)) {
    throw new ForbiddenError('You do not have permission to update this media metadata.');
  }

  const updateData: any = {};

  if (input.albumId !== undefined) {
    if (input.albumId) {
      const album = await prisma.album.findUnique({
        where: { id: input.albumId },
        select: { id: true, eventId: true },
      });
      if (!album || album.eventId !== media.eventId) {
        throw new BadRequestError('Target album does not belong to this event.');
      }
      updateData.albumId = input.albumId;
    } else {
      updateData.albumId = null;
    }
  }

  if (input.visibility !== undefined) updateData.visibility = input.visibility;
  if (input.approvalStatus !== undefined) updateData.approvalStatus = input.approvalStatus;
  if (input.faceSearchEnabled !== undefined) updateData.faceSearchEnabled = input.faceSearchEnabled;
  if (input.status !== undefined) updateData.status = input.status;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.mediaItem.update({
      where: { id: mediaId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        organisationId: media.organisationId,
        actorUserId: userId,
        action: 'MEDIA_METADATA_UPDATED',
        resourceType: 'MEDIA_ITEM',
        resourceId: mediaId,
        metadata: updateData,
      },
    });

    return updated;
  });

  return result;
}

/**
 * Soft-deletes a media item by setting status to DELETED.
 */
export async function deleteMediaMetadata(mediaId: string, userId: string) {
  const media = await prisma.mediaItem.findUnique({
    where: { id: mediaId },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });

  let userRole: RoleType = ROLES.USER;
  if (user?.isPlatformAdmin) {
    userRole = ROLES.PLATFORM_ADMIN;
  } else {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: media.organisationId,
          userId,
        },
      },
    });
    if (member && member.status === 'ACTIVE') {
      userRole = member.role as RoleType;
    }
  }

  if (!canDeleteMedia(media, userRole, userId)) {
    throw new ForbiddenError('You do not have permission to delete this media item.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.mediaItem.update({
      where: { id: mediaId },
      data: { status: MediaStatus.DELETED },
    });

    await tx.auditLog.create({
      data: {
        organisationId: media.organisationId,
        actorUserId: userId,
        action: 'MEDIA_DELETED',
        resourceType: 'MEDIA_ITEM',
        resourceId: mediaId,
      },
    });

    return deleted;
  });

  return result;
}
