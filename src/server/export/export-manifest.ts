import { prisma } from '@/server/db/prisma';
import { ExportScope, MediaStatus, ApprovalStatus, EventStatus, VariantType } from '@prisma/client';
import { RoleType, ROLES } from '@/server/permissions/roles';
import {
  canViewEvent,
  canViewMedia,
  canDownloadMedia,
  canDownloadOriginal,
  canBulkDownload,
  MODERATOR_STAFF_ROLES,
} from '@/server/permissions/event-guards';
import { env } from '@/config/env';
import { sanitizeZipEntryPath } from './zip-stream';

export interface ExportManifestEntry {
  mediaItemId: string;
  storageKey: string;
  archivePath: string;
  fileSize: number;
  mimeType: string;
  originalFileName: string;
  variantType: string;
  createdAt: string;
}

export interface BuildExportManifestInput {
  organisationId: string;
  userId: string;
  userRole?: RoleType | null;
  hasOrgAccess?: boolean;
  scopeType: ExportScope;
  eventId?: string | null;
  albumId?: string | null;
  mediaIds?: string[] | null;
  requestedVariant?: 'ORIGINAL' | 'OPTIMIZED';
}

export interface ExportManifestResult {
  scopeType: ExportScope;
  requestedVariant: 'ORIGINAL' | 'OPTIMIZED';
  entries: ExportManifestEntry[];
  totalFiles: number;
  totalBytes: bigint;
  skippedFiles: number;
  skipReasons?: Record<string, number>;
}

/**
 * Builds an immutable, authorized snapshot manifest of media items to be included in a bulk export archive.
 * Enforces strict multi-tenant isolation, event/album privacy policies, download permissions,
 * and eliminates sensitive or unapproved items.
 */
