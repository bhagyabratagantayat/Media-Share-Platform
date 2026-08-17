import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBiometricRetentionWorker } from '@/server/face/retention-worker';
import { prisma } from '@/server/db/prisma';
import { FaceProfileStatus, FaceJobStatus, FaceJobType } from '@prisma/client';

vi.mock('@/server/db/prisma', () => {
  const mockOrgFindMany = vi.fn();
  const mockProfileFindMany = vi.fn();
  const mockProfileUpdate = vi.fn();
  const mockProfileUpdateMany = vi.fn();
  const mockJobFindMany = vi.fn();
  const mockJobUpdate = vi.fn();
  const mockAuditLogCreate = vi.fn();

  return {
    prisma: {
      organisation: {
        findMany: mockOrgFindMany,
      },
      faceProfile: {
        findMany: mockProfileFindMany,
        update: mockProfileUpdate,
        updateMany: mockProfileUpdateMany,
      },
      faceProcessingJob: {
        findMany: mockJobFindMany,
        update: mockJobUpdate,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          faceProfile: {
            update: mockProfileUpdate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

vi.mock('@/server/storage', () => ({
  getStorageProvider: vi.fn(() => ({
    deleteObject: vi.fn(),
  })),
}));

describe('Phase 12: Biometric Retention & Cleanup Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('automatically expires active face profiles older than the organisation retention limit', async () => {
    vi.mocked(prisma.organisation.findMany).mockResolvedValue([
      {
        id: 'org_1',
        faceProfileRetentionDays: 365,
        temporaryFaceDataRetentionMinutes: 60,
      } as any,
    ]);

    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 days old

    vi.mocked(prisma.faceProfile.findMany).mockResolvedValue([
      {
        id: 'prof_expired_1',
        organisationId: 'org_1',
        status: FaceProfileStatus.ACTIVE,
        createdAt: oldDate,
      } as any,
    ]);

    vi.mocked(prisma.faceProcessingJob.findMany).mockResolvedValue([]);

    const result = await runBiometricRetentionWorker();

    expect(result.expiredProfilesDeleted).toBe(1);
    expect(prisma.faceProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prof_expired_1' },
        data: expect.objectContaining({
          status: FaceProfileStatus.DELETED,
          embeddingJson: null,
        }),
      })
    );
  });

  it('processes pending PROFILE_DELETION jobs idempotently', async () => {
    vi.mocked(prisma.organisation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.faceProcessingJob.findMany).mockResolvedValue([
      {
        id: 'job_del_1',
        organisationId: 'org_1',
        resourceId: 'usr_to_delete',
        jobType: FaceJobType.PROFILE_DELETION,
        status: FaceJobStatus.PENDING,
      } as any,
    ]);

    const result = await runBiometricRetentionWorker();

    expect(result.deletionJobsProcessed).toBe(1);
    expect(prisma.faceProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organisationId: 'org_1',
          userId: 'usr_to_delete',
          status: { not: FaceProfileStatus.DELETED },
        },
        data: expect.objectContaining({
          status: FaceProfileStatus.DELETED,
          embeddingJson: null,
        }),
      })
    );
  });
});
