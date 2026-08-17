import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { enqueueMediaProcessingJob } from '@/server/queue/media-queue';
import { ROLES, RoleType } from '@/server/permissions/roles';
import { handleApiError, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/errors';
import { UploadType } from '@prisma/client';

export async function POST(
  _request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const user = await requireSessionUser();

    // 1. Fetch MediaItem
    const media = await prisma.mediaItem.findUnique({
      where: { id: params.mediaId },
      include: {
        event: { select: { organisationId: true } },
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    if (!media.originalStorageKey) {
      throw new BadRequestError('Media item does not have an original storage key to reprocess.');
    }

    // 2. Authorize staff / admin permissions
    let isAuthorized = user.isPlatformAdmin;
    if (!isAuthorized) {
      const member = await prisma.organisationMember.findUnique({
        where: {
          unique_organisation_user: {
            organisationId: media.organisationId,
            userId: user.userId,
          },
        },
      });

      if (
        member &&
        member.status === 'ACTIVE' &&
        ([ROLES.ORGANISATION_OWNER, ROLES.ORGANISATION_ADMIN, ROLES.MODERATOR] as string[]).includes(
          member.role
        )
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenError('You do not have permission to trigger media reprocessing.');
    }

    // 3. Increment processing version to bust previous caches and enforce fresh processing
    const nextVersion = (media.processingVersion || 1) + 1;

    const jobId = await enqueueMediaProcessingJob({
      mediaItemId: media.id,
      organisationId: media.organisationId,
      eventId: media.eventId,
      albumId: media.albumId,
      userId: user.userId,
      mediaType: media.mediaType,
      originalStorageKey: media.originalStorageKey,
      mimeType: media.mimeType,
      fileName: media.originalFileName,
      uploadType: UploadType.OFFICIAL,
      processingVersion: nextVersion,
    });

    return NextResponse.json({
      success: true,
      data: {
        mediaItemId: media.id,
        jobId,
        processingVersion: nextVersion,
        status: 'QUEUED',
      },
      message: 'Media successfully queued for reprocessing.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