export async function buildExportManifest(
  input: BuildExportManifestInput
): Promise<ExportManifestResult> {
  const {
    organisationId,
    userId,
    userRole,
    hasOrgAccess = false,
    scopeType,
    eventId,
    albumId,
    mediaIds,
    requestedVariant = 'OPTIMIZED',
  } = input;

  // 1. Fetch Organisation details and download policies
  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      name: true,
      status: true,
      allowOriginalDownloads: true,
      allowVideoDownloads: true,
      allowPhotoDownloads: true,
      allowBulkDownloads: true,
    },
  });

  if (!organisation || organisation.status === 'SUSPENDED') {
    throw new Error('Organisation not found or inactive.');
  }

  const isStaff = !!(userRole && MODERATOR_STAFF_ROLES.includes(userRole));
  const isPlatformAdmin = userRole === ROLES.PLATFORM_ADMIN;

  // 2. Query target media items strictly scoped to this organisation
  const whereClause: any = {
    organisationId,
    status: MediaStatus.READY,
  };

  if (scopeType === ExportScope.SELECTED_MEDIA) {
    if (!mediaIds || mediaIds.length === 0) {
      throw new Error('No media IDs provided for selected media export.');
    }
    whereClause.id = { in: mediaIds };
  } else if (scopeType === ExportScope.ALBUM) {
    if (!albumId) {
      throw new Error('Album ID is required for album export.');
    }
    whereClause.albumId = albumId;
  } else if (scopeType === ExportScope.EVENT) {
    if (!eventId) {
      throw new Error('Event ID is required for event export.');
    }
    whereClause.eventId = eventId;
  } else if (scopeType === ExportScope.ORGANISATION) {
    // Org-wide exports require administrative privileges
    if (!isStaff && !isPlatformAdmin) {
      throw new Error('Organisation-wide bulk export requires administrator privileges.');
    }
  }

  // Non-staff users must only see approved & published media
  if (!isStaff && !isPlatformAdmin) {
    whereClause.approvalStatus = ApprovalStatus.APPROVED;
    whereClause.isPublished = true;
  }

  const mediaItems = await prisma.mediaItem.findMany({
    where: whereClause,
    include: {
      event: {
        select: {
          id: true,
          name: true,
          status: true,
          visibility: true,
          allowDownloads: true,
          allowOriginalDownloads: true,
          allowBulkDownloads: true,
          organisationId: true,
        },
      },
      album: {
        select: {
          id: true,
          name: true,
          status: true,
          visibility: true,
        },
      },
      variants: {
        where: {
          status: MediaStatus.READY,
        },
        select: {
          id: true,
          variantType: true,
          storageKey: true,
          mimeType: true,
          fileSize: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
    take: env.MAX_EXPORT_FILE_COUNT + 10,
  });

  const entries: ExportManifestEntry[] = [];
  let totalBytes = BigInt(0);
  let skippedFiles = 0;
  const skipReasons: Record<string, number> = {};

  const recordSkip = (reason: string) => {
    skippedFiles++;
    skipReasons[reason] = (skipReasons[reason] || 0) + 1;
  };

  for (const item of mediaItems) {
    // 1. Verify Event Level Permissions
    const eventContext = {
      status: item.event.status,
      visibility: item.event.visibility,
      organisationId: item.event.organisationId,
      allowDownloads: item.event.allowDownloads,
      allowOriginalDownloads: item.event.allowOriginalDownloads,
      allowBulkDownloads: item.event.allowBulkDownloads,
    };

    const mediaContext = {
      status: item.status,
      visibility: item.visibility,
      approvalStatus: item.approvalStatus,
      isPublished: item.isPublished,
      uploaderId: item.uploaderId,
      mediaType: item.mediaType,
    };

    const orgDownloadContext = {
      allowOriginalDownloads: organisation.allowOriginalDownloads,
      allowVideoDownloads: organisation.allowVideoDownloads,
      allowPhotoDownloads: organisation.allowPhotoDownloads,
      allowBulkDownloads: organisation.allowBulkDownloads,
    };

    // Check Bulk Download Permission
    if (!canBulkDownload(eventContext, userRole, hasOrgAccess, orgDownloadContext)) {
      recordSkip('BULK_DOWNLOAD_DISALLOWED');
      continue;
    }

    // Check Media Download Permission
    if (
      !canDownloadMedia(
        mediaContext,
        eventContext,
        userRole,
        hasOrgAccess,
        userId,
        orgDownloadContext
      )
    ) {
      recordSkip('DOWNLOAD_PERMISSION_DENIED');
      continue;
    }

    // 2. Resolve Target Variant
    let targetKey: string | null = null;
    let targetSize = BigInt(0);
    let targetMime = item.mimeType;
    let targetVariantName = 'ORIGINAL';

    const wantsOriginal = requestedVariant === 'ORIGINAL';
    const canGetOriginal = canDownloadOriginal(
      mediaContext,
      eventContext,
      userRole,
      hasOrgAccess,
      userId,
      false,
      orgDownloadContext
    );

    if (wantsOriginal && canGetOriginal && item.originalStorageKey) {
      targetKey = item.originalStorageKey;
      targetSize = item.originalFileSize || item.fileSize;
      targetVariantName = 'ORIGINAL';
    } else {
      // Find highest quality optimized variant
      const preferredTypes: VariantType[] =
        item.mediaType === 'VIDEO'
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

      let selectedVariant = null;
      for (const type of preferredTypes) {
        const found = item.variants.find((v) => v.variantType === type);
        if (found) {
          selectedVariant = found;
          break;
        }
      }

      if (selectedVariant) {
        targetKey = selectedVariant.storageKey;
        targetSize = selectedVariant.fileSize;
        targetMime = selectedVariant.mimeType;
        targetVariantName = selectedVariant.variantType;
      } else if (item.originalStorageKey && canGetOriginal) {
        // Fallback to original if no processed variant exists and authorized
        targetKey = item.originalStorageKey;
        targetSize = item.originalFileSize || item.fileSize;
        targetVariantName = 'ORIGINAL';
      } else {
        recordSkip('NO_AUTHORIZED_VARIANT');
        continue;
      }
    }

    if (!targetKey) {
      recordSkip('MISSING_STORAGE_KEY');
      continue;
    }

    // 3. Construct Safe Archive Path
    const eventFolderName = sanitizeZipEntryPath(item.event.name || 'Event');
    const albumFolderName = item.album?.name
      ? sanitizeZipEntryPath(item.album.name)
      : 'General';
    const safeFilename = sanitizeZipEntryPath(item.originalFileName || `${item.id}.jpg`);

    let archivePath: string;
    if (scopeType === ExportScope.ALBUM) {
      archivePath = `${albumFolderName}/${safeFilename}`;
    } else if (scopeType === ExportScope.EVENT) {
      archivePath = `${eventFolderName}/${albumFolderName}/${safeFilename}`;
    } else if (scopeType === ExportScope.ORGANISATION) {
      archivePath = `${eventFolderName}/${albumFolderName}/${safeFilename}`;
    } else {
      // Selected Media
      archivePath = `${eventFolderName}/${albumFolderName}/${safeFilename}`;
    }

    entries.push({
      mediaItemId: item.id,
      storageKey: targetKey,
      archivePath,
      fileSize: Number(targetSize),
      mimeType: targetMime,
      originalFileName: item.originalFileName,
      variantType: targetVariantName,
      createdAt: item.createdAt.toISOString(),
    });

    totalBytes += targetSize;

    // Guard against massive oversized exports exceeding system maximums
    if (entries.length >= env.MAX_EXPORT_FILE_COUNT) {
      break;
    }
  }

  if (entries.length === 0) {
    throw new Error(
      `No downloadable media items found for the requested export scope. (Skipped: ${skippedFiles})`
    );
  }

  if (totalBytes > BigInt(env.MAX_EXPORT_SIZE_BYTES)) {
    throw new Error(
      `Requested export exceeds maximum allowed size of ${(env.MAX_EXPORT_SIZE_BYTES / (1024 * 1024 * 1024)).toFixed(1)} GB.`
    );
  }

  return {
    scopeType,
    requestedVariant,
    entries,
    totalFiles: entries.length,
    totalBytes,
    skippedFiles,
    skipReasons,
  };
}
