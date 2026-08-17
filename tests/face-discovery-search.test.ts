import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchUserPhotos } from '@/server/face/search-service';
import { prisma } from '@/server/db/prisma';
import { generateSyntheticFaceEmbedding } from '@/server/face/embedding-model';
import { serializeEmbedding } from '@/server/face/vector-math';
import { ROLES } from '@/server/permissions/roles';
import { ConsentStatus, FaceProfileStatus, EventStatus, MediaStatus, ApprovalStatus, EventVisibility } from '@prisma/client';

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
  const mockProfileFindFirst = vi.fn();
  const mockMediaFaceEmbeddingFindMany = vi.fn();
  const mockAuditLogCreate = vi.fn();

  return {
    prisma: {
      organisation: {
        findUnique: mockOrgFindUnique,
      },
      faceDiscoveryConsent: {
        findFirst: mockConsentFindFirst,
      },
      faceProfile: {
        findFirst: mockProfileFindFirst,
      },
      mediaFaceEmbedding: {
        findMany: mockMediaFaceEmbeddingFindMany,
      },
      auditLog: {
        create: mockAuditLogCreate,
      },
    },
  };
});

vi.mock('@/server/cdn', () => ({
  generateMediaCdnUrls: vi.fn(() => ({
    thumbnailUrl: 'https://cdn.test/thumb.webp',
    previewUrl: 'https://cdn.test/preview.webp',
    originalUrl: 'https://cdn.test/orig.webp',
  })),
}));

describe('Phase 12: User Face Search & Privacy-Isolated Results', () => {
  const orgId = 'org_test_1';
  const otherOrgId = 'org_test_2';
  const userId = 'usr_alice';

  const aliceEmbedding = generateSyntheticFaceEmbedding('user_alice');
  const bobEmbedding = generateSyntheticFaceEmbedding('user_bob');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully locates photos containing matching face for authorised user', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue({
      id: 'consent_1',
      userId,
      organisationId: orgId,
      status: ConsentStatus.ACTIVE,
      consentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceProfile.findFirst).mockResolvedValue({
      id: 'prof_1',
      userId,
      organisationId: orgId,
      status: FaceProfileStatus.ACTIVE,
      embeddingJson: serializeEmbedding(aliceEmbedding),
    } as any);

    // Mock candidates in DB
    vi.mocked(prisma.mediaFaceEmbedding.findMany).mockResolvedValue([
      {
        id: 'emb_1',
        organisationId: orgId,
        eventId: 'evt_1',
        mediaItemId: 'med_match_1',
        embeddingJson: serializeEmbedding(aliceEmbedding), // Exact match
        confidence: 0.95,
        event: {
          id: 'evt_1',
          name: 'Annual Tech Fest 2026',
          slug: 'annual-tech-fest-2026',
          visibility: EventVisibility.PUBLIC,
        },
        mediaItem: {
          id: 'med_match_1',
          mediaType: 'IMAGE',
          createdAt: new Date('2026-08-10'),
          album: {
            id: 'alb_1',
            name: 'Hackathon Day 1',
            slug: 'hackathon-day-1',
            visibility: 'PUBLIC',
          },
          variants: [],
        },
      },
      {
        id: 'emb_2',
        organisationId: orgId,
        eventId: 'evt_1',
        mediaItemId: 'med_unrelated_2',
        embeddingJson: serializeEmbedding(bobEmbedding), // Different face (<0.72)
        confidence: 0.90,
        event: {
          id: 'evt_1',
          name: 'Annual Tech Fest 2026',
          slug: 'annual-tech-fest-2026',
          visibility: EventVisibility.PUBLIC,
        },
        mediaItem: {
          id: 'med_unrelated_2',
          mediaType: 'IMAGE',
          createdAt: new Date('2026-08-10'),
          album: null,
          variants: [],
        },
      },
    ] as any);

    const result = await searchUserPhotos({
      userId,
      organisationId: orgId,
      userRole: ROLES.USER,
      hasOrgAccess: true,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.items.length).toBe(1);
    expect(result.items[0].mediaId).toBe('med_match_1');
    expect(result.items[0].eventName).toBe('Annual Tech Fest 2026');
    expect(result.items[0].matchConfidenceCategory).toBe('High Confidence');

    // Verify safe DTO: raw embeddings and internal math are NOT exposed
    const item = result.items[0] as any;
    expect(item.embedding).toBeUndefined();
    expect(item.embeddingJson).toBeUndefined();
    expect(item.rawScore).toBeUndefined();
    expect(item.cosineSimilarity).toBeUndefined();
  });

  it('rejects search when user has not granted active consent', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue(null);

    await expect(
      searchUserPhotos({
        userId,
        organisationId: orgId,
        userRole: ROLES.USER,
        hasOrgAccess: true,
      })
    ).rejects.toThrow(/Active face discovery consent is required/i);
  });

  it('rejects search when user face profile is missing or inactive', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue({
      id: 'consent_1',
      userId,
      organisationId: orgId,
      status: ConsentStatus.ACTIVE,
      consentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceProfile.findFirst).mockResolvedValue(null);

    await expect(
      searchUserPhotos({
        userId,
        organisationId: orgId,
        userRole: ROLES.USER,
        hasOrgAccess: true,
      })
    ).rejects.toThrow(/No active face profile found/i);
  });

  it('strictly filters candidate queries by organisationId (Tenant Isolation)', async () => {
    vi.mocked(prisma.organisation.findUnique).mockResolvedValue({
      id: orgId,
      faceDiscoveryEnabled: true,
      faceConsentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceDiscoveryConsent.findFirst).mockResolvedValue({
      id: 'consent_1',
      userId,
      organisationId: orgId,
      status: ConsentStatus.ACTIVE,
      consentVersion: 'v1',
    } as any);

    vi.mocked(prisma.faceProfile.findFirst).mockResolvedValue({
      id: 'prof_1',
      userId,
      organisationId: orgId,
      status: FaceProfileStatus.ACTIVE,
      embeddingJson: serializeEmbedding(aliceEmbedding),
    } as any);

    vi.mocked(prisma.mediaFaceEmbedding.findMany).mockResolvedValue([]);

    await searchUserPhotos({
      userId,
      organisationId: orgId,
      userRole: ROLES.USER,
      hasOrgAccess: true,
    });

    expect(prisma.mediaFaceEmbedding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisationId: orgId,
        }),
      })
    );
  });
});
