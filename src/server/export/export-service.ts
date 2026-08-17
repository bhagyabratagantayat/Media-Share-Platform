import { prisma } from '@/server/db/prisma';
import { getStorageProvider } from '@/server/storage';
import { ExportScope, ExportStatus } from '@prisma/client';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { MODERATOR_STAFF_ROLES } from '@/server/permissions/event-guards';
import { buildExportManifest } from './export-manifest';
import { enqueueMediaExportJob } from './export-queue';
import { env } from '@/config/env';
import { NotFoundError, ForbiddenError, BadRequestError } from '@/lib/errors';

export interface CreateExportInput {
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

export interface ExportJobDto {
  id: string;
  organisationId: string;
  userId: string;
  scopeType: ExportScope;
  eventId?: string | null;
  albumId?: string | null;
  status: ExportStatus;
  requestedVariant: string;
  fileCount: number;
  totalBytes: string;
  processedFiles: number;
  processedBytes: string;
  skippedFiles: number;
  progress: number;
  archiveSize?: string | null;
  downloadUrl?: string | null;
  downloadExpiresAt?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export class ExportService {
  /**
   * Validates quotas, builds snapshot manifest, and registers a new asynchronous export job.
   */
  static async createExportJob(input: CreateExportInput): Promise<ExportJobDto> {
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

    // 1. Rate Limit Checks
    const activeUserJobsCount = await prisma.mediaExportJob.count({
      where: {
        userId,
        organisationId,
        status: { in: [ExportStatus.QUEUED, ExportStatus.PROCESSING] },
      },
    });

    if (activeUserJobsCount >= env.MAX_ACTIVE_EXPORTS_PER_USER) {
      throw new BadRequestError(
        `You have reached the limit of ${env.MAX_ACTIVE_EXPORTS_PER_USER} active export jobs in progress. Please wait for them to finish.`
      );
    }

    const activeOrgJobsCount = await prisma.mediaExportJob.count({
      where: {
        organisationId,
        status: { in: [ExportStatus.QUEUED, ExportStatus.PROCESSING] },
      },
    });

    if (activeOrgJobsCount >= env.MAX_ACTIVE_EXPORTS_PER_ORGANISATION) {
      throw new BadRequestError(
        `Organisation export capacity is currently full (${env.MAX_ACTIVE_EXPORTS_PER_ORGANISATION} concurrent jobs). Please try again shortly.`
      );
    }

    // 2. Build immutable snapshot manifest with permission checks
    const manifest = await buildExportManifest({
      organisationId,
      userId,
      userRole,
      hasOrgAccess,
      scopeType,
      eventId,
      albumId,
      mediaIds,
      requestedVariant,
    });

    // 3. Create MediaExportJob in Database
    const exportJob = await prisma.mediaExportJob.create({
      data: {
        organisationId,
        userId,
        scopeType,
        eventId: eventId || undefined,
        albumId: albumId || undefined,
        status: ExportStatus.QUEUED,
        requestedVariant,
        fileCount: manifest.totalFiles,
        totalBytes: manifest.totalBytes,
        skippedFiles: manifest.skippedFiles,
        manifestJson: JSON.stringify(manifest.entries),
        progress: 0,
      },
    });

    // 4. Audit Log
    await prisma.auditLog.create({
      data: {
        organisationId,
        actorUserId: userId,
        action: 'EXPORT_CREATED',
        resourceType: 'MediaExportJob',
        resourceId: exportJob.id,
        metadata: {
          scopeType,
          totalFiles: manifest.totalFiles,
          totalBytes: Number(manifest.totalBytes),
          requestedVariant,
        },
      },
    });

    // 5. Enqueue background job
    await enqueueMediaExportJob({
      exportJobId: exportJob.id,
      organisationId,
      userId,
      scopeType,
      eventId,
      albumId,
      requestedVariant,
      createdAt: exportJob.createdAt.toISOString(),
    });

    return this.mapToDto(exportJob);
  }

  /**
   * Retrieves export status, progress, and short-lived signed download URL if ready.
   */
  static async getExportJob(
    exportJobId: string,
    userId?: string | null,
    userRole?: RoleType | null,
    organisationId?: string
  ): Promise<ExportJobDto> {
    const job = await prisma.mediaExportJob.findUnique({
      where: { id: exportJobId },
      include: {
        event: { select: { id: true, name: true, slug: true } },
        album: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!job) {
      throw new NotFoundError('Export job not found.');
    }

    if (organisationId && job.organisationId !== organisationId) {
      throw new NotFoundError('Export job not found.');
    }

    const isStaff = !!(userRole && MODERATOR_STAFF_ROLES.includes(userRole));
    const isPlatformAdmin = userRole === ROLES.PLATFORM_ADMIN;
    const isOwner = !!userId && job.userId === userId;

    if (!isStaff && !isPlatformAdmin && !isOwner) {
      throw new ForbiddenError('You are not authorized to access this export job.');
    }

    // Check expiration
    if (job.expiresAt && job.expiresAt < new Date() && job.status === ExportStatus.READY) {
      return this.mapToDto({
        ...job,
        status: ExportStatus.EXPIRED,
      });
    }

    let downloadUrl: string | null = null;
    let downloadExpiresAt: string | null = null;

    if (job.status === ExportStatus.READY && job.archiveStorageKey) {
      const storage = getStorageProvider();
      const filename = `${job.event?.name || job.album?.name || 'media-export'}-${exportJobId.slice(0, 8)}.zip`;

      downloadUrl = await storage.createDownloadUrl(
        job.archiveStorageKey,
        env.EXPORT_URL_TTL_SECONDS,
        filename
      );

      downloadExpiresAt = new Date(Date.now() + env.EXPORT_URL_TTL_SECONDS * 1000).toISOString();
    }

    return {
      ...this.mapToDto(job),
      downloadUrl,
      downloadExpiresAt,
    };
  }

  /**
   * Cancels an in-progress export job.
   */
  static async cancelExportJob(
    exportJobId: string,
    userId: string,
    userRole?: RoleType | null,
    organisationId?: string
  ): Promise<ExportJobDto> {
    const job = await prisma.mediaExportJob.findUnique({
      where: { id: exportJobId },
    });

    if (!job) {
      throw new NotFoundError('Export job not found.');
    }

    if (organisationId && job.organisationId !== organisationId) {
      throw new NotFoundError('Export job not found.');
    }

    const isStaff = !!(userRole && MODERATOR_STAFF_ROLES.includes(userRole));
    const isPlatformAdmin = userRole === ROLES.PLATFORM_ADMIN;
    const isOwner = job.userId === userId;

    if (!isStaff && !isPlatformAdmin && !isOwner) {
      throw new ForbiddenError('You do not have permission to cancel this export job.');
    }

    if (job.status === ExportStatus.READY || job.status === ExportStatus.FAILED) {
      throw new BadRequestError(`Cannot cancel an export job that is already ${job.status.toLowerCase()}.`);
    }

    const updated = await prisma.mediaExportJob.update({
      where: { id: exportJobId },
      data: {
        status: ExportStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organisationId: job.organisationId,
        actorUserId: userId,
        action: 'EXPORT_CANCELLED',
        resourceType: 'MediaExportJob',
        resourceId: exportJobId,
      },
    });

    return this.mapToDto(updated);
  }

  /**
   * Lists export history for an organisation or specific user.
   */
  static async listExportJobs(
    organisationId: string,
    userId?: string | null,
    userRole?: RoleType | null,
    page = 1,
    limit = 20
  ): Promise<{ items: ExportJobDto[]; total: number; page: number; totalPages: number }> {
    const isStaff = !!(userRole && MODERATOR_STAFF_ROLES.includes(userRole));
    const isPlatformAdmin = userRole === ROLES.PLATFORM_ADMIN;

    const where: any = { organisationId };

    if (!isStaff && !isPlatformAdmin) {
      if (!userId) {
        throw new ForbiddenError('Authentication required to view export history.');
      }
      where.userId = userId;
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.mediaExportJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.mediaExportJob.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToDto(item)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Background cleanup task to delete expired export archives from object storage.
   */
  static async cleanupExpiredExports(): Promise<number> {
    const storage = getStorageProvider();
    const expiredThreshold = new Date();

    const expiredJobs = await prisma.mediaExportJob.findMany({
      where: {
        OR: [
          { status: ExportStatus.READY, expiresAt: { lt: expiredThreshold } },
          { status: ExportStatus.EXPIRED, archiveStorageKey: { not: null } },
        ],
      },
      take: 50,
    });

    let cleanedCount = 0;

    for (const job of expiredJobs) {
      if (job.archiveStorageKey) {
        try {
          await storage.deleteObject(job.archiveStorageKey);
        } catch (err: any) {
          console.warn(`[ExportCleanup] Failed to delete archive ${job.archiveStorageKey}: ${err.message}`);
        }
      }

      await prisma.mediaExportJob.update({
        where: { id: job.id },
        data: {
          status: ExportStatus.EXPIRED,
          archiveStorageKey: null,
        },
      });

      cleanedCount++;
    }

    return cleanedCount;
  }

  private static mapToDto(job: any): ExportJobDto {
    return {
      id: job.id,
      organisationId: job.organisationId,
      userId: job.userId,
      scopeType: job.scopeType,
      eventId: job.eventId || null,
      albumId: job.albumId || null,
      status: job.status,
      requestedVariant: job.requestedVariant,
      fileCount: job.fileCount,
      totalBytes: (job.totalBytes || BigInt(0)).toString(),
      processedFiles: job.processedFiles,
      processedBytes: (job.processedBytes || BigInt(0)).toString(),
      skippedFiles: job.skippedFiles,
      progress: job.progress,
      archiveSize: job.archiveSize ? job.archiveSize.toString() : null,
      errorMessage: job.errorMessage || null,
      errorCode: job.errorCode || null,
      createdAt: job.createdAt.toISOString ? job.createdAt.toISOString() : job.createdAt,
      startedAt: job.startedAt ? (job.startedAt.toISOString ? job.startedAt.toISOString() : job.startedAt) : null,
      completedAt: job.completedAt ? (job.completedAt.toISOString ? job.completedAt.toISOString() : job.completedAt) : null,
      expiresAt: job.expiresAt ? (job.expiresAt.toISOString ? job.expiresAt.toISOString() : job.expiresAt) : null,
    };
  }
}
