import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchService } from '@/server/batches/service';
import { OfficialMediaService } from '@/server/media/official-service';
import { TeamService } from '@/server/team/service';
import { prisma } from '@/server/db/prisma';
import { setStorageProvider, MockStorageProvider } from '@/server/storage';
import {
  UploadBatchStatus,
  UploadBatchItemStatus,
  UploadType,
  MediaStatus,
  ApprovalStatus,
  Role,
  MemberStatus,
} from '@prisma/client';
import { ROLES } from '@/server/permissions/roles';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
      },
      organisation: {
        findUnique: vi.fn(),
      },
      organisationMember: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      organisationQuota: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      event: {
        findUnique: vi.fn(),
      },
      album: {
        findUnique: vi.fn(),
      },
      uploadBatch: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      uploadBatchItem: {
        create: vi.fn(),
        createMany: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        groupBy: vi.fn(),
      },
      uploadSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      mediaItem: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      mediaVariant: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(prisma)),
    },
  };
});

describe('Phase 7: Social Media Team & Bulk Upload Workflow', () => {
  const mockStorage = new MockStorageProvider();

  beforeEach(() => {
    vi.clearAllMocks();
    setStorageProvider(mockStorage);
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: 'org-1',
      allowUserUploads: true,
      allowUserPhotoUploads: true,
      allowUserVideoUploads: true,
      maxUserImageSize: 26214400,
      maxUserVideoSize: 209715200,
      maxUserUploadsPerDay: 50,
      autoPublishOfficialMedia: true,
      autoPublishUserUploads: true,
      requireUserUploadApproval: true,
    } as any);
  });

  describe('BatchService.createBatch', () => {
    it('creates an upload batch and its items for authorized Social Media Manager', async () => {
      // Mock User
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-manager-1',
        isPlatformAdmin: false,
      } as any);

      // Mock Member with SOCIAL_MEDIA_MANAGER role
      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem-1',
        organisationId: 'org-1',
        userId: 'user-manager-1',
        role: Role.SOCIAL_MEDIA_MANAGER,
        status: MemberStatus.ACTIVE,
      } as any);

      // Mock Event
      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'ev-1',
        organisationId: 'org-1',
        status: 'PUBLISHED',
        allowUserUploads: true,
      } as any);

      // Mock Quota
      vi.mocked(prisma.organisationQuota.findUnique).mockResolvedValue({
        id: 'quota-1',
        organisationId: 'org-1',
        storageLimitBytes: BigInt(10000000000), // 10GB
        storageUsedBytes: BigInt(1000000),
        storageReservedBytes: BigInt(0),
      } as any);

      // Mock Batch Creation
      vi.mocked(prisma.uploadBatch.create).mockResolvedValue({
        id: 'batch-1',
        organisationId: 'org-1',
        eventId: 'ev-1',
        albumId: null,
        createdBy: 'user-manager-1',
        uploadType: UploadType.OFFICIAL,
        status: UploadBatchStatus.CREATED,
        totalFiles: 3,
        completedFiles: 0,
        failedFiles: 0,
        cancelledFiles: 0,
        totalBytes: BigInt(6000000),
        uploadedBytes: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
      } as any);

      vi.mocked(prisma.uploadBatchItem.createMany).mockResolvedValue({ count: 3 } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({ id: 'audit-1' } as any);

      const files = [
        { fileName: 'photo1.jpg', fileSize: 2000000, mimeType: 'image/jpeg' },
        { fileName: 'photo2.png', fileSize: 2000000, mimeType: 'image/png' },
        { fileName: 'clip.mp4', fileSize: 2000000, mimeType: 'video/mp4' },
      ];

      const batch = await BatchService.createBatch({
        organisationId: 'org-1',
        eventId: 'ev-1',
        userId: 'user-manager-1',
        uploadType: UploadType.OFFICIAL,
        files,
      });

      expect(batch.id).toBe('batch-1');
      expect(prisma.uploadBatch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organisationId: 'org-1',
            eventId: 'ev-1',
            uploadType: UploadType.OFFICIAL,
            totalFiles: 3,
          }),
        })
      );
      expect(prisma.uploadBatchItem.createMany).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPLOAD_BATCH_CREATED',
          }),
        })
      );
    });

    it('rejects OFFICIAL upload type for standard regular users', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-regular',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem-reg',
        organisationId: 'org-1',
        userId: 'user-regular',
        role: Role.USER,
        status: MemberStatus.ACTIVE,
      } as any);

      await expect(
        BatchService.createBatch({
          organisationId: 'org-1',
          eventId: 'ev-1',
          userId: 'user-regular',
          uploadType: UploadType.OFFICIAL,
          files: [{ fileName: 'photo.jpg', fileSize: 1000, mimeType: 'image/jpeg' }],
        })
      ).rejects.toThrow(/authorised Social Media Team members/);
    });

    it('rejects batch when file list is empty', async () => {
      await expect(
        BatchService.createBatch({
          organisationId: 'org-1',
          eventId: 'ev-1',
          userId: 'user-1',
          files: [],
        })
      ).rejects.toThrow('At least one file is required to create a batch.');
    });
  });

  describe('Batch item completion and state reconciliation', () => {
    it('completes batch item, increments completedFiles, and reconciles batch to COMPLETED', async () => {
      const mockBatchItem = {
        id: 'item-1',
        batchId: 'batch-1',
        uploadSessionId: 'session-1',
        mediaItemId: 'media-1',
        fileName: 'photo.jpg',
        fileSize: BigInt(2000000),
        status: UploadBatchItemStatus.UPLOADING,
        batch: {
          id: 'batch-1',
          organisationId: 'org-1',
          organisation: {
            id: 'org-1',
            autoPublishOfficialMedia: true,
          },
        },
      };

      vi.mocked(prisma.uploadBatchItem.findUnique).mockResolvedValue(mockBatchItem as any);

      // Mock session for completeUploadSession
      vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
        id: 'session-1',
        organisationId: 'org-1',
        eventId: 'ev-1',
        albumId: null,
        mediaItemId: 'media-1',
        userId: 'user-manager-1',
        uploadType: UploadType.OFFICIAL,
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: BigInt(2000000),
        storageKey: 'org-1/ev-1/media-1/original/photo.jpg',
        status: 'CREATED',
        expiresAt: new Date(Date.now() + 60000),
        isMultipart: false,
      } as any);

      // Mock object storage verification
      vi.spyOn(mockStorage, 'headObject').mockResolvedValue({
        contentLength: 2000000,
        etag: 'mock-etag',
        contentType: 'image/jpeg',
        lastModified: new Date(),
      });

      vi.mocked(prisma.organisationQuota.update).mockResolvedValue({} as any);
      vi.mocked(prisma.uploadSession.update).mockResolvedValue({} as any);
      vi.mocked(prisma.mediaItem.update).mockResolvedValue({} as any);
      vi.mocked(prisma.mediaVariant.create).mockResolvedValue({} as any);
      vi.mocked(prisma.uploadBatchItem.update).mockResolvedValue({
        ...mockBatchItem,
        status: UploadBatchItemStatus.PROCESSING,
      } as any);
      vi.mocked(prisma.uploadBatch.update).mockResolvedValue({} as any);

      // Mock groupBy to simulate all items in terminal READY state
      vi.mocked(prisma.uploadBatchItem.groupBy).mockResolvedValue([
        { status: UploadBatchItemStatus.READY, _count: { status: 3 } } as any,
      ]);

      const res = await BatchService.completeBatchItem('batch-1', 'item-1', 'user-manager-1');

      expect(res.status).toBe(UploadBatchItemStatus.PROCESSING);
      expect(prisma.uploadBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-1' },
          data: expect.objectContaining({
            completedFiles: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('OfficialMediaService & Duplicates', () => {
    it('bulk publishes ready media items and audits the action', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-mgr',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem-mgr',
        organisationId: 'org-1',
        userId: 'user-mgr',
        role: Role.SOCIAL_MEDIA_MANAGER,
        status: MemberStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValue([
        { id: 'm-1', status: MediaStatus.READY, isPublished: false, approvalStatus: ApprovalStatus.NOT_REQUIRED } as any,
        { id: 'm-2', status: MediaStatus.READY, isPublished: false, approvalStatus: ApprovalStatus.NOT_REQUIRED } as any,
        { id: 'm-3', status: MediaStatus.PROCESSING, isPublished: false, approvalStatus: ApprovalStatus.NOT_REQUIRED } as any,
      ]);

      vi.mocked(prisma.mediaItem.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const result = await OfficialMediaService.bulkPublish({
        organisationId: 'org-1',
        eventId: 'ev-1',
        mediaIds: ['m-1', 'm-2', 'm-3'],
        userId: 'user-mgr',
      });

      expect(result.publishedCount).toBe(2);
      expect(result.skippedCount).toBe(1);
      expect(result.publishedIds).toEqual(['m-1', 'm-2']);
      expect(result.skippedIds).toEqual(['m-3']);
      expect(prisma.mediaItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['m-1', 'm-2'] } },
        data: expect.objectContaining({ isPublished: true }),
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'MEDIA_BULK_PUBLISHED' }),
        })
      );
    });

    it('detects duplicate checksums within tenant boundary', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-mgr',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem-mgr',
        organisationId: 'org-1',
        userId: 'user-mgr',
        role: Role.SOCIAL_MEDIA_MANAGER,
        status: MemberStatus.ACTIVE,
      } as any);

      vi.mocked(prisma.mediaItem.findMany).mockResolvedValue([
        {
          id: 'existing-media-1',
          checksum: 'hash-abc-123',
          originalFileName: 'photo.jpg',
          fileSize: BigInt(2048),
          status: MediaStatus.READY,
          createdAt: new Date(),
        } as any,
      ]);

      const result = await BatchService.checkDuplicates(
        'org-1',
        'ev-1',
        [
          { checksum: 'hash-abc-123', fileName: 'duplicate_photo.jpg', fileSize: 2048 },
          { checksum: 'hash-unique', fileName: 'unique.jpg', fileSize: 4096 },
        ],
        'user-mgr'
      );

      expect(result.duplicates.length).toBe(1);
      expect(result.duplicates[0].checksum).toBe('hash-abc-123');
      expect(result.duplicates[0].mediaId).toBe('existing-media-1');
    });
  });

  describe('TeamService: Member Management & RBAC', () => {
    it('adds a team member with SOCIAL_MEDIA_MEMBER role', async () => {
      // Actor is Admin
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce({ id: 'admin-1', isPlatformAdmin: false } as any)
        .mockResolvedValueOnce({ id: 'target-user-1', email: 'member@test.com' } as any);

      vi.mocked(prisma.organisationMember.findUnique)
        .mockResolvedValueOnce({
          id: 'mem-admin',
          organisationId: 'org-1',
          userId: 'admin-1',
          role: Role.ORGANISATION_ADMIN,
          status: MemberStatus.ACTIVE,
        } as any)
        .mockResolvedValueOnce(null); // target is not currently a member

      vi.mocked(prisma.organisationMember.create).mockResolvedValue({
        id: 'new-mem-1',
        organisationId: 'org-1',
        userId: 'target-user-1',
        role: Role.SOCIAL_MEDIA_MEMBER,
        status: MemberStatus.ACTIVE,
        user: { id: 'target-user-1', name: 'Member User', email: 'member@test.com' },
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const res = await TeamService.addTeamMember({
        organisationId: 'org-1',
        email: 'member@test.com',
        role: 'SOCIAL_MEDIA_MEMBER',
        actorUserId: 'admin-1',
      });

      expect(res.role).toBe(Role.SOCIAL_MEDIA_MEMBER);
      expect(prisma.organisationMember.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SOCIAL_MEDIA_MEMBER_ADDED' }),
        })
      );
    });

    it('updates team member role from member to manager', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'owner-1',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique)
        .mockResolvedValueOnce({
          id: 'mem-owner',
          organisationId: 'org-1',
          userId: 'owner-1',
          role: Role.ORGANISATION_OWNER,
          status: MemberStatus.ACTIVE,
        } as any)
        .mockResolvedValueOnce({
          id: 'mem-target',
          organisationId: 'org-1',
          userId: 'target-user-1',
          role: Role.SOCIAL_MEDIA_MEMBER,
          status: MemberStatus.ACTIVE,
        } as any);

      vi.mocked(prisma.organisationMember.update).mockResolvedValue({
        id: 'mem-target',
        role: Role.SOCIAL_MEDIA_MANAGER,
        user: { id: 'target-user-1', name: 'Target', email: 'target@test.com' },
      } as any);

      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const res = await TeamService.updateTeamRole({
        organisationId: 'org-1',
        targetUserId: 'target-user-1',
        newRole: Role.SOCIAL_MEDIA_MANAGER,
        actorUserId: 'owner-1',
      });

      expect(res.role).toBe(Role.SOCIAL_MEDIA_MANAGER);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SOCIAL_MEDIA_ROLE_CHANGED' }),
        })
      );
    });

    it('removes member and invalidates active upload sessions', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'admin-1',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique)
        .mockResolvedValueOnce({
          id: 'mem-admin',
          organisationId: 'org-1',
          userId: 'admin-1',
          role: Role.ORGANISATION_ADMIN,
          status: MemberStatus.ACTIVE,
        } as any)
        .mockResolvedValueOnce({
          id: 'mem-target',
          organisationId: 'org-1',
          userId: 'target-user-1',
          role: Role.SOCIAL_MEDIA_MEMBER,
          status: MemberStatus.ACTIVE,
        } as any);

      vi.mocked(prisma.organisationMember.update).mockResolvedValue({} as any);
      vi.mocked(prisma.uploadSession.updateMany).mockResolvedValue({ count: 2 } as any);
      vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);

      const res = await TeamService.removeTeamMember({
        organisationId: 'org-1',
        targetUserId: 'target-user-1',
        actorUserId: 'admin-1',
      });

      expect(res.success).toBe(true);
      expect(prisma.uploadSession.updateMany).toHaveBeenCalledWith({
        where: {
          organisationId: 'org-1',
          userId: 'target-user-1',
          status: { in: ['CREATED', 'UPLOADING'] },
        },
        data: { status: 'CANCELLED' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'SOCIAL_MEDIA_MEMBER_REMOVED' }),
        })
      );
    });
  });
});
