import { prisma } from '@/server/db/prisma';
import { env } from '@/config/env';
import { EventStatus, MediaStatus, ApprovalStatus, FaceJobType, FaceJobStatus } from '@prisma/client';
import { AppError, ForbiddenError, NotFoundError, BadRequestError } from '@/lib/errors';
import { assertFaceDiscoveryEnabled } from './consent-service';
import { detectFacesInImage } from './detector-engine';
import { generateFaceEmbedding, CURRENT_FACE_MODEL } from './embedding-model';
import { serializeEmbedding } from './vector-math';
import { OrganisationFaceStatsDTO, OrganisationFaceSettingsDTO } from './types';
import { ROLES, Role } from '@/server/permissions/roles';

export interface IndexMediaFacesInput {
  organisationId: string;
  eventId: string;
  mediaItemId: string;
  imageBuffer: Buffer;
}

export interface UpdateOrgFaceSettingsInput {
  organisationId: string;
  userId: string;
  userRole: Role;
  settings: Partial<OrganisationFaceSettingsDTO>;
}

/**
 * Indexes faces detected in an approved, published event media item.
 * Creates anonymous MediaFaceEmbedding records without any identity attachment.
 */
export async function indexMediaFaces(input: IndexMediaFacesInput) {
  await assertFaceDiscoveryEnabled(input.organisationId);

  // Verify event and media eligibility
  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    select: { organisationId: true, status: true, faceSearchEnabled: true },
  });

  if (!event || event.organisationId !== input.organisationId) {
    throw new NotFoundError('Event not found or tenant mismatch');
  }

  if (!event.faceSearchEnabled) {
    throw new ForbiddenError('Face discovery is not enabled for this event');
  }

  const media = await prisma.mediaItem.findUnique({
    where: { id: input.mediaItemId },
    select: { organisationId: true, eventId: true, status: true, approvalStatus: true, isPublished: true },
  });

  if (!media || media.organisationId !== input.organisationId || media.eventId !== input.eventId) {
    throw new NotFoundError('Media item not found or tenant mismatch');
  }

  if (media.status !== MediaStatus.READY || media.approvalStatus !== ApprovalStatus.APPROVED || !media.isPublished) {
    throw new BadRequestError('Media item is not ready or approved for face indexing');
  }

  // Detect faces in media (supports multi-face photos)
  const detectionResult = await detectFacesInImage(input.imageBuffer, {
    maxFacesAllowed: 20,
    minImageDimension: 150,
  });

  if (detectionResult.faceCount === 0) {
    return { indexedFacesCount: 0 };
  }

  const createdEmbeddings = await prisma.$transaction(async (tx) => {
    // Remove previous embeddings for this media if re-processing
    await tx.mediaFaceEmbedding.deleteMany({
      where: { mediaItemId: input.mediaItemId },
    });

    const records = [];
    for (const face of detectionResult.faces) {
      const embeddingResult = await generateFaceEmbedding(input.imageBuffer, face);
      const serialized = serializeEmbedding(embeddingResult.embedding);

      const record = await tx.mediaFaceEmbedding.create({
        data: {
          organisationId: input.organisationId,
          eventId: input.eventId,
          mediaItemId: input.mediaItemId,
          modelVersion: CURRENT_FACE_MODEL.version,
          embeddingJson: serialized,
          confidence: face.confidence,
          boundingBoxJson: JSON.stringify(face.boundingBox),
        },
      });
      records.push(record);
    }

    return records;
  });

  return {
    indexedFacesCount: createdEmbeddings.length,
    modelVersion: CURRENT_FACE_MODEL.version,
  };
}

/**
 * Enables or disables face discovery for an event and enqueues indexing jobs.
 */
export async function toggleEventFaceDiscovery(
  organisationId: string,
  eventId: string,
  enabled: boolean,
  userId: string,
  userRole: Role
) {
  if (userRole !== ROLES.ORGANISATION_OWNER && userRole !== ROLES.ORGANISATION_ADMIN && userRole !== ROLES.PLATFORM_ADMIN) {
    throw new ForbiddenError('Only organisation administrators can toggle event face discovery');
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event || event.organisationId !== organisationId) {
    throw new NotFoundError('Event not found or cross-tenant access violation');
  }

  const updatedEvent = await prisma.$transaction(async (tx) => {
    const ev = await tx.event.update({
      where: { id: eventId },
      data: { faceSearchEnabled: enabled },
    });

    await tx.auditLog.create({
      data: {
        organisationId,
        actorUserId: userId,
        action: enabled ? 'EVENT_FACE_DISCOVERY_ENABLED' : 'EVENT_FACE_DISCOVERY_DISABLED',
        resourceType: 'EVENT',
        resourceId: eventId,
        metadata: { faceSearchEnabled: enabled },
      },
    });

    return ev;
  });

  return updatedEvent;
}

/**
 * Updates organisation face discovery settings and policies.
 */
export async function updateOrganisationFaceSettings(input: UpdateOrgFaceSettingsInput) {
  if (input.userRole !== ROLES.ORGANISATION_OWNER && input.userRole !== ROLES.ORGANISATION_ADMIN && input.userRole !== ROLES.PLATFORM_ADMIN) {
    throw new ForbiddenError('Only organisation administrators can modify biometric settings');
  }

  const updatedOrg = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.update({
      where: { id: input.organisationId },
      data: {
        faceDiscoveryEnabled: input.settings.faceDiscoveryEnabled,
        allowFaceDiscoveryForMinors: input.settings.allowFaceDiscoveryForMinors,
        faceProfileRetentionDays: input.settings.faceProfileRetentionDays,
        temporaryFaceDataRetentionMinutes: input.settings.temporaryFaceDataRetentionMinutes,
        facePrivacyPolicyUrl: input.settings.facePrivacyPolicyUrl,
        facePrivacyContactEmail: input.settings.facePrivacyContactEmail,
        faceConsentVersion: input.settings.faceConsentVersion,
      },
    });

    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'ORGANISATION_FACE_SETTINGS_UPDATED',
        resourceType: 'ORGANISATION',
        resourceId: input.organisationId,
        metadata: { ...input.settings },
      },
    });

    return org;
  });

  return updatedOrg;
}

/**
 * Retrieves aggregate face discovery metrics and queue statistics for the organisation admin console.
 */
export async function getOrganisationFaceStats(organisationId: string): Promise<OrganisationFaceStatsDTO> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { faceDiscoveryEnabled: true },
  });

  const [eligibleEventsCount, totalIndexedFaces, totalIndexedMedia, activeUserProfilesCount, pendingJobsCount, failedJobsCount] =
    await Promise.all([
      prisma.event.count({
        where: { organisationId, faceSearchEnabled: true, status: EventStatus.PUBLISHED },
      }),
      prisma.mediaFaceEmbedding.count({
        where: { organisationId },
      }),
      prisma.mediaFaceEmbedding.groupBy({
        by: ['mediaItemId'],
        where: { organisationId },
      }).then((res) => res.length),
      prisma.faceProfile.count({
        where: { organisationId, status: 'ACTIVE' },
      }),
      prisma.faceProcessingJob.count({
        where: { organisationId, status: FaceJobStatus.PENDING },
      }),
      prisma.faceProcessingJob.count({
        where: { organisationId, status: FaceJobStatus.FAILED },
      }),
    ]);

  return {
    faceDiscoveryEnabled: !!org?.faceDiscoveryEnabled,
    eligibleEventsCount,
    totalIndexedFaces,
    totalIndexedMedia,
    activeUserProfilesCount,
    pendingJobsCount,
    failedJobsCount,
  };
}
