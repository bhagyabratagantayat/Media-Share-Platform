import { prisma } from '@/server/db/prisma';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '@/lib/errors';
import { assertTenantOwnership } from '@/server/permissions/guards';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { MODERATOR_STAFF_ROLES } from '@/server/permissions/event-guards';
import { NotificationService } from '@/server/notifications/service';
import {
  ApprovalStatus,
  MediaStatus,
  MediaVisibility,
  MediaType,
  RejectionReason,
  ModerationActionType,
  NotificationType,
} from '@prisma/client';

export interface ModerationQueueFilter {
  organisationId: string;
  actorUserId: string;
  status?: ApprovalStatus | 'ALL';
  mediaType?: MediaType;
  eventId?: string;
  uploaderId?: string;
  search?: string;
  sortBy?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}

export interface ApproveMediaInput {
  organisationId: string;
  mediaId: string;
  actorUserId: string;
  note?: string;
}

export interface RejectMediaInput {
  organisationId: string;
  mediaId: string;
  actorUserId: string;
  rejectionCode: RejectionReason;
  rejectionReason?: string;
  note?: string;
}

export interface BulkApproveInput {
  organisationId: string;
  mediaIds: string[];
  actorUserId: string;
  note?: string;
}

export interface BulkRejectInput {
  organisationId: string;
  mediaIds: string[];
  actorUserId: string;
  rejectionCode: RejectionReason;
  rejectionReason?: string;
  note?: string;
}

export interface UnpublishMediaInput {
  organisationId: string;
  mediaId: string;
  actorUserId: string;
  note?: string;
}

export interface ResubmitMediaInput {
  organisationId: string;
  mediaId: string;
  uploaderUserId: string;
  requestedVisibility?: MediaVisibility;
  faceSearchRequested?: boolean;
}

