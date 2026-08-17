import { prisma } from '@/server/db/prisma';
import { FaceProfileStatus, FaceJobStatus, FaceJobType } from '@prisma/client';
import { getStorageProvider } from '@/server/storage';

export interface RetentionCleanupResult {
  expiredProfilesDeleted: number;
  deletionJobsProcessed: number;
  tempFilesCleaned: number;
}

/**
 * Idempotent worker that enforces biometric retention limits and processes pending deletion jobs.
 */
export async function runBiometricRetentionWorker(orgId?: string): Promise<RetentionCleanupResult> {
  let expiredProfilesDeleted = 0;
  let deletionJobsProcessed = 0;
  let tempFilesCleaned = 0;

  // 1. Find organisations and their retention windows
  const organisations = await prisma.organisation.findMany({
    where: {
      ...(orgId ? { id: orgId } : {}),
      faceDiscoveryEnabled: true,
    },
    select: {
      id: true,
      faceProfileRetentionDays: true,
      temporaryFaceDataRetentionMinutes: true,
    },
  });

  for (const org of organisations) {
    const retentionDays = org.faceProfileRetentionDays || 365;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Find profiles that have exceeded the retention window
    const expiredProfiles = await prisma.faceProfile.findMany({
      where: {
        organisationId: org.id,
        status: FaceProfileStatus.ACTIVE,
        createdAt: { lt: cutoffDate },
      },
    });

    for (const profile of expiredProfiles) {
      await prisma.$transaction(async (tx) => {
        await tx.faceProfile.update({
          where: { id: profile.id },
          data: {
            status: FaceProfileStatus.DELETED,
            embeddingJson: null,
            deletedAt: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            organisationId: org.id,
            action: 'FACE_PROFILE_AUTO_EXPIRED',
            resourceType: 'FACE_PROFILE',
            resourceId: profile.id,
            metadata: {
              retentionDays,
              createdAt: profile.createdAt.toISOString(),
            },
          },
        });
      });
      expiredProfilesDeleted++;
    }
  }

  // 2. Process pending PROFILE_DELETION jobs (Idempotent)
  const pendingDeletionJobs = await prisma.faceProcessingJob.findMany({
    where: {
      jobType: FaceJobType.PROFILE_DELETION,
      status: FaceJobStatus.PENDING,
    },
    take: 50,
  });

  const storage = getStorageProvider();

  for (const job of pendingDeletionJobs) {
    try {
      await prisma.faceProcessingJob.update({
        where: { id: job.id },
        data: { status: FaceJobStatus.PROCESSING, startedAt: new Date() },
      });

      const userId = job.resourceId;

      // Ensure all profiles for this user/org are deleted
      await prisma.faceProfile.updateMany({
        where: {
          organisationId: job.organisationId,
          userId,
          status: { not: FaceProfileStatus.DELETED },
        },
        data: {
          status: FaceProfileStatus.DELETED,
          embeddingJson: null,
          deletedAt: new Date(),
        },
      });

      // Mark job completed
      await prisma.faceProcessingJob.update({
        where: { id: job.id },
        data: { status: FaceJobStatus.COMPLETED, completedAt: new Date() },
      });

      deletionJobsProcessed++;
    } catch (err: any) {
      await prisma.faceProcessingJob.update({
        where: { id: job.id },
        data: {
          status: FaceJobStatus.FAILED,
          errorMessage: err.message,
        },
      });
    }
  }

  return {
    expiredProfilesDeleted,
    deletionJobsProcessed,
    tempFilesCleaned,
  };
}
