import { prisma } from '@/server/db/prisma';
import { getStorageProvider } from '@/server/storage';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '@/lib/errors';
import { canCreateMediaMetadata } from '@/server/permissions/event-guards';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { buildOriginalMediaStorageKey } from '@/server/media/storage-keys';
import { env } from '@/config/env';
import {
  MediaType,
  MediaStatus,
  MediaVisibility,
  ApprovalStatus,
  UploadStatus,
  UploadType,
  VariantType,
} from '@prisma/client';
import crypto from 'crypto';

// Supported MIME types and extensions
export const ALLOWED_MIME_TYPES: Record<string, { mediaType: MediaType; extensions: string[] }> = {
  'image/jpeg': { mediaType: MediaType.IMAGE, extensions: ['.jpg', '.jpeg'] },
  'image/png': { mediaType: MediaType.IMAGE, extensions: ['.png'] },
  'image/webp': { mediaType: MediaType.IMAGE, extensions: ['.webp'] },
  'image/heic': { mediaType: MediaType.IMAGE, extensions: ['.heic'] },
  'image/heif': { mediaType: MediaType.IMAGE, extensions: ['.heif'] },
  'video/mp4': { mediaType: MediaType.VIDEO, extensions: ['.mp4'] },
  'video/quicktime': { mediaType: MediaType.VIDEO, extensions: ['.mov'] },
  'video/webm': { mediaType: MediaType.VIDEO, extensions: ['.webm'] },
};

export interface CreateUploadSessionInput {
  organisationId: string;
  eventId: string;
  albumId?: string | null;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  visibility?: MediaVisibility;
  requestedVisibility?: MediaVisibility;
  faceSearchRequested?: boolean;
  forceMultipart?: boolean;
}

export interface PartUploadUrlInfo {
  partNumber: number;
  uploadUrl: string;
}

export interface UploadSessionResponse {
  uploadSessionId: string;
  mediaItemId: string;
  uploadType: UploadType;
  storageKey: string;
  isMultipart: boolean;
  uploadUrl?: string; // For single PUT
  uploadId?: string; // For multipart
  chunkSize?: number;
  partsCount?: number;
  parts?: PartUploadUrlInfo[];
  expiresAt: Date;
}

export interface CompleteUploadInput {
  uploadSessionId: string;
  userId: string;
  parts?: { partNumber: number; etag: string }[];
}

/**
 * Validates file MIME type, extension match, and size limits.
 */
export function validateUploadFile(fileName: string, mimeType: string, fileSize: number) {
  if (!fileName || fileName.trim().length === 0) {
    throw new BadRequestError('File name is required.');
  }

  if (fileSize <= 0) {
    throw new BadRequestError('File size must be greater than 0 bytes.');
  }

  const normalizedMime = mimeType.toLowerCase().trim();
  const config = ALLOWED_MIME_TYPES[normalizedMime];

  if (!config) {
    throw new BadRequestError(
      `Unsupported file type '${mimeType}'. Supported formats: JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM.`
    );
  }

  // Verify extension matches MIME
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  if (!config.extensions.includes(ext)) {
    throw new BadRequestError(
      `File extension '${ext}' does not match declared MIME type '${mimeType}'.`
    );
  }

  // Verify size limits
  if (config.mediaType === MediaType.IMAGE && fileSize > env.MAX_IMAGE_UPLOAD_BYTES) {
    throw new BadRequestError(
      `Image file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of ${(env.MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB.`
    );
  }

  if (config.mediaType === MediaType.VIDEO && fileSize > env.MAX_VIDEO_UPLOAD_BYTES) {
    throw new BadRequestError(
      `Video file size (${(fileSize / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of ${(env.MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)).toFixed(0)}MB.`
    );
  }

  return config.mediaType;
}

/**
 * Creates an upload session, reserves storage quota, and generates signed direct upload URLs.
 */
