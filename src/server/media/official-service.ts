import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { checkRolePermission, PERMISSIONS } from '@/server/permissions/permissions';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { MediaStatus, MediaVisibility, ApprovalStatus, UploadType } from '@prisma/client';
import { env } from '@/config/env';

export interface BulkPublishInput {
  organisationId: string;
  eventId: string;
  mediaIds: string[];
  userId: string;
}

export interface BulkArchiveInput {
  organisationId: string;
  eventId: string;
  mediaIds: string[];
  userId: string;
}

export interface BulkAlbumAssignInput {
  organisationId: string;
  eventId: string;
  albumId: string | null;
  mediaIds: string[];
  userId: string;
}

export class OfficialMediaService {
  /**
   * Resolves and verifies user membership and role within organisation.
   */
  private static async getVerifiedRole(userId: string, organisationId: string): Promise<RoleType> {
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
   * Publishes ready media items in bulk with per-item validation.
   */
  static async bulkPublish(input: BulkPublishInput) {
    const { organisationId, eventId, mediaIds, userId } = input;

    if (!mediaIds || mediaIds.length === 0) {
      throw new BadRequestError('At least one media ID is required for publishing.');
    }

    const userRole = await this.getVerifiedRole(userId, organisationId);
    const canPublish = checkRolePermission(userRole, PERMISSIONS.MEDIA_PUBLISH);
    if (!canPublish) {
      throw new ForbiddenError('You do not have permission to publish media.');
    }

    const items = await prisma.mediaItem.findMany({
      where: {
        id: { in: mediaIds },
        organisationId, // Tenant isolation
        eventId,
      },
      select: {
        id: true,
        status: true,
        isPublished: true,
        approvalStatus: true,
      },
    });

    const readyItems = items.filter(
      (item) => item.status === MediaStatus.READY && item.approvalStatus !== ApprovalStatus.REJECTED
    );
    const readyIds = readyItems.map((item) => item.id);
    const skippedIds = mediaIds.filter((id) => !readyIds.includes(id));

    if (readyIds.length > 0) {
      await prisma.mediaItem.updateMany({
        where: { id: { in: readyIds } },
        data: {
          isPublished: true,
          publishedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          organisationId,
          actorUserId: userId,
          action: 'MEDIA_BULK_PUBLISHED',
          resourceType: 'MEDIA_ITEM',
          metadata: {
            publishedCount: readyIds.length,
            skippedCount: skippedIds.length,
            eventId,
          },
        },
      });
    }

    return {
      publishedCount: readyIds.length,
      skippedCount: skippedIds.length,
      publishedIds: readyIds,
      skippedIds,
    };
  }

  /**
   * Archives media items in bulk (hiding from public/attendee gallery).
   */
  static async bulkArchive(input: BulkArchiveInput) {
    const { organisationId, eventId, mediaIds, userId } = input;

    if (!mediaIds || mediaIds.length === 0) {
      throw new BadRequestError('At least one media ID is required for archiving.');
    }

    const userRole = await this.getVerifiedRole(userId, organisationId);
    const canArchive = checkRolePermission(userRole, PERMISSIONS.MEDIA_ARCHIVE);
    if (!canArchive) {
      throw new ForbiddenError('You do not have permission to archive media.');
    }

    const items = await prisma.mediaItem.findMany({
      where: {
        id: { in: mediaIds },
        organisationId,
        eventId,
      },
      select: { id: true },
    });

    const validIds = items.map((i) => i.id);

    if (validIds.length > 0) {
      await prisma.mediaItem.updateMany({
        where: { id: { in: validIds } },
        data: {
          isPublished: false,
          visibility: MediaVisibility.PRIVATE,
        },
      });

      await prisma.auditLog.create({
        data: {
          organisationId,
          actorUserId: userId,
          action: 'MEDIA_BULK_ARCHIVED',
          resourceType: 'MEDIA_ITEM',
          metadata: {
            archivedCount: validIds.length,
            eventId,
          },
        },
      });
    }

    return {
      archivedCount: validIds.length,
      archivedIds: validIds,
    };
  }

  /**
   * Reassigns an album for a group of media items.
   */
  static async bulkAssignAlbum(input: BulkAlbumAssignInput) {
    const { organisationId, eventId, albumId, mediaIds, userId } = input;

    if (!mediaIds || mediaIds.length === 0) {
      throw new BadRequestError('At least one media ID is required.');
    }

    const userRole = await this.getVerifiedRole(userId, organisationId);
    const canAssign = checkRolePermission(userRole, PERMISSIONS.MEDIA_ALBUM_ASSIGN);
    if (!canAssign) {
      throw new ForbiddenError('You do not have permission to reassign albums.');
    }

    if (albumId) {
      const album = await prisma.album.findUnique({
        where: { id: albumId },
        select: { id: true, eventId: true, organisationId: true },
      });

      if (!album) {
        throw new NotFoundError('Target album not found.');
      }
      assertTenantOwnership(album.organisationId, organisationId, 'Album');
      if (album.eventId !== eventId) {
        throw new BadRequestError('Album does not belong to the selected event.');
      }
    }

    const items = await prisma.mediaItem.findMany({
      where: {
        id: { in: mediaIds },
        organisationId,
        eventId,
      },
      select: { id: true },
    });

    const validIds = items.map((i) => i.id);

    if (validIds.length > 0) {
      await prisma.mediaItem.updateMany({
        where: { id: { in: validIds } },
        data: { albumId: albumId || null },
      });

      await prisma.auditLog.create({
        data: {
          organisationId,
          actorUserId: userId,
          action: 'MEDIA_ALBUM_REASSIGNED',
          resourceType: 'MEDIA_ITEM',
          metadata: {
            mediaCount: validIds.length,
            targetAlbumId: albumId,
            eventId,
          },
        },
      });
    }

    return {
      assignedCount: validIds.length,
      mediaIds: validIds,
      albumId,
    };
  }

  /**
   * Retries background processing for failed media items.
   */
  static async bulkRetryProcessing(organisationId: string, mediaIds: string[], userId: string) {
    const userRole = await this.getVerifiedRole(userId, organisationId);
    const canRetry = checkRolePermission(userRole, PERMISSIONS.MEDIA_PROCESSING_RETRY);
    if (!canRetry) {
      throw new ForbiddenError('You do not have permission to retry media processing.');
    }

    const items = await prisma.mediaItem.findMany({
      where: {
        id: { in: mediaIds },
        organisationId,
        status: MediaStatus.FAILED,
      },
    });

    let enqueued = 0;
    try {
      const { enqueueMediaProcessingJob } = await import('@/server/queue/media-queue');
      for (const item of items) {
        if (!item.originalStorageKey) continue;

        await prisma.mediaItem.update({
          where: { id: item.id },
          data: {
            status: MediaStatus.PROCESSING,
            processingProgress: 0,
            processingError: null,
            processingStartedAt: new Date(),
          },
        });

        await enqueueMediaProcessingJob({
          mediaItemId: item.id,
          organisationId: item.organisationId,
          eventId: item.eventId,
          albumId: item.albumId,
          userId: item.uploaderId,
          mediaType: item.mediaType,
          originalStorageKey: item.originalStorageKey,
          mimeType: item.mimeType,
          fileName: item.originalFileName,
          uploadType: item.uploadType,
          processingVersion: env.MEDIA_PROCESSING_VERSION,
        });

        enqueued++;
      }
    } catch (err) {
      console.warn('[OfficialMediaService] Failed to enqueue processing jobs:', err);
    }

    return {
      totalFound: items.length,
      enqueuedCount: enqueued,
    };
  }
}
