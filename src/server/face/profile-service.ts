import { prisma } from '@/server/db/prisma';
import { env } from '@/config/env';
import { FaceProfileStatus, ConsentStatus } from '@prisma/client';
import { AppError, ForbiddenError, NotFoundError, BadRequestError } from '@/lib/errors';
import { assertFaceDiscoveryEnabled } from './consent-service';
import { detectFacesInImage, validateSelfieQuality } from './detector-engine';
import { generateFaceEmbedding, CURRENT_FACE_MODEL } from './embedding-model';
import { serializeEmbedding } from './vector-math';
import { UserFaceProfileStatusDTO } from './types';
import { getStorageProvider } from '@/server/storage';

export interface ProcessSelfieInput {
  userId: string;
  organisationId: string;
  imageBuffer: Buffer;
  tempStorageKey?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Generates a private signed upload URL for a user's selfie.
 * The destination is in the private 'biometric/' namespace, completely segregated from public event media.
 */
export async function requestSelfieUploadUrl(userId: string, organisationId: string) {
  await assertFaceDiscoveryEnabled(organisationId);

  // Verify active consent
  const consent = await prisma.faceDiscoveryConsent.findFirst({
    where: {
      userId,
      organisationId,
      status: ConsentStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent) {
    throw new ForbiddenError('Active consent is required before uploading a selfie for face discovery');
  }

  const storage = getStorageProvider();
  const sessionId = crypto.randomUUID();
  const privateKey = `biometric/organisations/${organisationId}/users/${userId}/${sessionId}.webp`;

  const uploadUrl = await storage.createUploadUrl(privateKey, 'image/webp', 300);

  return {
    uploadUrl,
    sessionId,
    key: privateKey,
    expiresInSeconds: 300,
  };
}

/**
 * Asynchronously processes a selfie image:
 * 1. Performs quality analysis and face detection.
 * 2. Enforces single-face constraint.
 * 3. Generates 128D normalized embedding.
 * 4. Stores FaceProfile in DB.
 * 5. Immediately deletes the raw selfie from temporary storage (data minimization).
 */
export async function processSelfie(input: ProcessSelfieInput) {
  await assertFaceDiscoveryEnabled(input.organisationId);

  // 1. Verify consent
  const consent = await prisma.faceDiscoveryConsent.findFirst({
    where: {
      userId: input.userId,
      organisationId: input.organisationId,
      status: ConsentStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent) {
    throw new ForbiddenError('Cannot process selfie without active face discovery consent');
  }

  // 2. Detect face & validate quality
  const detectionResult = await detectFacesInImage(input.imageBuffer, {
    maxFacesAllowed: 1,
    minImageDimension: 150,
  });

  let detectedFace;
  try {
    detectedFace = validateSelfieQuality(detectionResult);
  } catch (err: any) {
    // Record failed attempt
    await prisma.faceProfile.upsert({
      where: {
        unique_user_org_profile_version: {
          userId: input.userId,
          organisationId: input.organisationId,
          profileVersion: 1,
        },
      },
      update: {
        status: FaceProfileStatus.FAILED,
        failureReason: err.message,
      },
      create: {
        userId: input.userId,
        organisationId: input.organisationId,
        consentId: consent.id,
        status: FaceProfileStatus.FAILED,
        failureReason: err.message,
        profileVersion: 1,
      },
    });

    throw new BadRequestError(err.message);
  }

  // 3. Generate 128-dimensional embedding
  const embeddingResult = await generateFaceEmbedding(input.imageBuffer, detectedFace);
  const serializedEmbedding = serializeEmbedding(embeddingResult.embedding);

  // 4. Update or Create FaceProfile in DB atomically
  const profile = await prisma.$transaction(async (tx) => {
    // Revoke any previous active profiles
    await tx.faceProfile.updateMany({
      where: {
        userId: input.userId,
        organisationId: input.organisationId,
        status: FaceProfileStatus.ACTIVE,
      },
      data: {
        status: FaceProfileStatus.REVOKED,
        embeddingJson: null,
      },
    });

    const activeProfile = await tx.faceProfile.create({
      data: {
        userId: input.userId,
        organisationId: input.organisationId,
        consentId: consent.id,
        status: FaceProfileStatus.ACTIVE,
        modelVersion: CURRENT_FACE_MODEL.version,
        profileVersion: 1,
        embeddingJson: serializedEmbedding,
        qualityScore: detectedFace.qualityScore,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'FACE_PROFILE_CREATED',
        resourceType: 'FACE_PROFILE',
        resourceId: activeProfile.id,
        metadata: {
          modelVersion: CURRENT_FACE_MODEL.version,
          dimension: CURRENT_FACE_MODEL.dimension,
          qualityScore: detectedFace.qualityScore,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    return activeProfile;
  });

  // 5. Data Minimization: Delete temporary selfie image from storage
  if (input.tempStorageKey) {
    try {
      const storage = getStorageProvider();
      await storage.deleteObject(input.tempStorageKey);
    } catch (cleanupErr) {
      console.warn('Non-fatal: failed to delete temporary selfie from storage:', cleanupErr);
    }
  }

  return {
    id: profile.id,
    status: profile.status,
    modelVersion: profile.modelVersion,
    qualityScore: profile.qualityScore,
  };
}

/**
 * Returns privacy-safe user face profile status.
 * Never exposes raw vectors, embeddings, or storage keys.
 */
export async function getFaceProfileStatus(
  userId: string,
  organisationId: string
): Promise<UserFaceProfileStatusDTO> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { faceDiscoveryEnabled: true, faceConsentVersion: true },
  });

  const consent = await prisma.faceDiscoveryConsent.findFirst({
    where: { userId, organisationId },
    orderBy: { createdAt: 'desc' },
  });

  const profile = await prisma.faceProfile.findFirst({
    where: { userId, organisationId },
    orderBy: { createdAt: 'desc' },
  });

  const hasActiveConsent =
    !!org?.faceDiscoveryEnabled &&
    env.FACE_DISCOVERY_ENABLED &&
    consent?.status === ConsentStatus.ACTIVE &&
    consent.consentVersion === (org?.faceConsentVersion || 'v1');

  const isProfileActive = profile?.status === FaceProfileStatus.ACTIVE;

  return {
    enabled: !!org?.faceDiscoveryEnabled && env.FACE_DISCOVERY_ENABLED,
    consentStatus: consent?.status || ConsentStatus.WITHDRAWN,
    consentVersion: consent?.consentVersion || 'v1',
    consentedAt: consent?.consentedAt?.toISOString(),
    profileStatus: profile?.status || FaceProfileStatus.NOT_CREATED,
    profileVersion: profile?.profileVersion || 1,
    createdAt: profile?.createdAt?.toISOString(),
    updatedAt: profile?.updatedAt?.toISOString(),
    canSearch: hasActiveConsent && isProfileActive,
    failureReason: profile?.failureReason || undefined,
  };
}

/**
 * Permanently deletes user's biometric profile and purges embedding data.
 */
export async function deleteFaceProfile(
  userId: string,
  organisationId: string,
  ipAddress?: string,
  userAgent?: string
) {
  const result = await prisma.$transaction(async (tx) => {
    const profiles = await tx.faceProfile.findMany({
      where: { userId, organisationId },
    });

    if (profiles.length === 0) {
      throw new NotFoundError('No face profile found to delete');
    }

    for (const profile of profiles) {
      await tx.faceProfile.update({
        where: { id: profile.id },
        data: {
          status: FaceProfileStatus.DELETED,
          embeddingJson: null,
          deletedAt: new Date(),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organisationId,
        actorUserId: userId,
        action: 'FACE_PROFILE_DELETED',
        resourceType: 'FACE_PROFILE',
        resourceId: profiles[0].id,
        metadata: {
          deletedProfilesCount: profiles.length,
        },
        ipAddress,
        userAgent,
      },
    });

    return { deletedCount: profiles.length };
  });

  return result;
}