export async function createUploadSession(
  input: CreateUploadSessionInput
): Promise<UploadSessionResponse> {
  const mediaType = validateUploadFile(input.fileName, input.mimeType, input.fileSize);

  // 1. Verify User and Organisation Access
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  let userRole: RoleType = ROLES.USER;
  if (user.isPlatformAdmin) {
    userRole = ROLES.PLATFORM_ADMIN;
  } else {
    const member = await prisma.organisationMember.findUnique({
      where: {
        unique_organisation_user: {
          organisationId: input.organisationId,
          userId: input.userId,
        },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenError('You are not an active member of this organisation.');
    }
    userRole = member.role as RoleType;
  }

  // 2. Verify Event and Album Scope
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: {
      id: true,
      organisationId: true,
      allowUserUploads: true,
      faceSearchEnabled: true,
      status: true,
    },
  });

  if (!event) {
    throw new NotFoundError('Event not found.');
  }

  assertTenantOwnership(event.organisationId, input.organisationId, 'Event');

  const org = await prisma.organisation.findUnique({
    where: { id: input.organisationId },
    select: {
      id: true,
      allowUserUploads: true,
      requireUserUploadApproval: true,
      allowUserVideoUploads: true,
      allowUserPhotoUploads: true,
      autoPublishUserUploads: true,
      maxUserImageSize: true,
      maxUserVideoSize: true,
      maxUserUploadsPerDay: true,
      autoPublishOfficialMedia: true,
    },
  });

  if (!org) {
    throw new NotFoundError('Organisation not found.');
  }

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

  // 3. Determine upload type & approval status based on role
  const staffRoles: RoleType[] = [
    ROLES.PLATFORM_ADMIN,
    ROLES.ORGANISATION_OWNER,
    ROLES.ORGANISATION_ADMIN,
    ROLES.SOCIAL_MEDIA_MANAGER,
    ROLES.SOCIAL_MEDIA_MEMBER,
  ];
  const isStaff = staffRoles.includes(userRole);

  if (!isStaff) {
    if (!org.allowUserUploads) {
      throw new ForbiddenError('User submissions are disabled for this organisation.');
    }
    if (!event.allowUserUploads) {
      throw new ForbiddenError('User uploads are disabled for this event.');
    }
    if (mediaType === MediaType.VIDEO && !org.allowUserVideoUploads) {
      throw new ForbiddenError('Video uploads by members are disabled in this organisation.');
    }
    if (mediaType === MediaType.IMAGE && !org.allowUserPhotoUploads) {
      throw new ForbiddenError('Photo uploads by members are disabled in this organisation.');
    }
    if (mediaType === MediaType.IMAGE && BigInt(input.fileSize) > org.maxUserImageSize) {
      throw new BadRequestError(
        `File size exceeds organisation limit of ${(Number(org.maxUserImageSize) / (1024 * 1024)).toFixed(0)}MB for user photos.`
      );
    }
    if (mediaType === MediaType.VIDEO && BigInt(input.fileSize) > org.maxUserVideoSize) {
      throw new BadRequestError(
        `File size exceeds organisation limit of ${(Number(org.maxUserVideoSize) / (1024 * 1024)).toFixed(0)}MB for user videos.`
      );
    }

    // Daily rate limit check
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayUploadsCount = await prisma.mediaItem.count({
      where: {
        organisationId: input.organisationId,
        uploaderId: input.userId,
        createdAt: { gte: oneDayAgo },
      },
    });

    if (todayUploadsCount >= org.maxUserUploadsPerDay) {
      throw new AppError(
        `Daily upload limit of ${org.maxUserUploadsPerDay} uploads reached for this organisation.`,
        429,
        'TOO_MANY_REQUESTS'
      );
    }
  }

  const uploadType = isStaff ? UploadType.OFFICIAL : UploadType.USER_SUBMISSION;
  const approvalStatus = isStaff
    ? ApprovalStatus.NOT_REQUIRED
    : org.requireUserUploadApproval
    ? ApprovalStatus.PENDING
    : ApprovalStatus.APPROVED;
  const isPublished = isStaff
    ? org.autoPublishOfficialMedia
    : !org.requireUserUploadApproval && org.autoPublishUserUploads;
  const requestedVisibility = input.requestedVisibility || input.visibility || MediaVisibility.ORGANISATION;
  const faceSearchRequested = !isStaff && !!input.faceSearchRequested;
  const visibility = isStaff ? (input.visibility || MediaVisibility.ORGANISATION) : MediaVisibility.ORGANISATION;

  const mediaId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const storageKey = buildOriginalMediaStorageKey(input.organisationId, input.eventId, mediaId);
  const expiresAt = new Date(Date.now() + env.S3_UPLOAD_URL_EXPIRES_SECONDS * 1000);

  // 4. Decide single PUT vs multipart
  const chunkSize = env.MULTIPART_CHUNK_SIZE_BYTES;
  const isMultipart = input.forceMultipart || input.fileSize >= chunkSize;
  const partsCount = isMultipart ? Math.ceil(input.fileSize / chunkSize) : 1;

  const storage = getStorageProvider();

  // 5. Atomic Storage Quota Reservation & Record Creation
  await prisma.$transaction(async (tx) => {
    // Upsert organisation quota record if not present
    let quota = await tx.organisationQuota.findUnique({
      where: { organisationId: input.organisationId },
    });

    if (!quota) {
      quota = await tx.organisationQuota.create({
        data: {
          organisationId: input.organisationId,
          storageLimitBytes: BigInt(53687091200), // 50 GB
          storageUsedBytes: BigInt(0),
          storageReservedBytes: BigInt(0),
        },
      });
    }

    const availableSpace =
      quota.storageLimitBytes - (quota.storageUsedBytes + quota.storageReservedBytes);

    if (BigInt(input.fileSize) > availableSpace) {
      throw new AppError(
        'Organisation storage quota exceeded. Please upgrade your storage limit.',
        413,
        'BAD_REQUEST',
        {
          availableBytes: Number(availableSpace),
          requestedBytes: input.fileSize,
        }
      );
    }

    // Reserve the quota
    await tx.organisationQuota.update({
      where: { organisationId: input.organisationId },
      data: {
        storageReservedBytes: { increment: BigInt(input.fileSize) },
      },
    });

    // Create MediaItem in UPLOADING state
    await tx.mediaItem.create({
      data: {
        id: mediaId,
        organisationId: input.organisationId,
        eventId: input.eventId,
        albumId: input.albumId || null,
        uploaderId: input.userId,
        uploadType,
        mediaType,
        status: MediaStatus.UPLOADING,
        visibility,
        requestedVisibility,
        approvalStatus,
        isPublished,
        faceSearchEnabled: event.faceSearchEnabled,
        faceSearchRequested,
        originalStorageKey: storageKey,
        originalFileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: BigInt(input.fileSize),
      },
    });

    // Create UploadSession
    await tx.uploadSession.create({
      data: {
        id: sessionId,
        organisationId: input.organisationId,
        eventId: input.eventId,
        albumId: input.albumId || null,
        mediaItemId: mediaId,
        userId: input.userId,
        uploadType,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: BigInt(input.fileSize),
        storageKey,
        isMultipart,
        partsCount: isMultipart ? partsCount : null,
        status: UploadStatus.CREATED,
        expiresAt,
      },
    });

    // Log audit trail
    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'UPLOAD_SESSION_CREATED',
        resourceType: 'UPLOAD_SESSION',
        resourceId: sessionId,
        metadata: {
          mediaItemId: mediaId,
          fileName: input.fileName,
          fileSize: input.fileSize,
          isMultipart,
          partsCount,
        },
      },
    });
  });

  // 6. Generate signed upload URLs via StorageProvider
  if (!isMultipart) {
    const uploadUrl = await storage.createUploadUrl(
      storageKey,
      input.mimeType,
      env.S3_UPLOAD_URL_EXPIRES_SECONDS
    );

    return {
      uploadSessionId: sessionId,
      mediaItemId: mediaId,
      uploadType,
      storageKey,
      isMultipart: false,
      uploadUrl,
      expiresAt,
    };
  }

  // Multipart initialisation
  const multipartInit = await storage.createMultipartUpload(storageKey, input.mimeType);

  // Update session with S3 UploadId
  await prisma.uploadSession.update({
    where: { id: sessionId },
    data: {
      uploadId: multipartInit.uploadId,
    },
  });

  // Generate part URLs for all parts
  const partPromises: Promise<PartUploadUrlInfo>[] = [];
  for (let partNumber = 1; partNumber <= partsCount; partNumber++) {
    partPromises.push(
      storage
        .createPartUploadUrl(
          storageKey,
          multipartInit.uploadId,
          partNumber,
          env.S3_UPLOAD_URL_EXPIRES_SECONDS
        )
        .then((url) => ({ partNumber, uploadUrl: url }))
    );
  }

  const parts = await Promise.all(partPromises);

  return {
    uploadSessionId: sessionId,
    mediaItemId: mediaId,
    uploadType,
    storageKey,
    isMultipart: true,
    uploadId: multipartInit.uploadId,
    chunkSize,
    partsCount,
    parts,
    expiresAt,
  };
}

