import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateUploadFile,
  createUploadSession,
  generatePartUploadUrls,
  completeUploadSession,
  abortUploadSession,
  cleanupExpiredUploadSessions,
  getSignedMediaDownloadUrl,
} from '@/server/uploads/service';
import { prisma } from '@/server/db/prisma';
import { setStorageProvider } from '@/server/storage';
import { MockStorageProvider } from '@/server/storage/mock-storage';
import { ROLES } from '@/server/permissions/roles';
import {
  MediaType,
  MediaStatus,
  UploadStatus,
  UploadType,
  VariantType,
} from '@prisma/client';

let mockStorage: MockStorageProvider;

vi.mock('@/server/db/prisma', () => {
  const mockUserFindUnique = vi.fn();
  const mockMemberFindUnique = vi.fn();
  const mockEventFindUnique = vi.fn();
  const mockAlbumFindUnique = vi.fn();
  const mockQuotaFindUnique = vi.fn();
  const mockQuotaCreate = vi.fn();
  const mockQuotaUpdate = vi.fn();
  const mockMediaItemCreate = vi.fn();
  const mockMediaItemFindUnique = vi.fn();
  const mockMediaItemUpdate = vi.fn();
  const mockMediaVariantCreate = vi.fn();
  const mockUploadSessionCreate = vi.fn();
  const mockUploadSessionFindUnique = vi.fn();
  const mockUploadSessionFindMany = vi.fn();
  const mockUploadSessionUpdate = vi.fn();
  const mockAuditLogCreate = vi.fn();
  const mockOrganisationFindUnique = vi.fn();

  return {
    prisma: {
      organisation: { findUnique: mockOrganisationFindUnique },
      user: { findUnique: mockUserFindUnique },
      organisationMember: { findUnique: mockMemberFindUnique },
      event: { findUnique: mockEventFindUnique },
      album: { findUnique: mockAlbumFindUnique },
      organisationQuota: {
        findUnique: mockQuotaFindUnique,
        create: mockQuotaCreate,
        update: mockQuotaUpdate,
      },
      mediaItem: {
        create: mockMediaItemCreate,
        findUnique: mockMediaItemFindUnique,
        update: mockMediaItemUpdate,
      },
      mediaVariant: {
        create: mockMediaVariantCreate,
      },
      uploadSession: {
        create: mockUploadSessionCreate,
        findUnique: mockUploadSessionFindUnique,
        findMany: mockUploadSessionFindMany,
        update: mockUploadSessionUpdate,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          organisationQuota: {
            findUnique: mockQuotaFindUnique,
            create: mockQuotaCreate,
            update: mockQuotaUpdate,
          },
          mediaItem: {
            create: mockMediaItemCreate,
            update: mockMediaItemUpdate,
          },
          mediaVariant: {
            create: mockMediaVariantCreate,
          },
          uploadSession: {
            create: mockUploadSessionCreate,
            update: mockUploadSessionUpdate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 4: Direct Uploads & Session Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage = new MockStorageProvider();
    setStorageProvider(mockStorage);
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: 'org_1',
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

  describe('File Validation & Security Controls', () => {
    it('validates supported image formats (JPEG, PNG, WEBP, HEIC)', () => {
      expect(validateUploadFile('photo.jpg', 'image/jpeg', 2048)).toBe(MediaType.IMAGE);
      expect(validateUploadFile('photo.png', 'image/png', 2048)).toBe(MediaType.IMAGE);
      expect(validateUploadFile('photo.webp', 'image/webp', 2048)).toBe(MediaType.IMAGE);
      expect(validateUploadFile('photo.heic', 'image/heic', 2048)).toBe(MediaType.IMAGE);
    });

    it('validates supported video formats (MP4, MOV, WEBM)', () => {
      expect(validateUploadFile('video.mp4', 'video/mp4', 1048576)).toBe(MediaType.VIDEO);
      expect(validateUploadFile('video.mov', 'video/quicktime', 1048576)).toBe(MediaType.VIDEO);
      expect(validateUploadFile('video.webm', 'video/webm', 1048576)).toBe(MediaType.VIDEO);
    });

    it('rejects unsupported MIME types and executable files', () => {
      expect(() => validateUploadFile('malicious.exe', 'application/x-msdownload', 1024)).toThrow(
        /Unsupported file type/
      );
      expect(() => validateUploadFile('document.pdf', 'application/pdf', 1024)).toThrow(
        /Unsupported file type/
      );
    });

    it('rejects file extension and MIME type mismatches', () => {
      expect(() => validateUploadFile('image.jpg', 'image/png', 1024)).toThrow(
        /File extension '\.jpg' does not match declared MIME type/
      );
    });

    it('rejects files exceeding image (50MB) and video (2GB) size caps', () => {
      // 60 MB image
      expect(() =>
        validateUploadFile('giant.jpg', 'image/jpeg', 60 * 1024 * 1024)
      ).toThrow(/exceeds maximum limit/);

      // 3 GB video
      expect(() =>
        validateUploadFile('giant.mp4', 'video/mp4', 3 * 1024 * 1024 * 1024)
      ).toThrow(/exceeds maximum limit/);
    });
  });

  describe('createUploadSession', () => {
    it('creates single PUT upload session and reserves storage quota for staff upload', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_staff',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_1',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_1',
        allowUserUploads: false,
        faceSearchEnabled: true,
        status: 'PUBLISHED',
      } as any);

      vi.mocked(prisma.organisationQuota.findUnique).mockResolvedValue({
        id: 'quota_1',
        organisationId: 'org_1',
        storageLimitBytes: BigInt(53687091200), // 50 GB
        storageUsedBytes: BigInt(1000000),
        storageReservedBytes: BigInt(0),
      } as any);

      const session = await createUploadSession({
        organisationId: 'org_1',
        eventId: 'evt_1',
        userId: 'usr_staff',
        fileName: 'award_ceremony.jpg',
        mimeType: 'image/jpeg',
        fileSize: 4500000, // 4.5 MB (Single PUT)
      });

      expect(session.isMultipart).toBe(false);
      expect(session.uploadUrl).toBeDefined();
      expect(session.uploadType).toBe(UploadType.OFFICIAL);
      expect(session.storageKey).toMatch(/^organisations\/org_1\/events\/evt_1\/media\/.*\/original$/);

      expect(prisma.organisationQuota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organisationId: 'org_1' },
          data: { storageReservedBytes: { increment: BigInt(4500000) } },
        })
      );
    });

    it('creates multipart upload session with parts for large video (> 10MB)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_staff',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_1',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_1',
        allowUserUploads: false,
        faceSearchEnabled: true,
        status: 'PUBLISHED',
      } as any);

      vi.mocked(prisma.organisationQuota.findUnique).mockResolvedValue({
        id: 'quota_1',
        organisationId: 'org_1',
        storageLimitBytes: BigInt(53687091200),
        storageUsedBytes: BigInt(0),
        storageReservedBytes: BigInt(0),
      } as any);

      const session = await createUploadSession({
        organisationId: 'org_1',
        eventId: 'evt_1',
        userId: 'usr_staff',
        fileName: 'keynote_4k.mp4',
        mimeType: 'video/mp4',
        fileSize: 25000000, // 25 MB -> 3 parts (10MB chunks)
      });

      expect(session.isMultipart).toBe(true);
      expect(session.uploadId).toBeDefined();
      expect(session.partsCount).toBe(3);
      expect(session.parts?.length).toBe(3);
      expect(session.parts?.[0].partNumber).toBe(1);
    });

    it('rejects upload when organisation storage quota is exceeded', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'usr_staff',
        isPlatformAdmin: false,
      } as any);

      vi.mocked(prisma.organisationMember.findUnique).mockResolvedValue({
        id: 'mem_1',
        role: ROLES.ORGANISATION_ADMIN,
        status: 'ACTIVE',
      } as any);

      vi.mocked(prisma.event.findUnique).mockResolvedValue({
        id: 'evt_1',
        organisationId: 'org_1',
        allowUserUploads: false,
        faceSearchEnabled: true,
        status: 'PUBLISHED',
      } as any);

      // Quota is almost full (50 GB limit, 49.99 GB used)
      vi.mocked(prisma.organisationQuota.findUnique).mockResolvedValue({
        id: 'quota_1',
        organisationId: 'org_1',
        storageLimitBytes: BigInt(50000000),
        storageUsedBytes: BigInt(49000000),
        storageReservedBytes: BigInt(500000),
      } as any);

      // Requesting 5 MB when only 500 KB available
      await expect(
        createUploadSession({
          organisationId: 'org_1',
          eventId: 'evt_1',
          userId: 'usr_staff',
          fileName: 'large.jpg',
          mimeType: 'image/jpeg',
          fileSize: 5000000,
        })
      ).rejects.toThrow(/Organisation storage quota exceeded/);
    });
  });

  describe('completeUploadSession', () => {
    it('verifies storage object, converts quota reservation to used, and sets media to PROCESSING', async () => {
      const storageKey = 'organisations/org_1/events/evt_1/media/med_1/original';

      // Seed storage object in mock storage provider
      mockStorage.seedObject(storageKey, {
        contentLength: 4500000,
        contentType: 'image/jpeg',
        etag: '"verified-etag-123"',
      });

      vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
        id: 'ses_1',
        organisationId: 'org_1',
        eventId: 'evt_1',
        mediaItemId: 'med_1',
        userId: 'usr_uploader',
        storageKey,
        mimeType: 'image/jpeg',
        fileSize: BigInt(4500000),
        isMultipart: false,
        status: UploadStatus.CREATED,
        expiresAt: new Date(Date.now() + 600000),
        mediaItem: { id: 'med_1', mediaType: MediaType.IMAGE },
      } as any);

      vi.mocked(prisma.uploadSession.update).mockResolvedValue({
        id: 'ses_1',
        status: UploadStatus.COMPLETED,
      } as any);

      const completed = await completeUploadSession({
        uploadSessionId: 'ses_1',
        userId: 'usr_uploader',
      });

      expect(completed.status).toBe(UploadStatus.COMPLETED);

      // Verify quota was decremented from reserved and incremented to used
      expect(prisma.organisationQuota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organisationId: 'org_1' },
          data: {
            storageReservedBytes: { decrement: BigInt(4500000) },
            storageUsedBytes: { increment: BigInt(4500000) },
          },
        })
      );

      // Verify mediaItem transitioned to PROCESSING
      expect(prisma.mediaItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'med_1' },
          data: expect.objectContaining({
            status: MediaStatus.PROCESSING,
          }),
        })
      );

      // Verify ORIGINAL variant was registered
      expect(prisma.mediaVariant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaItemId: 'med_1',
            variantType: VariantType.ORIGINAL,
            storageKey,
          }),
        })
      );
    });

    it('rejects completion if uploaded binary was not found in storage', async () => {
      vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
        id: 'ses_ghost',
        organisationId: 'org_1',
        eventId: 'evt_1',
        mediaItemId: 'med_ghost',
        userId: 'usr_uploader',
        storageKey: 'organisations/org_1/events/evt_1/media/med_ghost/original',
        mimeType: 'image/jpeg',
        fileSize: BigInt(1000),
        isMultipart: false,
        status: UploadStatus.CREATED,
        expiresAt: new Date(Date.now() + 600000),
      } as any);

      await expect(
        completeUploadSession({
          uploadSessionId: 'ses_ghost',
          userId: 'usr_uploader',
        })
      ).rejects.toThrow(/Uploaded object was not found in object storage/);
    });
  });

  describe('abortUploadSession & cleanupExpiredUploadSessions', () => {
    it('aborts upload session, cleans storage multipart, and releases reserved quota', async () => {
      const storageKey = 'organisations/org_1/events/evt_1/media/med_ab/original';
      const multipartInit = await mockStorage.createMultipartUpload(storageKey, 'video/mp4');

      vi.mocked(prisma.uploadSession.findUnique).mockResolvedValue({
        id: 'ses_abort',
        organisationId: 'org_1',
        mediaItemId: 'med_ab',
        userId: 'usr_1',
        storageKey,
        uploadId: multipartInit.uploadId,
        isMultipart: true,
        fileSize: BigInt(10000000),
        status: UploadStatus.CREATED,
      } as any);

      await abortUploadSession('ses_abort', 'usr_1');

      expect(prisma.organisationQuota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organisationId: 'org_1' },
          data: {
            storageReservedBytes: { decrement: BigInt(10000000) },
          },
        })
      );

      expect(prisma.uploadSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ses_abort' },
          data: { status: UploadStatus.CANCELLED },
        })
      );

      expect(prisma.mediaItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'med_ab' },
          data: { status: MediaStatus.FAILED },
        })
      );
    });

    it('cleans up expired upload sessions and releases quota reservations', async () => {
      vi.mocked(prisma.uploadSession.findMany).mockResolvedValue([
        {
          id: 'ses_expired_1',
          organisationId: 'org_1',
          mediaItemId: 'med_exp_1',
          fileSize: BigInt(5000000),
          isMultipart: false,
          storageKey: 'key_1',
        },
      ] as any);

      const cleanedCount = await cleanupExpiredUploadSessions();
      expect(cleanedCount).toBe(1);

      expect(prisma.organisationQuota.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organisationId: 'org_1' },
          data: { storageReservedBytes: { decrement: BigInt(5000000) } },
        })
      );
    });
  });

  describe('Signed Media Downloads', () => {
    it('generates signed download URL when event downloads are allowed', async () => {
      const storageKey = 'organisations/org_1/events/evt_1/media/med_dl/original';
      mockStorage.seedObject(storageKey, { contentLength: 2048, contentType: 'image/jpeg' });

      vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
        id: 'med_dl',
        originalFileName: 'alumni_group.jpg',
        originalStorageKey: storageKey,
        event: {
          id: 'evt_1',
          allowDownloads: true,
          organisationId: 'org_1',
        },
      } as any);

      const downloadUrl = await getSignedMediaDownloadUrl('med_dl', 'usr_member', true, ROLES.USER);
      expect(downloadUrl).toContain('https://mock-storage.local/download/');
      expect(downloadUrl).toContain('filename=alumni_group.jpg');
    });

    it('blocks signed download when event downloads are disabled for standard users', async () => {
      vi.mocked(prisma.mediaItem.findUnique).mockResolvedValue({
        id: 'med_dl_locked',
        originalFileName: 'secret.jpg',
        originalStorageKey: 'key',
        event: {
          id: 'evt_1',
          allowDownloads: false, // Locked
          organisationId: 'org_1',
        },
      } as any);

      await expect(
        getSignedMediaDownloadUrl('med_dl_locked', 'usr_member', true, ROLES.USER)
      ).rejects.toThrow(/Downloads are disabled for this event/);
    });
  });
});
