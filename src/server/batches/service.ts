import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} from '@/lib/errors';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { checkRolePermission, PERMISSIONS } from '@/server/permissions/permissions';
import { assertTenantOwnership } from '@/server/permissions/guards';
import {
  validateUploadFile,
  createUploadSession,
  completeUploadSession,
  abortUploadSession,
} from '@/server/uploads/service';
import { env } from '@/config/env';
import {
  UploadBatchStatus,
  UploadBatchItemStatus,
  UploadType,
  MediaStatus,
  ApprovalStatus,
  MediaVisibility,
  UploadStatus,
  Prisma,
} from '@prisma/client';

export interface BatchFileInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum?: string | null;
}

export interface CreateBatchInput {
  organisationId: string;
  eventId: string;
  albumId?: string | null;
  userId: string;
  uploadType?: UploadType;
  visibility?: MediaVisibility;
  files: BatchFileInput[];
}

export interface ListBatchesOptions {
  organisationId: string;
  eventId?: string;
  status?: UploadBatchStatus;
  createdBy?: string;
  cursor?: string;
  limit?: number;
}

export interface BatchItemsQueryOptions {
  batchId: string;
  status?: UploadBatchItemStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export class BatchService {
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
   * Creates a new bulk upload batch and initializes batch items.
   */
  static async createBatch(input: CreateBatchInput) {
    const { organisationId, eventId, albumId, userId, files } = input;

    if (!files || files.length === 0) {
      throw new BadRequestError('At least one file is required to create a batch.');
    }

    if (files.length > env.MAX_FILES_PER_BATCH) {
      throw new BadRequestError(
        `Batch exceeds maximum allowed file count of ${env.MAX_FILES_PER_BATCH} files.`
      );
    }

    const userRole = await this.getVerifiedRole(userId, organisationId);

    // Permission check: creating official batch requires media:batch_create / media:upload_official
    const staffRoles: string[] = [
      ROLES.PLATFORM_ADMIN,
      ROLES.ORGANISATION_OWNER,
      ROLES.ORGANISATION_ADMIN,
      ROLES.SOCIAL_MEDIA_MANAGER,
      ROLES.SOCIAL_MEDIA_MEMBER,
    ];
    const isStaff = staffRoles.includes(userRole);

    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: {
        id: true,
        allowUserUploads: true,
        requireUserUploadApproval: true,
        allowUserVideoUploads: true,
        allowUserPhotoUploads: true,
        maxUserFilesPerBatch: true,
        maxUserImageSize: true,
        maxUserVideoSize: true,
        maxUserUploadsPerDay: true,
      },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    if (input.uploadType === UploadType.OFFICIAL && !isStaff) {
      throw new ForbiddenError('Only authorised Social Media Team members can upload official media.');
    }

    const requestedUploadType = isStaff ? (input.uploadType || UploadType.OFFICIAL) : UploadType.USER_SUBMISSION;

    if (!isStaff) {
      if (!org.allowUserUploads) {
        throw new ForbiddenError('User submissions are disabled for this organisation.');
      }
      if (files.length > org.maxUserFilesPerBatch) {
        throw new BadRequestError(
          `Batch exceeds maximum allowed file count of ${org.maxUserFilesPerBatch} files for community submissions.`
        );
      }
    }

    // Verify Event & Album tenancy
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        organisationId: true,
        status: true,
        allowUserUploads: true,
      },
    });

    if (!event) {
      throw new NotFoundError('Event not found.');
    }

    assertTenantOwnership(event.organisationId, organisationId, 'Event');

    if (!isStaff && !event.allowUserUploads) {
      throw new ForbiddenError('User uploads are disabled for this event.');
    }

    if (albumId) {
      const album = await prisma.album.findUnique({
        where: { id: albumId },
        select: { id: true, eventId: true, organisationId: true },
      });

      if (!album) {
        throw new NotFoundError('Album not found.');
      }
      assertTenantOwnership(album.organisationId, organisationId, 'Album');
      if (album.eventId !== eventId) {
        throw new BadRequestError('Selected album does not belong to this event.');
      }
    }

    // Pre-validate all files
    let totalBytes = BigInt(0);
    for (const file of files) {
      validateUploadFile(file.fileName, file.mimeType, file.fileSize);
      totalBytes += BigInt(file.fileSize);
    }

    // Check available storage quota (estimate without reserving everything at once)
    const quota = await prisma.organisationQuota.findUnique({
      where: { organisationId },
    });

    if (quota) {
      const available = quota.storageLimitBytes - (quota.storageUsedBytes + quota.storageReservedBytes);
      if (totalBytes > available) {
        throw new AppError(
          'Organisation storage quota insufficient for this batch.',
          413,
          'BAD_REQUEST',
          {
            availableBytes: Number(available),
            requiredBytes: Number(totalBytes),
          }
        );
      }
    }

    // Create the batch record
    const batch = await prisma.uploadBatch.create({
      data: {
        organisationId,
        eventId,
        albumId: albumId || null,
        createdBy: userId,
        uploadType: requestedUploadType,
        status: UploadBatchStatus.CREATED,
        totalFiles: files.length,
        completedFiles: 0,
        failedFiles: 0,
        cancelledFiles: 0,
        totalBytes,
        uploadedBytes: BigInt(0),
      },
    });

    // Create batch items in chunks of 100 to prevent database query bloat
    const chunkSize = 100;
    for (let i = 0; i < files.length; i += chunkSize) {
      const slice = files.slice(i, i + chunkSize);
      await prisma.uploadBatchItem.createMany({
        data: slice.map((f) => ({
          batchId: batch.id,
          fileName: f.fileName,
          fileSize: BigInt(f.fileSize),
          mimeType: f.mimeType,
          checksum: f.checksum || null,
          status: UploadBatchItemStatus.PENDING,
        })),
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        organisationId,
        actorUserId: userId,
        action: 'UPLOAD_BATCH_CREATED',
        resourceType: 'UPLOAD_BATCH',
        resourceId: batch.id,
        metadata: {
          totalFiles: files.length,
          totalBytes: Number(totalBytes),
          uploadType: requestedUploadType,
          eventId,
          albumId,
        },
      },
    });

    return batch;
  }

  /**
   * Prepares the next chunk of upload sessions for the batch (e.g. 25 files at a time).
   */
  static async prepareBatchChunk(batchId: string, userId: string, limit = env.BATCH_CHUNK_PREPARATION_SIZE) {
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundError('Upload batch not found.');
    }

    if (batch.createdBy !== userId) {
      const userRole = await this.getVerifiedRole(userId, batch.organisationId);
      const canManage = checkRolePermission(userRole, PERMISSIONS.MEDIA_BATCH_CREATE);
      if (!canManage) {
        throw new ForbiddenError('You do not have permission to manage this upload batch.');
      }
    }

    if (batch.status === UploadBatchStatus.CANCELLED || batch.status === UploadBatchStatus.COMPLETED) {
      throw new BadRequestError(`Cannot prepare sessions for batch with status '${batch.status}'.`);
    }

    // Fetch next pending items
    const pendingItems = await prisma.uploadBatchItem.findMany({
      where: {
        batchId,
        status: UploadBatchItemStatus.PENDING,
      },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingItems.length === 0) {
      return { items: [], hasMore: false };
    }

    const preparedItems = await Promise.all(
      pendingItems.map(async (item) => {
        try {
          const session = await createUploadSession({
            organisationId: batch.organisationId,
            eventId: batch.eventId,
            albumId: batch.albumId,
            userId,
            fileName: item.fileName,
            mimeType: item.mimeType,
            fileSize: Number(item.fileSize),
          });

          await prisma.uploadBatchItem.update({
            where: { id: item.id },
            data: {
              uploadSessionId: session.uploadSessionId,
              mediaItemId: session.mediaItemId,
              status: UploadBatchItemStatus.UPLOADING,
            },
          });

          return {
            batchItemId: item.id,
            fileName: item.fileName,
            fileSize: Number(item.fileSize),
            mimeType: item.mimeType,
            session,
          };
        } catch (err: any) {
          // If session creation fails (e.g., quota exceeded during run), mark item failed
          await prisma.uploadBatchItem.update({
            where: { id: item.id },
            data: {
              status: UploadBatchItemStatus.FAILED,
              errorCode: 'PREPARATION_FAILED',
              errorMessage: err.message || 'Failed to prepare upload session',
            },
          });

          await prisma.uploadBatch.update({
            where: { id: batchId },
            data: { failedFiles: { increment: 1 } },
          });

          return {
            batchItemId: item.id,
            fileName: item.fileName,
            error: err.message || 'Failed to prepare upload session',
          };
        }
      })
    );

    // Update batch status to UPLOADING if currently CREATED
    if (batch.status === UploadBatchStatus.CREATED) {
      await prisma.uploadBatch.update({
        where: { id: batchId },
        data: { status: UploadBatchStatus.UPLOADING },
      });
    }

    const remainingCount = await prisma.uploadBatchItem.count({
      where: {
        batchId,
        status: UploadBatchItemStatus.PENDING,
      },
    });

    return {
      items: preparedItems,
      hasMore: remainingCount > 0,
      remainingCount,
    };
  }

  /**
   * Completes an individual item within a batch after direct S3 upload finishes.
   */
  static async completeBatchItem(
    batchId: string,
    itemId: string,
    userId: string,
    parts?: { partNumber: number; etag: string }[]
  ) {
    const item = await prisma.uploadBatchItem.findUnique({
      where: { id: itemId },
      include: { batch: { include: { organisation: true } } },
    });

    if (!item || item.batchId !== batchId) {
      throw new NotFoundError('Batch item not found.');
    }

    if (item.status === UploadBatchItemStatus.READY || item.status === UploadBatchItemStatus.PROCESSING) {
      return item;
    }

    if (!item.uploadSessionId) {
      throw new BadRequestError('Upload session has not been initialized for this item.');
    }

    // Complete the upload session
    await completeUploadSession({
      uploadSessionId: item.uploadSessionId,
      userId,
      parts,
    });

    // Check auto-publish setting on organisation
    const autoPublish = item.batch.organisation.autoPublishOfficialMedia;
    if (autoPublish && item.mediaItemId) {
      await prisma.mediaItem.update({
        where: { id: item.mediaItemId },
        data: {
          isPublished: true,
          publishedAt: new Date(),
        },
      });
    }

    // Update item status
    const updatedItem = await prisma.uploadBatchItem.update({
      where: { id: itemId },
      data: {
        status: UploadBatchItemStatus.PROCESSING,
        errorCode: null,
        errorMessage: null,
      },
    });

    // Atomically increment batch completed files and uploaded bytes
    const updatedBatch = await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        completedFiles: { increment: 1 },
        uploadedBytes: { increment: item.fileSize },
      },
    });

    // Reconcile batch final status if all items reached terminal states
    await this.reconcileBatchCompletion(batchId);

    return updatedItem;
  }

  /**
   * Marks an individual batch item as failed.
   */
  static async failBatchItem(
    batchId: string,
    itemId: string,
    userId: string,
    errorCode = 'UPLOAD_FAILED',
    errorMessage = 'Upload failed'
  ) {
    const item = await prisma.uploadBatchItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.batchId !== batchId) {
      throw new NotFoundError('Batch item not found.');
    }

    if (item.status === UploadBatchItemStatus.FAILED) {
      return item;
    }

    // If upload session was created, attempt to abort it to release quota
    if (item.uploadSessionId) {
      try {
        await abortUploadSession(item.uploadSessionId, userId);
      } catch {
        // Continue failure handling
      }
    }

    const updatedItem = await prisma.uploadBatchItem.update({
      where: { id: itemId },
      data: {
        status: UploadBatchItemStatus.FAILED,
        errorCode,
        errorMessage,
      },
    });

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        failedFiles: { increment: 1 },
      },
    });

    await this.reconcileBatchCompletion(batchId);

    return updatedItem;
  }

  /**
   * Cancels an individual batch item.
   */
  static async cancelBatchItem(batchId: string, itemId: string, userId: string) {
    const item = await prisma.uploadBatchItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.batchId !== batchId) {
      throw new NotFoundError('Batch item not found.');
    }

    if (item.status === UploadBatchItemStatus.READY || item.status === UploadBatchItemStatus.PROCESSING) {
      throw new BadRequestError('Cannot cancel an already completed item.');
    }

    if (item.status === UploadBatchItemStatus.CANCELLED) {
      return item;
    }

    if (item.uploadSessionId) {
      try {
        await abortUploadSession(item.uploadSessionId, userId);
      } catch {
        // Ignore session abort error if already expired
      }
    }

    const updatedItem = await prisma.uploadBatchItem.update({
      where: { id: itemId },
      data: {
        status: UploadBatchItemStatus.CANCELLED,
      },
    });

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        cancelledFiles: { increment: 1 },
      },
    });

    await this.reconcileBatchCompletion(batchId);

    return updatedItem;
  }

  /**
   * Cancels remaining pending/in-flight files in a batch without deleting completed ones.
   */
  static async cancelBatch(batchId: string, userId: string) {
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundError('Upload batch not found.');
    }

    if (batch.createdBy !== userId) {
      const userRole = await this.getVerifiedRole(userId, batch.organisationId);
      const canManage = checkRolePermission(userRole, PERMISSIONS.MEDIA_BATCH_CANCEL);
      if (!canManage) {
        throw new ForbiddenError('You do not have permission to cancel this upload batch.');
      }
    }

    if (batch.status === UploadBatchStatus.COMPLETED || batch.status === UploadBatchStatus.CANCELLED) {
      return batch;
    }

    const activeItems = await prisma.uploadBatchItem.findMany({
      where: {
        batchId,
        status: { in: [UploadBatchItemStatus.PENDING, UploadBatchItemStatus.UPLOADING] },
      },
    });

    for (const item of activeItems) {
      if (item.uploadSessionId) {
        try {
          await abortUploadSession(item.uploadSessionId, userId);
        } catch {
          // Ignore
        }
      }
    }

    await prisma.uploadBatchItem.updateMany({
      where: {
        batchId,
        status: { in: [UploadBatchItemStatus.PENDING, UploadBatchItemStatus.UPLOADING] },
      },
      data: {
        status: UploadBatchItemStatus.CANCELLED,
      },
    });

    const cancelledCount = activeItems.length;

    const updatedBatch = await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        status: UploadBatchStatus.CANCELLED,
        cancelledFiles: { increment: cancelledCount },
        completedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organisationId: batch.organisationId,
        actorUserId: userId,
        action: 'UPLOAD_BATCH_CANCELLED',
        resourceType: 'UPLOAD_BATCH',
        resourceId: batchId,
        metadata: {
          cancelledCount,
          completedFiles: batch.completedFiles,
        },
      },
    });

    return updatedBatch;
  }

  /**
   * Retries an individual failed item.
   */
  static async retryBatchItem(batchId: string, itemId: string, userId: string) {
    const item = await prisma.uploadBatchItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.batchId !== batchId) {
      throw new NotFoundError('Batch item not found.');
    }

    if (item.status !== UploadBatchItemStatus.FAILED && item.status !== UploadBatchItemStatus.CANCELLED) {
      throw new BadRequestError(`Cannot retry item with status '${item.status}'.`);
    }

    const wasFailed = item.status === UploadBatchItemStatus.FAILED;

    const updatedItem = await prisma.uploadBatchItem.update({
      where: { id: itemId },
      data: {
        status: UploadBatchItemStatus.PENDING,
        uploadSessionId: null,
        mediaItemId: null,
        errorCode: null,
        errorMessage: null,
      },
    });

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        status: UploadBatchStatus.UPLOADING,
        ...(wasFailed
          ? { failedFiles: { decrement: 1 } }
          : { cancelledFiles: { decrement: 1 } }),
      },
    });

    return updatedItem;
  }

  /**
   * Retries all failed and cancelled items in a batch.
   */
  static async retryBatch(batchId: string, userId: string) {
    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      throw new NotFoundError('Upload batch not found.');
    }

    const retryableItems = await prisma.uploadBatchItem.findMany({
      where: {
        batchId,
        status: { in: [UploadBatchItemStatus.FAILED, UploadBatchItemStatus.CANCELLED] },
      },
    });

    if (retryableItems.length === 0) {
      return batch;
    }

    await prisma.uploadBatchItem.updateMany({
      where: {
        batchId,
        status: { in: [UploadBatchItemStatus.FAILED, UploadBatchItemStatus.CANCELLED] },
      },
      data: {
        status: UploadBatchItemStatus.PENDING,
        uploadSessionId: null,
        mediaItemId: null,
        errorCode: null,
        errorMessage: null,
      },
    });

    const updatedBatch = await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        status: UploadBatchStatus.UPLOADING,
        failedFiles: 0,
        cancelledFiles: 0,
        completedAt: null,
      },
    });

    return updatedBatch;
  }

  /**
   * Reconciles batch status when all items finish.
   */
  private static async reconcileBatchCompletion(batchId: string) {
    const counts = await prisma.uploadBatchItem.groupBy({
      by: ['status'],
      where: { batchId },
      _count: { status: true },
    });

    const statusMap: Record<string, number> = {};
    let total = 0;
    for (const c of counts) {
      statusMap[c.status] = c._count.status;
      total += c._count.status;
    }

    const pending = (statusMap[UploadBatchItemStatus.PENDING] || 0) + (statusMap[UploadBatchItemStatus.UPLOADING] || 0);
    const completed = (statusMap[UploadBatchItemStatus.PROCESSING] || 0) + (statusMap[UploadBatchItemStatus.READY] || 0);
    const failed = statusMap[UploadBatchItemStatus.FAILED] || 0;
    const cancelled = statusMap[UploadBatchItemStatus.CANCELLED] || 0;

    // If still in-flight, keep current status
    if (pending > 0) {
      return;
    }

    let finalStatus: UploadBatchStatus = UploadBatchStatus.COMPLETED;
    if (failed === total) {
      finalStatus = UploadBatchStatus.FAILED;
    } else if (cancelled === total) {
      finalStatus = UploadBatchStatus.CANCELLED;
    } else if (failed > 0 || cancelled > 0) {
      finalStatus = UploadBatchStatus.PARTIALLY_FAILED;
    }

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Gets details and paginated items for a single batch.
   */
  static async getBatchDetails(options: BatchItemsQueryOptions, userId: string) {
    const { batchId, status, search, page = 1, limit = 50 } = options;

    const batch = await prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: {
        event: {
          select: { id: true, name: true, slug: true },
        },
        album: {
          select: { id: true, name: true, slug: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!batch) {
      throw new NotFoundError('Upload batch not found.');
    }

    const where: Prisma.UploadBatchItemWhereInput = {
      batchId,
      ...(status ? { status } : {}),
      ...(search ? { fileName: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [totalItems, items] = await Promise.all([
      prisma.uploadBatchItem.count({ where }),
      prisma.uploadBatchItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          mediaItem: {
            select: {
              id: true,
              status: true,
              isPublished: true,
              mediaType: true,
              variants: {
                select: { id: true, variantType: true, storageKey: true, status: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      batch,
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * Lists batches for an organisation with filtering.
   */
  static async listBatches(options: ListBatchesOptions, userId: string) {
    const { organisationId, eventId, status, createdBy, cursor, limit = 20 } = options;

    await this.getVerifiedRole(userId, organisationId);

    const where: Prisma.UploadBatchWhereInput = {
      organisationId,
      ...(eventId ? { eventId } : {}),
      ...(status ? { status } : {}),
      ...(createdBy ? { createdBy } : {}),
    };

    const findArgs: Prisma.UploadBatchFindManyArgs = {
      where,
      take: limit + 1,
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: { id: true, name: true, slug: true },
        },
        album: {
          select: { id: true, name: true, slug: true },
        },
        creator: {
          select: { id: true, name: true, email: true },
        },
      },
    };

    if (cursor) {
      findArgs.cursor = { id: cursor };
      findArgs.skip = 1;
    }

    const batches = await prisma.uploadBatch.findMany(findArgs);
    const hasMore = batches.length > limit;
    const items = hasMore ? batches.slice(0, limit) : batches;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return {
      items,
      meta: {
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Checks file checksums against existing media in organisation/event context for duplicate detection.
   */
  static async checkDuplicates(
    organisationId: string,
    eventId: string,
    files: { checksum: string; fileName: string; fileSize: number }[],
    userId: string
  ) {
    await this.getVerifiedRole(userId, organisationId);

    const checksums = files.map((f) => f.checksum).filter(Boolean);
    if (checksums.length === 0) {
      return { duplicates: [] };
    }

    const existing = await prisma.mediaItem.findMany({
      where: {
        organisationId, // Tenant isolation: only query within current organisation
        eventId,
        checksum: { in: checksums },
        status: { not: MediaStatus.DELETED },
      },
      select: {
        id: true,
        checksum: true,
        originalFileName: true,
        fileSize: true,
        status: true,
        createdAt: true,
      },
    });

    const duplicates = existing.map((item) => ({
      mediaId: item.id,
      checksum: item.checksum,
      fileName: item.originalFileName,
      fileSize: Number(item.fileSize),
      status: item.status,
      uploadedAt: item.createdAt,
    }));

    return { duplicates };
  }

  /**
   * Gets aggregated statistics for the Social Media Team dashboard.
   */
  static async getMediaTeamStats(organisationId: string, userId: string) {
    await this.getVerifiedRole(userId, organisationId);

    const [
      activeBatchesCount,
      processingCount,
      readyCount,
      failedCount,
      totalMediaCount,
      quota,
      recentBatches,
    ] = await Promise.all([
      prisma.uploadBatch.count({
        where: {
          organisationId,
          status: { in: [UploadBatchStatus.CREATED, UploadBatchStatus.UPLOADING, UploadBatchStatus.VALIDATING] },
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId,
          status: { in: [MediaStatus.UPLOADING, MediaStatus.QUEUED, MediaStatus.PROCESSING] },
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId,
          status: MediaStatus.READY,
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId,
          status: MediaStatus.FAILED,
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId,
          status: { not: MediaStatus.DELETED },
        },
      }),
      prisma.organisationQuota.findUnique({
        where: { organisationId },
      }),
      prisma.uploadBatch.findMany({
        where: { organisationId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          event: { select: { name: true, slug: true } },
          creator: { select: { name: true } },
        },
      }),
    ]);

    return {
      activeBatchesCount,
      processingCount,
      readyCount,
      failedCount,
      totalMediaCount,
      storage: {
        limitBytes: Number(quota?.storageLimitBytes || 53687091200),
        usedBytes: Number(quota?.storageUsedBytes || 0),
        reservedBytes: Number(quota?.storageReservedBytes || 0),
        percentage: quota
          ? Math.min(
              100,
              Math.round((Number(quota.storageUsedBytes) / Number(quota.storageLimitBytes)) * 100)
            )
          : 0,
      },
      recentBatches,
    };
  }
}