/**
 * Generates fresh signed part upload URLs for multipart resumption.
 */
export async function generatePartUploadUrls(
  uploadSessionId: string,
  userId: string,
  partNumbers: number[]
) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadSessionId },
  });

  if (!session) {
    throw new NotFoundError('Upload session not found.');
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not own this upload session.');
  }

  if (session.status !== UploadStatus.CREATED && session.status !== UploadStatus.UPLOADING) {
    throw new BadRequestError(`Cannot generate part URLs for session with status '${session.status}'.`);
  }

  if (!session.isMultipart || !session.uploadId) {
    throw new BadRequestError('Upload session is not a multipart upload.');
  }

  if (session.expiresAt < new Date()) {
    throw new BadRequestError('Upload session has expired.');
  }

  const storage = getStorageProvider();
  const partPromises = partNumbers.map(async (partNumber) => {
    if (session.partsCount && (partNumber < 1 || partNumber > session.partsCount)) {
      throw new BadRequestError(`Invalid part number ${partNumber}.`);
    }

    const uploadUrl = await storage.createPartUploadUrl(
      session.storageKey,
      session.uploadId!,
      partNumber,
      env.S3_UPLOAD_URL_EXPIRES_SECONDS
    );

    return { partNumber, uploadUrl };
  });

  return Promise.all(partPromises);
}