export interface UserSubmissionsFilter {
  organisationId: string;
  uploaderUserId: string;
  status?: ApprovalStatus | 'ALL';
  eventId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class ModerationService {
  /**
   * Helper to verify actor has moderation permissions within the organisation
   */
  private static async verifyModerator(organisationId: string, actorUserId: string): Promise<RoleType> {
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
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
          userId: actorUserId,
        },
      },
    });

    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenError('You are not an active member of this organisation.');
    }

    const role = member.role as RoleType;
    if (!MODERATOR_STAFF_ROLES.includes(role)) {
      throw new ForbiddenError('You do not have permission to moderate organisation media.');
    }

    return role;
  }

  /**
   * Fetches paginated moderation queue for admins/moderators
   */
  static async getModerationQueue(params: ModerationQueueFilter) {
    await this.verifyModerator(params.organisationId, params.actorUserId);

    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      organisationId: params.organisationId,
      status: { in: [MediaStatus.READY, MediaStatus.PROCESSING, MediaStatus.QUEUED] },
    };

    if (params.status && params.status !== 'ALL') {
      where.approvalStatus = params.status;
    } else if (!params.status) {
      // Default view is PENDING
      where.approvalStatus = ApprovalStatus.PENDING;
    }

    if (params.mediaType) {
      where.mediaType = params.mediaType;
    }

    if (params.eventId) {
      where.eventId = params.eventId;
    }

    if (params.uploaderId) {
      where.uploaderId = params.uploaderId;
    }

    if (params.search) {
      where.originalFileName = {
        contains: params.search,
        mode: 'insensitive',
      };
    }

    const orderBy: any = {
      createdAt: params.sortBy === 'oldest' ? 'asc' : 'desc',
    };

    const [items, totalCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.mediaItem.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
          event: {
            select: {
              id: true,
              name: true,
              slug: true,
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
            where: { status: MediaStatus.READY },
          },
        },
      }),
      prisma.mediaItem.count({ where }),
      prisma.mediaItem.count({
        where: {
          organisationId: params.organisationId,
          approvalStatus: ApprovalStatus.PENDING,
          status: { in: [MediaStatus.READY, MediaStatus.PROCESSING] },
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId: params.organisationId,
          approvalStatus: ApprovalStatus.APPROVED,
          status: MediaStatus.READY,
        },
      }),
      prisma.mediaItem.count({
        where: {
          organisationId: params.organisationId,
          approvalStatus: ApprovalStatus.REJECTED,
        },
      }),
    ]);

    return {
      items,
      counts: {
        total: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
      },
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }

  /**
   * Approves a single user submission atomically with concurrency safety
   */
  static async approveMedia(input: ApproveMediaInput) {
    await this.verifyModerator(input.organisationId, input.actorUserId);

    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
      include: {
        organisation: {
          select: { id: true, autoPublishUserUploads: true },
        },
        event: {
          select: { id: true, name: true },
        },
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    assertTenantOwnership(media.organisationId, input.organisationId, 'Media item');

    if (media.status !== MediaStatus.READY) {
      throw new BadRequestError(
        `Cannot approve media while processing status is '${media.status}'. Wait until media processing is complete.`
      );
    }

    if (media.approvalStatus === ApprovalStatus.APPROVED) {
      throw new ConflictError('This media item has already been approved.');
    }

    const shouldPublish = !!media.organisation.autoPublishUserUploads;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.mediaItem.update({
        where: {
          id: input.mediaId,
          approvalStatus: ApprovalStatus.PENDING, // Optimistic concurrency lock
        },
        data: {
          approvalStatus: ApprovalStatus.APPROVED,
          approvedBy: input.actorUserId,
          approvedAt: now,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          rejectionCode: null,
          isPublished: shouldPublish,
          publishedAt: shouldPublish ? now : null,
          visibility: media.requestedVisibility || MediaVisibility.ORGANISATION,
        },
      });

      // Log moderation action
      await tx.mediaModerationAction.create({
        data: {
          mediaItemId: input.mediaId,
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: ModerationActionType.APPROVED,
          note: input.note || null,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: 'USER_MEDIA_APPROVED',
          resourceType: 'MEDIA_ITEM',
          resourceId: input.mediaId,
          metadata: {
            eventId: media.eventId,
            uploaderId: media.uploaderId,
            autoPublished: shouldPublish,
            note: input.note,
          },
        },
      });

      return result;
    });

    // Send in-app notification to uploader
    await NotificationService.send({
      userId: media.uploaderId,
      organisationId: input.organisationId,
      type: NotificationType.MEDIA_APPROVED,
      title: 'Upload Approved',
      message: `Your upload "${media.originalFileName}" for event "${media.event.name}" has been approved.`,
      resourceType: 'MEDIA_ITEM',
      resourceId: media.id,
    });

    return updated;
  }

  /**
   * Rejects a single user submission with code and optional reason message
   */
  static async rejectMedia(input: RejectMediaInput) {
    await this.verifyModerator(input.organisationId, input.actorUserId);

    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
      include: {
        event: { select: { id: true, name: true } },
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    assertTenantOwnership(media.organisationId, input.organisationId, 'Media item');

    if (media.approvalStatus === ApprovalStatus.REJECTED) {
      throw new ConflictError('This media item has already been rejected.');
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.mediaItem.update({
        where: {
          id: input.mediaId,
          approvalStatus: ApprovalStatus.PENDING, // Optimistic concurrency lock
        },
        data: {
          approvalStatus: ApprovalStatus.REJECTED,
          rejectedBy: input.actorUserId,
          rejectedAt: now,
          rejectionCode: input.rejectionCode,
          rejectionReason: input.rejectionReason || null,
          isPublished: false,
        },
      });

      // Log moderation action
      await tx.mediaModerationAction.create({
        data: {
          mediaItemId: input.mediaId,
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: ModerationActionType.REJECTED,
          reasonCode: input.rejectionCode,
          note: input.note || input.rejectionReason || null,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: 'USER_MEDIA_REJECTED',
          resourceType: 'MEDIA_ITEM',
          resourceId: input.mediaId,
          metadata: {
            eventId: media.eventId,
            uploaderId: media.uploaderId,
            rejectionCode: input.rejectionCode,
            rejectionReason: input.rejectionReason,
            note: input.note,
          },
        },
      });

      return result;
    });

    // Send in-app notification to uploader
    const reasonText = input.rejectionReason
      ? ` Reason: ${input.rejectionReason}`
      : ` Reason: ${input.rejectionCode.replace(/_/g, ' ')}`;

    await NotificationService.send({
      userId: media.uploaderId,
      organisationId: input.organisationId,
      type: NotificationType.MEDIA_REJECTED,
      title: 'Upload Rejected',
      message: `Your upload "${media.originalFileName}" for event "${media.event.name}" was not approved.${reasonText}`,
      resourceType: 'MEDIA_ITEM',
      resourceId: media.id,
    });

    return updated;
  }

  /**
   * Bulk approves multiple pending media items
   */
  static async bulkApprove(input: BulkApproveInput) {
    await this.verifyModerator(input.organisationId, input.actorUserId);

    if (!input.mediaIds || input.mediaIds.length === 0) {
      throw new BadRequestError('No media IDs provided.');
    }

    const org = await prisma.organisation.findUnique({
      where: { id: input.organisationId },
      select: { id: true, autoPublishUserUploads: true },
    });

    const shouldPublish = !!org?.autoPublishUserUploads;
    const now = new Date();

    const mediaList = await prisma.mediaItem.findMany({
      where: {
        id: { in: input.mediaIds },
        organisationId: input.organisationId,
      },
      include: {
        event: { select: { id: true, name: true } },
      },
    });

    const approvedIds: string[] = [];
    const skippedIds: string[] = [];
    const reasons: Record<string, string> = {};

    for (const media of mediaList) {
      if (media.status !== MediaStatus.READY) {
        skippedIds.push(media.id);
        reasons[media.id] = `Media status is '${media.status}', must be READY.`;
        continue;
      }

      if (media.approvalStatus !== ApprovalStatus.PENDING) {
        skippedIds.push(media.id);
        reasons[media.id] = `Media approvalStatus is '${media.approvalStatus}', not PENDING.`;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.mediaItem.update({
            where: { id: media.id, approvalStatus: ApprovalStatus.PENDING },
            data: {
              approvalStatus: ApprovalStatus.APPROVED,
              approvedBy: input.actorUserId,
              approvedAt: now,
              isPublished: shouldPublish,
              publishedAt: shouldPublish ? now : null,
              visibility: media.requestedVisibility || MediaVisibility.ORGANISATION,
            },
          });

          await tx.mediaModerationAction.create({
            data: {
              mediaItemId: media.id,
              organisationId: input.organisationId,
              actorUserId: input.actorUserId,
              action: ModerationActionType.APPROVED,
              note: input.note || null,
            },
          });
        });

        approvedIds.push(media.id);

        // Async notify uploader
        NotificationService.send({
          userId: media.uploaderId,
          organisationId: input.organisationId,
          type: NotificationType.MEDIA_APPROVED,
          title: 'Upload Approved',
          message: `Your upload "${media.originalFileName}" has been approved.`,
          resourceType: 'MEDIA_ITEM',
          resourceId: media.id,
        }).catch(() => {});
      } catch (err) {
        skippedIds.push(media.id);
        reasons[media.id] = 'Concurrent modification error.';
      }
    }

    if (approvedIds.length > 0) {
      await prisma.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: 'BULK_MEDIA_APPROVED',
          resourceType: 'ORGANISATION',
          resourceId: input.organisationId,
          metadata: {
            approvedCount: approvedIds.length,
            skippedCount: skippedIds.length,
            approvedIds,
          },
        },
      });
    }

    return {
      approvedCount: approvedIds.length,
      skippedCount: skippedIds.length,
      approvedIds,
      skippedIds,
      reasons,
    };
  }

  /**
   * Bulk rejects multiple pending media items with code and optional reason
   */
  static async bulkReject(input: BulkRejectInput) {
    await this.verifyModerator(input.organisationId, input.actorUserId);

    if (!input.mediaIds || input.mediaIds.length === 0) {
      throw new BadRequestError('No media IDs provided.');
    }

    const now = new Date();
    const mediaList = await prisma.mediaItem.findMany({
      where: {
        id: { in: input.mediaIds },
        organisationId: input.organisationId,
      },
    });

    const rejectedIds: string[] = [];
    const skippedIds: string[] = [];
    const reasons: Record<string, string> = {};

    for (const media of mediaList) {
      if (media.approvalStatus !== ApprovalStatus.PENDING) {
        skippedIds.push(media.id);
        reasons[media.id] = `Media approvalStatus is '${media.approvalStatus}', must be PENDING.`;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.mediaItem.update({
            where: { id: media.id, approvalStatus: ApprovalStatus.PENDING },
            data: {
              approvalStatus: ApprovalStatus.REJECTED,
              rejectedBy: input.actorUserId,
              rejectedAt: now,
              rejectionCode: input.rejectionCode,
              rejectionReason: input.rejectionReason || null,
              isPublished: false,
            },
          });

          await tx.mediaModerationAction.create({
            data: {
              mediaItemId: media.id,
              organisationId: input.organisationId,
              actorUserId: input.actorUserId,
              action: ModerationActionType.REJECTED,
              reasonCode: input.rejectionCode,
              note: input.note || input.rejectionReason || null,
            },
          });
        });

        rejectedIds.push(media.id);

        NotificationService.send({
          userId: media.uploaderId,
          organisationId: input.organisationId,
          type: NotificationType.MEDIA_REJECTED,
          title: 'Upload Rejected',
          message: `Your upload "${media.originalFileName}" was rejected. Reason: ${input.rejectionCode.replace(/_/g, ' ')}`,
          resourceType: 'MEDIA_ITEM',
          resourceId: media.id,
        }).catch(() => {});
      } catch (err) {
        skippedIds.push(media.id);
        reasons[media.id] = 'Concurrent modification error.';
      }
    }

    if (rejectedIds.length > 0) {
      await prisma.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: 'BULK_MEDIA_REJECTED',
          resourceType: 'ORGANISATION',
          resourceId: input.organisationId,
          metadata: {
            rejectedCount: rejectedIds.length,
            skippedCount: skippedIds.length,
            rejectedIds,
            rejectionCode: input.rejectionCode,
          },
        },
      });
    }

    return {
      rejectedCount: rejectedIds.length,
      skippedCount: skippedIds.length,
      rejectedIds,
      skippedIds,
      reasons,
    };
  }

  /**
   * Unpublishes/revokes an approved media item from public gallery without deleting
   */
  static async unpublishMedia(input: UnpublishMediaInput) {
    await this.verifyModerator(input.organisationId, input.actorUserId);

    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    assertTenantOwnership(media.organisationId, input.organisationId, 'Media item');

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.mediaItem.update({
        where: { id: input.mediaId },
        data: {
          isPublished: false,
        },
      });

      await tx.mediaModerationAction.create({
        data: {
          mediaItemId: input.mediaId,
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: ModerationActionType.UNPUBLISHED,
          note: input.note || null,
        },
      });

      await tx.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.actorUserId,
          action: 'USER_MEDIA_UNPUBLISHED',
          resourceType: 'MEDIA_ITEM',
          resourceId: input.mediaId,
          metadata: { note: input.note },
        },
      });

      return result;
    });

    return updated;
  }

  /**
   * Allows an uploader to resubmit a previously rejected media item
   */
  static async resubmitMedia(input: ResubmitMediaInput) {
    const media = await prisma.mediaItem.findUnique({
      where: { id: input.mediaId },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    assertTenantOwnership(media.organisationId, input.organisationId, 'Media item');

    if (media.uploaderId !== input.uploaderUserId) {
      throw new ForbiddenError('You can only resubmit your own rejected uploads.');
    }

    if (media.approvalStatus !== ApprovalStatus.REJECTED) {
      throw new BadRequestError('Only rejected media items can be resubmitted for review.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.mediaItem.update({
        where: { id: input.mediaId },
        data: {
          approvalStatus: ApprovalStatus.PENDING,
          requestedVisibility: input.requestedVisibility || media.requestedVisibility,
          faceSearchRequested: input.faceSearchRequested !== undefined ? input.faceSearchRequested : media.faceSearchRequested,
        },
      });

      await tx.mediaModerationAction.create({
        data: {
          mediaItemId: input.mediaId,
          organisationId: input.organisationId,
          actorUserId: input.uploaderUserId,
          action: ModerationActionType.RESUBMITTED,
        },
      });

      await tx.auditLog.create({
        data: {
          organisationId: input.organisationId,
          actorUserId: input.uploaderUserId,
          action: 'USER_MEDIA_RESUBMITTED',
          resourceType: 'MEDIA_ITEM',
          resourceId: input.mediaId,
        },
      });

      return result;
    });

    return updated;
  }

  /**
   * Fetches user's own submissions with pagination and status
   */
  static async getUserSubmissions(params: UserSubmissionsFilter) {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {
      organisationId: params.organisationId,
      uploaderId: params.uploaderUserId,
    };

    if (params.status && params.status !== 'ALL') {
      where.approvalStatus = params.status;
    }

    if (params.eventId) {
      where.eventId = params.eventId;
    }

    if (params.search) {
      where.originalFileName = {
        contains: params.search,
        mode: 'insensitive',
      };
    }

    const [items, totalCount] = await Promise.all([
      prisma.mediaItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          event: {
            select: { id: true, name: true, slug: true },
          },
          album: {
            select: { id: true, name: true, slug: true },
          },
          variants: {
            where: { status: MediaStatus.READY },
          },
          moderationActions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      prisma.mediaItem.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
      },
    };
  }
}
