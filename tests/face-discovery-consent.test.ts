import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  grantFaceDiscoveryConsent,
  withdrawFaceDiscoveryConsent,
  getConsentStatus,
  assertFaceDiscoveryEnabled,
} from '@/server/face/consent-service';
import { prisma } from '@/server/db/prisma';
import { ConsentStatus, FaceProfileStatus, FaceJobType } from '@prisma/client';

vi.mock('@/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FACE_DISCOVERY_ENABLED: true,
    FACE_MODEL_NAME: 'MobileFaceNet-128D',
    FACE_MODEL_VERSION: 'face-model-v1',
    FACE_EMBEDDING_DIMENSION: 128,
    FACE_SIMILARITY_THRESHOLD: 0.72,
    FACE_HIGH_CONFIDENCE_THRESHOLD: 0.82,
    FACE_RETENTION_DAYS_DEFAULT: 365,
  },
}));

vi.mock('@/server/db/prisma', () => {
  const mockOrgFindUnique = vi.fn();
  const mockConsentFindFirst = vi.fn();
  const mockConsentCreate = vi.fn();
  const mockConsentUpdate = vi.fn();
  const mockProfileFindMany = vi.fn();
  const mockProfileUpdate = vi.fn();
  const mockProfileUpdateMany = vi.fn();
  const mockJobCreate = vi.fn();
  const mockAuditLogCreate = vi.fn();

  return {
    prisma: {
      organisation: {
        findUnique: mockOrgFindUnique,
      },
      faceDiscoveryConsent: {
        findFirst: mockConsentFindFirst,
        create: mockConsentCreate,
        update: mockConsentUpdate,
      },
      faceProfile: {
        findMany: mockProfileFindMany,
        update: mockProfileUpdate,
        updateMany: mockProfileUpdateMany,
      },
      faceProcessingJob: {
        create: mockJobCreate,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
      $transaction: vi.fn(async (cb) => {
        return cb({
          faceDiscoveryConsent: {
            findFirst: mockConsentFindFirst,
            create: mockConsentCreate,
            update: mockConsentUpdate,
          },
          faceProfile: {
            findMany: mockProfileFindMany,
            update: mockProfileUpdate,
            updateMany: mockProfileUpdateMany,
          },
          faceProcessingJob: {
            create: mockJobCreate,
          },
          auditLog: {
            create: mockAuditLogCreate,
          },
        });
      }),
    },
  };
});

describe('Phase 12: Biometric Consent Management & DPDP Compliance', () => {
  const orgId = 'org_123';
  const userId = 'usr_456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects consent actions if face discovery is disabled for the organisation', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: false,
      faceConsentVersion: 'v1',
      allowFaceDiscoveryForMinors: false,
    } as any);

    await expect(
      grantFaceDiscoveryConsent({
        userId,
        organisationId: orgId,
      })
    ).rejects.toThrow(/not enabled for this organisation/i);
  });

  it('grants affirmative, versioned consent and logs audit event', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
      allowFaceDiscoveryForMinors: true,
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.faceDiscoveryConsent.create).mockResolvedValue({
      id: 'consent_abc',
      userId,
      organisationId: orgId,
      consentVersion: 'v1',
      status: ConsentStatus.ACTIVE,
      isMinor: false,
      consentedAt: new Date(),
    } as any);

    const result = await grantFaceDiscoveryConsent({
      userId,
      organisationId: orgId,
      isMinor: false,
      ipAddress: '127.0.0.1',
    });

    expect(result.status).toBe(ConsentStatus.ACTIVE);
    expect(result.consentVersion).toBe('v1');
    expect(prisma.faceDiscoveryConsent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId,
          organisationId: orgId,
          status: ConsentStatus.ACTIVE,
          consentVersion: 'v1',
        }),
      })
    );
  });

  it('blocks consent for minor accounts when minor policy is disabled', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
      allowFaceDiscoveryForMinors: false,
    } as any);

    await expect(
      grantFaceDiscoveryConsent({
        userId,
        organisationId: orgId,
        isMinor: true,
      })
    ).rejects.toThrow(/minor/i);
  });

  it('withdraws consent: revokes profiles, purges embeddings, and logs audit trail', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
      allowFaceDiscoveryForMinors: true,
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue({
      id: 'consent_abc',
      userId,
      organisationId: orgId,
      status: ConsentStatus.ACTIVE,
      consentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.update).mockResolvedValue({
      id: 'consent_abc',
      status: ConsentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    } as any);

    vi.mocked(prisma.faceProfile.findMany).mockResolvedValue([
      {
        id: 'prof_1',
        userId,
        organisationId: orgId,
        status: FaceProfileStatus.ACTIVE,
      } as any,
    ]);

    const result = await withdrawFaceDiscoveryConsent({
      userId,
      organisationId: orgId,
      ipAddress: '192.168.1.1',
    });

    expect(result.status).toBe(ConsentStatus.WITHDRAWN);
    expect(prisma.faceProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prof_1' },
        data: expect.objectContaining({
          status: FaceProfileStatus.REVOKED,
          embeddingJson: null,
        }),
      })
    );
    expect(prisma.faceProcessingJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: FaceJobType.PROFILE_DELETION,
          resourceId: userId,
        }),
      })
    );
  });

  it('detects outdated consent version and requires re-consent', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v2', // Updated to v2
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue({
      id: 'consent_old',
      userId,
      organisationId: orgId,
      status: ConsentStatus.ACTIVE,
      consentVersion: 'v1', // Consented on old v1
      consentedAt: new Date('2025-01-01'),
    } as any);

    const status = await getConsentStatus(userId, orgId);
    expect(status.hasActiveConsent).toBe(false);
    expect(status.requiresReconsent).toBe(true);
    expect(status.consentVersion).toBe('v1');
  });
});
