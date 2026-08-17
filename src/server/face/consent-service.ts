import { prisma } from '@/server/db/prisma';
import { env } from '@/config/env';
import { ConsentStatus, FaceProfileStatus, FaceJobType, FaceJobStatus } from '@prisma/client';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/errors';

export interface GrantConsentInput {
  userId: string;
  organisationId: string;
  isMinor?: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface WithdrawConsentInput {
  userId: string;
  organisationId: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Validates that global and organisation-level face discovery features are active.
 */
export async function assertFaceDiscoveryEnabled(organisationId: string) {
  if (!env.FACE_DISCOVERY_ENABLED) {
    throw new ForbiddenError('Face discovery is disabled at the platform infrastructure level');
  }

  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      faceDiscoveryEnabled: true,
      allowFaceDiscoveryForMinors: true,
      faceConsentVersion: true,
    },
  });

  if (!org) {
    throw new NotFoundError('Organisation not found');
  }

  if (!org.faceDiscoveryEnabled) {
    throw new ForbiddenError('Face discovery is not enabled for this organisation');
  }

  return org;
}

/**
 * Grants explicit, affirmative opt-in consent for face-based photo discovery.
 */
export async function grantFaceDiscoveryConsent(input: GrantConsentInput) {
  const org = await assertFaceDiscoveryEnabled(input.organisationId);

  if (input.isMinor && !org.allowFaceDiscoveryForMinors) {
    throw new ForbiddenError(
      'Face discovery for minor accounts is prohibited by organisation policy without verified parental consent'
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Check for existing consent
    const existingConsent = await tx.faceDiscoveryConsent.findFirst({
      where: {
        userId: input.userId,
        organisationId: input.organisationId,
      },
      orderBy: { createdAt: 'desc' },
    });

    let consentRecord;
    if (existingConsent) {
      consentRecord = await tx.faceDiscoveryConsent.update({
        where: { id: existingConsent.id },
        data: {
          status: ConsentStatus.ACTIVE,
          consentVersion: org.faceConsentVersion,
          consentedAt: new Date(),
          withdrawnAt: null,
          purpose: 'PHOTO_DISCOVERY',
        },
      });
    } else {
      consentRecord = await tx.faceDiscoveryConsent.create({
        data: {
          userId: input.userId,
          organisationId: input.organisationId,
          status: ConsentStatus.ACTIVE,
          consentVersion: org.faceConsentVersion,
          consentedAt: new Date(),
          purpose: 'PHOTO_DISCOVERY',
        },
      });
    }

    // Audit log (Never records selfie or face vector)
    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'FACE_DISCOVERY_CONSENT_GRANTED',
        resourceType: 'BIOMETRIC_CONSENT',
        resourceId: consentRecord.id,
        metadata: {
          consentVersion: org.faceConsentVersion,
          purpose: 'PHOTO_DISCOVERY',
          isMinor: !!input.isMinor,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    return consentRecord;
  });

  return result;
}

/**
 * Withdraws consent immediately and triggers biometric profile deactivation and deletion workflow.
 */
export async function withdrawFaceDiscoveryConsent(input: WithdrawConsentInput) {
  const result = await prisma.$transaction(async (tx) => {
    const consent = await tx.faceDiscoveryConsent.findFirst({
      where: {
        userId: input.userId,
        organisationId: input.organisationId,
        status: ConsentStatus.ACTIVE,
      },
    });

    if (!consent) {
      throw new NotFoundError('No active face discovery consent found');
    }

    // 1. Mark consent as WITHDRAWN
    const updatedConsent = await tx.faceDiscoveryConsent.update({
      where: { id: consent.id },
      data: {
        status: ConsentStatus.WITHDRAWN,
        withdrawnAt: new Date(),
      },
    });

    // 2. Immediately revoke and purge any active FaceProfile
    const activeProfiles = await tx.faceProfile.findMany({
      where: {
        userId: input.userId,
        organisationId: input.organisationId,
        status: { in: [FaceProfileStatus.ACTIVE, FaceProfileStatus.PROCESSING] },
      },
    });

    for (const profile of activeProfiles) {
      await tx.faceProfile.update({
        where: { id: profile.id },
        data: {
          status: FaceProfileStatus.REVOKED,
          embeddingJson: null, // Purge raw embedding vector immediately
          deletedAt: new Date(),
        },
      });
    }

    // 3. Queue biometric deletion cleanup job
    await tx.faceProcessingJob.create({
      data: {
        organisationId: input.organisationId,
        jobType: FaceJobType.PROFILE_DELETION,
        resourceId: input.userId,
        status: FaceJobStatus.PENDING,
      },
    });

    // 4. Audit log
    await tx.auditLog.create({
      data: {
        organisationId: input.organisationId,
        actorUserId: input.userId,
        action: 'FACE_DISCOVERY_CONSENT_WITHDRAWN',
        resourceType: 'BIOMETRIC_CONSENT',
        resourceId: consent.id,
        metadata: {
          consentVersion: consent.consentVersion,
          profilesRevokedCount: activeProfiles.length,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    return updatedConsent;
  });

  return result;
}

/**
 * Retrieves consent status and version compatibility.
 */
export async function getConsentStatus(userId: string, organisationId: string) {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { faceConsentVersion: true, faceDiscoveryEnabled: true },
  });

  const consent = await prisma.faceDiscoveryConsent.findFirst({
    where: {
      userId,
      organisationId,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent || consent.status !== ConsentStatus.ACTIVE) {
    return {
      hasActiveConsent: false,
      status: consent?.status || ConsentStatus.WITHDRAWN,
      consentVersion: consent?.consentVersion || null,
      requiresReconsent: false,
    };
  }

  const currentOrgVersion = org?.faceConsentVersion || 'v1';
  const isOutdated = consent.consentVersion !== currentOrgVersion;

  return {
    hasActiveConsent: !isOutdated && consent.status === ConsentStatus.ACTIVE,
    status: consent.status,
    consentVersion: consent.consentVersion,
    consentedAt: consent.consentedAt.toISOString(),
    requiresReconsent: isOutdated,
  };
}
