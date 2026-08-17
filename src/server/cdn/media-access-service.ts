import { prisma } from '@/server/db/prisma';
import { getCdnProvider } from './index';
import { MediaDeliveryType, MediaAccessResult, BatchMediaAccessItem } from './types';
import {
  canViewMedia,
  canDownloadMedia,
  canDownloadOriginal,
  MODERATOR_STAFF_ROLES,
} from '@/server/permissions/event-guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '@/lib/errors';
import { env } from '@/config/env';
import { MediaStatus, VariantType, ApprovalStatus } from '@prisma/client';

export interface GetMediaAccessInput {
  mediaId: string;
  variant?: VariantType | MediaDeliveryType;
  userId?: string | null;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
  ip?: string;
}

export interface GetBatchMediaAccessInput {
  mediaIds: string[];
  variant?: VariantType | MediaDeliveryType;
  userId?: string | null;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
  organisationId?: string;
}

export interface GetMediaDownloadInput {
  mediaId: string;
  isOriginal?: boolean;
  userId?: string | null;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
  ip?: string;
}

export class MediaAccessService {
  /**
   * Evaluates security permissions and generates a short-lived authorized CDN URL for a media variant.
   */
  static async getAuthorizedMediaAccess(
    input: GetMediaAccessInput
  ): Promise<MediaAccessResult> {
    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
      include: {
        event: {
          select: {
            id: true,
            status: true,
            visibility: true,
            organisationId: true,
            allowDownloads: true,
          },
        },
        variants: true,
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    const isStaff = input.userRole && MODERATOR_STAFF_ROLES.includes(input.userRole);
    const isUploader = !!input.userId && media.uploaderId === input.userId;

    // 1. Authorize viewing permission
    if (
      !canViewMedia(
        media,
        media.event,
        input.userRole,
        input.hasOrgAccess || false,
        input.userId
      )
    ) {
      throw new ForbiddenError('You do not have permission to view this media item.');
    }

    // 2. State Check: Processing/Failed media cannot be accessed by attendees
    if (media.status !== MediaStatus.READY && !isStaff && !isUploader) {
      throw new BadRequestError(
        `Media is currently ${media.status.toLowerCase()} and cannot be rendered yet.`
      );
    }

    // 3. Variant Resolution
    const requestedVariantStr = (input.variant || 'THUMBNAIL').toString().toUpperCase();
    const cdn = getCdnProvider();
    const expiresInSeconds = env.MEDIA_URL_EXPIRES_SECONDS;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

    let targetStorageKey: string | null = null;
    let targetVariantType: VariantType = VariantType.OPTIMIZED;
    let targetMimeType = media.mimeType;
    let targetWidth = media.width;
    let targetHeight = media.height;
    let targetFileSize = Number(media.fileSize);

    if (requestedVariantStr === 'ORIGINAL' || requestedVariantStr === 'ORIGINAL_MASTER') {
      // Check original download authorization
      const canAccessOriginal = canDownloadOriginal(
        media,
        media.event,
        input.userRole,
        input.hasOrgAccess || false,
        input.userId,
        env.ALLOW_ORIGINAL_DOWNLOAD_DEFAULT
      );

      if (!canAccessOriginal) {
        throw new ForbiddenError('Access to original master binary is restricted.');
      }

      targetStorageKey = media.originalStorageKey;
      targetVariantType = VariantType.ORIGINAL;
      targetFileSize = Number(media.originalFileSize || media.fileSize);
    } else if (requestedVariantStr === 'THUMBNAIL') {
      const thumbVariant = media.variants.find(
        (v) => v.variantType === VariantType.THUMBNAIL && v.status === MediaStatus.READY
      );
      if (thumbVariant) {
        targetStorageKey = thumbVariant.storageKey;
        targetVariantType = VariantType.THUMBNAIL;
        targetMimeType = thumbVariant.mimeType;
        targetWidth = thumbVariant.width;
        targetHeight = thumbVariant.height;
        targetFileSize = Number(thumbVariant.fileSize);
      } else {
        // Fallback to optimized or original
        const optVariant = media.variants.find(
          (v) => v.variantType === VariantType.OPTIMIZED && v.status === MediaStatus.READY
        );
        targetStorageKey = optVariant?.storageKey || media.originalStorageKey;
      }
    } else {
      // OPTIMIZED, PREVIEW, or STREAM
      const optVariant = media.variants.find(
        (v) => v.variantType === VariantType.OPTIMIZED && v.status === MediaStatus.READY
      );
      if (optVariant) {
        targetStorageKey = optVariant.storageKey;
        targetVariantType = VariantType.OPTIMIZED;
        targetMimeType = optVariant.mimeType;
        targetWidth = optVariant.width || media.width;
        targetHeight = optVariant.height || media.height;
        targetFileSize = Number(optVariant.fileSize);
      } else {
        targetStorageKey = media.originalStorageKey;
      }
    }

    if (!targetStorageKey) {
      throw new NotFoundError('Requested media binary variant storage reference was not found.');
    }

    const accessUrl = await cdn.generateMediaAccessUrl(targetStorageKey, {
      expiresInSeconds,
      deliveryType: requestedVariantStr as MediaDeliveryType,
    });

    return {
      url: accessUrl,
      variantType: targetVariantType,
      mimeType: targetMimeType,
      width: targetWidth,
      height: targetHeight,
      fileSize: targetFileSize,
      expiresAt,
    };
  }

  /**
   * Generates batch authorized CDN access URLs for up to 100 media items in gallery views.
   * Performs multi-tenant security verification per item to eliminate cross-tenant leakage.
   */
  static async getBatchMediaAccess(
    input: GetBatchMediaAccessInput
  ): Promise<BatchMediaAccessItem[]> {
    if (!input.mediaIds || input.mediaIds.length === 0) {
      return [];
    }

    // Limit to max 100 items per batch
    const limitedIds = input.mediaIds.slice(0, 100);

    const mediaList = await prisma.mediaItem.findMany({
      where: {
        id: { in: limitedIds },
      },
      include: {
        event: {
          select: {
            id: true,
            status: true,
            visibility: true,
            organisationId: true,
            allowDownloads: true,
          },
        },
        variants: true,
      },
    });

    const mediaMap = new Map(mediaList.map((m) => [m.id, m]));
    const cdn = getCdnProvider();
    const results: BatchMediaAccessItem[] = [];

    for (const mediaId of limitedIds) {
      const media = mediaMap.get(mediaId);

      if (!media) {
        results.push({
          mediaItemId: mediaId,
          status: 'NOT_FOUND',
          error: 'Media item not found.',
        });
        continue;
      }

      // Enforce organisation tenant match if scoped
      if (input.organisationId && media.organisationId !== input.organisationId) {
        results.push({
          mediaItemId: mediaId,
          status: 'DENIED',
          error: 'Cross-organisation media access is forbidden.',
        });
        continue;
      }

      // Check view authorization
      const canView = canViewMedia(
        media,
        media.event,
        input.userRole,
        input.hasOrgAccess || false,
        input.userId
      );

      if (!canView) {
        results.push({
          mediaItemId: mediaId,
          status: 'DENIED',
          error: 'Access denied.',
        });
        continue;
      }

      const isStaff = input.userRole && MODERATOR_STAFF_ROLES.includes(input.userRole);
      const isUploader = !!input.userId && media.uploaderId === input.userId;

      if (media.status !== MediaStatus.READY && !isStaff && !isUploader) {
        results.push({
          mediaItemId: mediaId,
          status: media.status,
          error: `Media is ${media.status.toLowerCase()}.`,
        });
        continue;
      }

      // Resolve thumbnail variant
      const thumbVariant = media.variants.find(
        (v) => v.variantType === VariantType.THUMBNAIL && v.status === MediaStatus.READY
      );
      const optVariant = media.variants.find(
        (v) => v.variantType === VariantType.OPTIMIZED && v.status === MediaStatus.READY
      );

      const targetKey =
        thumbVariant?.storageKey || optVariant?.storageKey || media.originalStorageKey;

      if (!targetKey) {
        results.push({
          mediaItemId: mediaId,
          status: 'UNAVAILABLE',
          error: 'Storage key missing.',
        });
        continue;
      }

      const accessUrl = await cdn.generateMediaAccessUrl(targetKey, {
        expiresInSeconds: env.MEDIA_URL_EXPIRES_SECONDS,
        deliveryType: 'THUMBNAIL',
      });

      results.push({
        mediaItemId: media.id,
        url: accessUrl,
        thumbnailUrl: accessUrl,
        width: thumbVariant?.width || media.width,
        height: thumbVariant?.height || media.height,
        mimeType: thumbVariant?.mimeType || 'image/webp',
        status: 'AUTHORIZED',
      });
    }

    return results;
  }

  /**
   * Evaluates download permissions, logs an audit record, and produces a short-lived download URL.
   */
  static async getAuthorizedMediaDownload(
    input: GetMediaDownloadInput
  ): Promise<{ downloadUrl: string; filename: string; fileSize: number; mimeType: string }> {
    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
      include: {
        organisation: {
          select: {
            id: true,
            allowOriginalDownloads: true,
            allowVideoDownloads: true,
            allowPhotoDownloads: true,
            allowBulkDownloads: true,
          },
        },
        event: {
          select: {
            id: true,
            status: true,
            visibility: true,
            organisationId: true,
            allowDownloads: true,
            allowOriginalDownloads: true,
            allowBulkDownloads: true,
          },
        },
        variants: true,
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    const orgPolicy = media.organisation
      ? {
          allowOriginalDownloads: media.organisation.allowOriginalDownloads,
          allowVideoDownloads: media.organisation.allowVideoDownloads,
          allowPhotoDownloads: media.organisation.allowPhotoDownloads,
          allowBulkDownloads: media.organisation.allowBulkDownloads,
        }
      : undefined;

    // 1. Check general download permission
    const canDownload = canDownloadMedia(
      media,
      media.event,
      input.userRole,
      input.hasOrgAccess || false,
      input.userId,
      orgPolicy
    );

    if (!canDownload) {
      if (input.userId) {
        await prisma.auditLog.create({
          data: {
            organisationId: media.organisationId,
            actorUserId: input.userId,
            action: 'DOWNLOAD_DENIED',
            resourceType: 'MEDIA_ITEM',
            resourceId: media.id,
            metadata: { reason: 'DOWNLOAD_POLICY_RESTRICTED' },
          },
        });
      }
      throw new ForbiddenError('Downloads are disabled for this event or user role.');
    }

    // 2. Check original download permission if requested
    const isOriginal = !!input.isOriginal;
    if (isOriginal) {
      const canAccessOriginal = canDownloadOriginal(
        media,
        media.event,
        input.userRole,
        input.hasOrgAccess || false,
        input.userId,
        env.ALLOW_ORIGINAL_DOWNLOAD_DEFAULT,
        orgPolicy
      );

      if (!canAccessOriginal) {
        if (input.userId) {
          await prisma.auditLog.create({
            data: {
              organisationId: media.organisationId,
              actorUserId: input.userId,
              action: 'DOWNLOAD_DENIED',
              resourceType: 'MEDIA_ITEM',
              resourceId: media.id,
              metadata: { reason: 'ORIGINAL_DOWNLOAD_RESTRICTED' },
            },
          });
        }
        throw new ForbiddenError('Original master download is restricted for this media item.');
      }
    }

    // 3. Resolve storage key, filename, and size
    let targetKey: string | null = null;
    let filename = media.originalFileName;
    let fileSize = Number(media.fileSize);
    let mimeType = media.mimeType;

    if (isOriginal) {
      targetKey = media.originalStorageKey;
      fileSize = Number(media.originalFileSize || media.fileSize);
    } else {
      const preferredTypes: VariantType[] =
        media.mediaType === 'VIDEO'
          ? [
              VariantType.OPTIMIZED,
              VariantType.STREAM_1080P,
              VariantType.STREAM_720P,
              VariantType.STREAM_480P,
            ]
          : [
              VariantType.OPTIMIZED,
              VariantType.PREVIEW,
              VariantType.THUMBNAIL,
            ];

      let optVariant = null;
      for (const t of preferredTypes) {
        const found = media.variants.find(
          (v) => v.variantType === t && v.status === MediaStatus.READY
        );
        if (found) {
          optVariant = found;
          break;
        }
      }

      if (optVariant) {
        targetKey = optVariant.storageKey;
        filename = `optimized_${media.originalFileName}`;
        fileSize = Number(optVariant.fileSize);
        mimeType = optVariant.mimeType;
      } else {
        targetKey = media.originalStorageKey;
      }
    }

    if (!targetKey) {
      throw new NotFoundError('Storage key for media binary not found.');
    }

    const cdn = getCdnProvider();
    const downloadUrl = await cdn.generateDownloadUrl(targetKey, filename, {
      expiresInSeconds: env.DOWNLOAD_URL_EXPIRES_SECONDS,
      isOriginal,
    });

    // 4. Audit Log
    if (input.userId) {
      await prisma.auditLog.create({
        data: {
          organisationId: media.organisationId,
          actorUserId: input.userId,
          action: isOriginal ? 'ORIGINAL_DOWNLOAD_REQUESTED' : 'MEDIA_DOWNLOAD_REQUESTED',
          resourceType: 'MEDIA_ITEM',
          resourceId: media.id,
          metadata: {
            eventId: media.eventId,
            variant: isOriginal ? 'ORIGINAL' : 'OPTIMIZED',
            fileSize,
          },
        },
      });
    }

    return {
      downloadUrl,
      filename,
      fileSize,
      mimeType,
    };
  }
}