/**
 * Completes an upload session, verifies the object in storage, reconciles quota, and sets media to PROCESSING.
 */
export async function completeUploadSession(input: CompleteUploadInput) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: input.uploadSessionId },
    include: {
      mediaItem: true,
    },
  });

  if (!session) {
    throw new NotFoundError('Upload session not found.');
  }

  if (session.userId !== input.userId) {
    throw new ForbiddenError('You do not own this upload session.');
  }

  if (session.status === UploadStatus.COMPLETED) {
    return session;
  }

  if (session.status !== UploadStatus.CREATED && session.status !== UploadStatus.UPLOADING) {
    throw new BadRequestError(`Cannot complete upload session with status '${session.status}'.`);
  }

  if (session.expiresAt < new Date()) {
    throw new BadRequestError('Upload session has expired.');
  }

  const storage = getStorageProvider();

  // 1. Complete multipart if applicable
  if (session.isMultipart) {
    if (!input.parts || input.parts.length === 0) {
      throw new BadRequestError('Multipart upload completion requires list of uploaded parts.');
    }

    if (!session.uploadId) {
      throw new BadRequestError('Upload ID missing for multipart session.');
    }

    await storage.completeMultipartUpload(session.storageKey, session.uploadId, input.parts);
  }

  // 2. Verify object exists in storage via headObject
  const headMeta = await storage.headObject(session.storageKey);
  if (!headMeta) {
    throw new BadRequestError(
      'Uploaded object was not found in object storage. Ensure direct browser upload succeeded.'
    );
  }

  const verifiedSize = BigInt(headMeta.contentLength || Number(session.fileSize));

  // 3. Atomically finalize quota, session, and media status
  const result = await prisma.$transaction(async (tx) => {
    // Reconcile quota reservation into actual used bytes
    await tx.organisationQuota.update({
      where: { organisationId: session.organisationId },
      data: {
        storageReservedBytes: { decrement: session.fileSize },
        storageUsedBytes: { increment: verifiedSize },
      },
    });

    // Update UploadSession to COMPLETED
    const updatedSession = await tx.uploadSession.update({
      where: { id: session.id },
      data: {
        status: UploadStatus.COMPLETED,
      },
    });

    // Update MediaItem to PROCESSING (Phase 4 requirement: media goes to PROCESSING)
    await tx.mediaItem.update({
      where: { id: session.mediaItemId },
      data: {
        status: MediaStatus.PROCESSING,
        fileSize: verifiedSize,
        checksum: headMeta.etag ? headMeta.etag.replace(/"/g, '') : null,
      },
    });

    // Create ORIGINAL variant record pointing to uploaded object
    await tx.mediaVariant.create({
      data: {
        mediaItemId: session.mediaItemId,
        variantType: VariantType.ORIGINAL,
        storageKey: session.storageKey,
        mimeType: session.mimeType,
        fileSize: verifiedSize,
        status: MediaStatus.READY,
      },
    });

    // Log audit trail
    await tx.auditLog.create({
      data: {
        organisationId: session.organisationId,
        actorUserId: input.userId,
        action: 'UPLOAD_COMPLETED',
        resourceType: 'UPLOAD_SESSION',
        resourceId: session.id,
        metadata: {
          mediaItemId: session.mediaItemId,
          verifiedSize: Number(verifiedSize),
          storageKey: session.storageKey,
        },
      },
    });

    return updatedSession;
  });

  // 4. Enqueue background media processing job (Phase 5)
  try {
    const { enqueueMediaProcessingJob } = await import('@/server/queue/media-queue');
    await enqueueMediaProcessingJob({
      mediaItemId: session.mediaItemId,
      organisationId: session.organisationId,
      eventId: session.eventId,
      albumId: session.albumId,
      userId: session.userId,
      mediaType:
        session.mediaItem?.mediaType ||
        (session.mimeType.startsWith('video/') ? MediaType.VIDEO : MediaType.IMAGE),
      originalStorageKey: session.storageKey,
      mimeType: session.mimeType,
      fileName: session.fileName,
      uploadType: session.uploadType,
      processingVersion: env.MEDIA_PROCESSING_VERSION,
    });
  } catch (queueErr) {
    console.warn('[UploadService] Background processing queue failed to enqueue:', queueErr);
  }

  // 5. Send in-app notification if user submission
  if (session.uploadType === UploadType.USER_SUBMISSION) {
    try {
      const { NotificationService } = await import('@/server/notifications/service');
      const { NotificationType } = await import('@prisma/client');
      await NotificationService.send({
        userId: session.userId,
        organisationId: session.organisationId,
        type: NotificationType.MEDIA_UPLOAD_RECEIVED,
        title: 'Upload Received',
        message: `Your upload "${session.fileName}" was received and is currently being processed.`,
        resourceType: 'MEDIA_ITEM',
        resourceId: session.mediaItemId,
      });
    } catch (notifErr) {
      console.warn('[UploadService] Failed to send upload received notification:', notifErr);
    }
  }

  return result;
}

