import { prisma } from '@/server/db/prisma';
import { env } from '@/config/env';
import { EventStatus, MediaStatus, ApprovalStatus, ConsentStatus, FaceProfileStatus, EventVisibility, MediaVisibility } from '@prisma/client';
import { AppError, ForbiddenError, NotFoundError, BadRequestError } from '@/lib/errors';
import { assertFaceDiscoveryEnabled } from './consent-service';
import { deserializeEmbedding, cosineSimilarity, getConfidenceCategory } from './vector-math';
import { FaceSearchResultDTO, FaceSearchMatchDTO } from './types';
import { Role, ROLES } from '@/server/permissions/roles';
import { generateMediaCdnUrls } from '@/server/cdn';

export interface FaceSearchInput {
  userId: string;
  organisationId: string;
  userRole: Role;
  hasOrgAccess: boolean;
  eventId?: string;
  albumId?: string;
  limit?: number;
  cursor?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Searches approved event media for photos matching the authenticated user's face profile.
 * Completely server-side filtered, strictly tenant-isolated, and privacy-protected.
 */
export async function searchUserPhotos(input: FaceSearchInput): Promise<FaceSearchResultDTO> {
  // 1. Assert global and organisation face discovery enabled
  const org = await assertFaceDiscoveryEnabled(input.organisationId);

  // 2. Assert active consent
  const consent = await prisma.faceDiscoveryConsent.findFirst({
    where: {
      userId: input.userId,
      organisationId: input.organisationId,
      status: ConsentStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent || consent.consentVersion !== (org.faceConsentVersion || 'v1')) {
    throw new ForbiddenError(
      'Active face discovery consent is required to perform photo search'
    );
  }

  // 3. Assert active user face profile
  const profile = await prisma.faceProfile.findFirst({
    where: {
      userId: input.userId,
      organisationId: input.organisationId,
      status: FaceProfileStatus.ACTIVE,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!profile || !profile.embeddingJson) {
    throw new NotFoundError(
      'No active face profile found. Please upload a selfie to enable photo discovery.'
    );
  }

  const userEmbedding = deserializeEmbedding(profile.embeddingJson);

  // 4. Query MediaFaceEmbeddings with strict tenant and authorization constraints
  const candidateEmbeddings = await prisma.mediaFaceEmbedding.findMany({
    where: {
      organisationId: input.organisationId,
      ...(input.eventId ? { eventId: input.eventId } : {}),
      event: {
        organisationId: input.organisationId,
        status: EventStatus.PUBLISHED,
        faceSearchEnabled: true,
        // Visibility checks based on organisation access
        ...(input.hasOrgAccess
          ? {}
          : { visibility: EventVisibility.PUBLIC }),
      },
      mediaItem: {
        organisationId: input.organisationId,
        status: MediaStatus.READY,
        approvalStatus: ApprovalStatus.APPROVED,
        isPublished: true,
        ...(input.albumId ? { albumId: input.albumId } : {}),
      },
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
        },
      },
      mediaItem: {
        include: {
          album: {
            select: {
              id: true,
              name: true,
              slug: true,
              visibility: true,
            },
          },
          variants: true,
        },
      },
    },
  });

  // 5. Compute vector similarity and apply threshold calibration
  const scoredMatches = new Map<string, {
    mediaItem: any;
    event: any;
    maxSimilarity: number;
    confidenceCategory: 'High Confidence' | 'Likely Match';
  }>();

  for (const candidate of candidateEmbeddings) {
    try {
      const candidateEmbedding = deserializeEmbedding(candidate.embeddingJson);
      const similarity = cosineSimilarity(userEmbedding, candidateEmbedding);

      const category = getConfidenceCategory(similarity);
      if (category) {
        const mediaId = candidate.mediaItemId;
        const existing = scoredMatches.get(mediaId);

        if (!existing || similarity > existing.maxSimilarity) {
          scoredMatches.set(mediaId, {
            mediaItem: candidate.mediaItem,
            event: candidate.event,
            maxSimilarity: similarity,
            confidenceCategory: category,
          });
        }
      }
    } catch {
      // Ignore corrupt single vector entries gracefully
      continue;
    }
  }

  // 6. Sort by similarity score descending, then date descending
  const sortedCandidates = Array.from(scoredMatches.values()).sort((a, b) => {
    if (b.maxSimilarity !== a.maxSimilarity) {
      return b.maxSimilarity - a.maxSimilarity;
    }
    return new Date(b.mediaItem.createdAt).getTime() - new Date(a.mediaItem.createdAt).getTime();
  });

  // 7. Pagination
  const limit = Math.min(Math.max(input.limit || 20, 1), 100);
  let startIndex = 0;

  if (input.cursor) {
    const cursorIndex = sortedCandidates.findIndex((c) => c.mediaItem.id === input.cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const pagedItems = sortedCandidates.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sortedCandidates.length;
  const nextCursor = hasMore && pagedItems.length > 0 ? pagedItems[pagedItems.length - 1].mediaItem.id : null;

  // 8. Transform to safe DTO (Generate signed CDN thumbnail URLs, NEVER expose embeddings)
  const items: FaceSearchMatchDTO[] = await Promise.all(
    pagedItems.map(async (entry) => {
      const media = entry.mediaItem;
      const urls = await generateMediaCdnUrls(media.id, media.variants || [], {
        userId: input.userId,
        organisationId: input.organisationId,
        userRole: input.userRole,
      });

      return {
        mediaId: media.id,
        mediaType: media.mediaType,
        thumbnailUrl: urls.thumbnailUrl || urls.previewUrl || urls.originalUrl,
        previewUrl: urls.previewUrl,
        eventId: entry.event.id,
        eventName: entry.event.name,
        eventSlug: entry.event.slug,
        albumId: media.album?.id,
        albumName: media.album?.name,
        albumSlug: media.album?.slug,
        createdAt: media.createdAt.toISOString(),
        matchConfidenceCategory: entry.confidenceCategory,
      };
    })
  );

  // 9. Audit log search operation (Without recording face vectors)
  await prisma.auditLog.create({
    data: {
      organisationId: input.organisationId,
      actorUserId: input.userId,
      action: 'FACE_SEARCH_PERFORMED',
      resourceType: 'FACE_SEARCH',
      resourceId: profile.id,
      metadata: {
        totalMatchesFound: scoredMatches.size,
        returnedCount: items.length,
        eventFilter: input.eventId || null,
        albumFilter: input.albumId || null,
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  return {
    items,
    totalMatches: scoredMatches.size,
    hasMore,
    nextCursor,
  };
}