/**
 * Aborts an upload session, cleans up storage parts if multipart, and releases reserved quota.
 */
export async function abortUploadSession(uploadSessionId: string, userId: string) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadSessionId },
  });

  if (!session) {
    throw new NotFoundError('Upload session not found.');
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not have permission to abort this upload session.');
  }

  if (session.status === UploadStatus.CANCELLED || session.status === UploadStatus.FAILED) {
    return session;
  }

  if (session.status === UploadStatus.COMPLETED) {
    throw new BadRequestError('Cannot abort an already completed upload session.');
  }

  const storage = getStorageProvider();

  if (session.isMultipart && session.uploadId) {
    try {
      await storage.abortMultipartUpload(session.storageKey, session.uploadId);
    } catch (err) {
      console.warn(`Failed to abort S3 multipart upload for key ${session.storageKey}:`, err);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // Release reserved quota
    await tx.organisationQuota.update({
      where: { organisationId: session.organisationId },
      data: {
        storageReservedBytes: { decrement: session.fileSize },
      },
    });

    // Mark session as CANCELLED
    const updated = await tx.uploadSession.update({
      where: { id: session.id },
      data: {
        status: UploadStatus.CANCELLED,
      },
    });

    // Mark MediaItem as FAILED
    await tx.mediaItem.update({
      where: { id: session.mediaItemId },
      data: {
        status: MediaStatus.FAILED,
      },
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        organisationId: session.organisationId,
        actorUserId: userId,
        action: 'UPLOAD_CANCELLED',
        resourceType: 'UPLOAD_SESSION',
        resourceId: session.id,
      },
    });

    return updated;
  });

  return result;
}

/**
 * Retrieves the current status and metadata of an upload session.
 */
export async function getUploadSessionStatus(uploadSessionId: string, userId: string) {
  const session = await prisma.uploadSession.findUnique({
    where: { id: uploadSessionId },
    include: {
      mediaItem: {
        select: {
          id: true,
          status: true,
          originalFileName: true,
          fileSize: true,
        },
      },
    },
  });

  if (!session) {
    throw new NotFoundError('Upload session not found.');
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not own this upload session.');
  }

  const isExpired = session.expiresAt < new Date() && session.status !== UploadStatus.COMPLETED;

  return {
    ...session,
    isExpired,
  };
}

/**
 * Cleanup expired sessions and release dangling quota reservations.
 */
export async function cleanupExpiredUploadSessions() {
  const now = new Date();
  const expiredSessions = await prisma.uploadSession.findMany({
    where: {
      status: { in: [UploadStatus.CREATED, UploadStatus.UPLOADING] },
      expiresAt: { lt: now },
    },
    take: 100,
  });

  const storage = getStorageProvider();

  for (const session of expiredSessions) {
    if (session.isMultipart && session.uploadId) {
      try {
        await storage.abortMultipartUpload(session.storageKey, session.uploadId);
      } catch (e) {
        // Continue cleanup
      }
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.organisationQuota.update({
          where: { organisationId: session.organisationId },
          data: {
            storageReservedBytes: { decrement: session.fileSize },
          },
        });

        await tx.uploadSession.update({
          where: { id: session.id },
          data: { status: UploadStatus.EXPIRED },
        });

        await tx.mediaItem.update({
          where: { id: session.mediaItemId },
          data: { status: MediaStatus.FAILED },
        });

        await tx.auditLog.create({
          data: {
            organisationId: session.organisationId,
            action: 'UPLOAD_EXPIRED',
            resourceType: 'UPLOAD_SESSION',
            resourceId: session.id,
          },
        });
      });
    } catch (err) {
      console.error(`Failed to cleanup expired upload session ${session.id}:`, err);
    }
  }

  return expiredSessions.length;
}

/**
 * Generates a signed download URL for an authorized user.
 */
export async function getSignedMediaDownloadUrl(
  mediaId: string,
  userId?: string | null,
  hasOrgAccess = false,
  userRole?: RoleType | null
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
          allowDownloads: true,
        },
      },
    },
  });

  if (!media) {
    throw new NotFoundError('Media item not found.');
  }

  if (!media.originalStorageKey) {
    throw new NotFoundError('Storage key not found for media item.');
  }

  if (!media.event.allowDownloads && userRole !== ROLES.PLATFORM_ADMIN) {
    throw new ForbiddenError('Downloads are disabled for this event.');
  }

  const storage = getStorageProvider();
  return storage.createDownloadUrl(
    media.originalStorageKey,
    env.S3_DOWNLOAD_URL_EXPIRES_SECONDS,
    media.originalFileName
  );
}
