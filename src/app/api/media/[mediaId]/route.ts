import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getMediaItemById, updateMediaMetadata, deleteMediaMetadata } from '@/server/media/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const rawMedia = await prisma.mediaItem.findUnique({
      where: { id: params.mediaId },
      select: { organisationId: true },
    });

    if (!rawMedia) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Media item not found.' } },
        { status: 404 }
      );
    }

    const { user, userRole, hasOrgAccess } = await getOrganisationAuthContext(rawMedia.organisationId);

    const media = await getMediaItemById(
      params.mediaId,
      userRole,
      hasOrgAccess,
      user?.userId
    );

    return NextResponse.json({
      success: true,
      data: {
        ...media,
        fileSize: Number(media.fileSize),
        originalFileSize: media.originalFileSize ? Number(media.originalFileSize) : null,
        optimizedFileSize: media.optimizedFileSize ? Number(media.optimizedFileSize) : null,
        variants: media.variants.map((v) => ({
          ...v,
          fileSize: Number(v.fileSize),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();

    const updated = await updateMediaMetadata(params.mediaId, user.userId, body);

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        fileSize: Number(updated.fileSize),
        originalFileSize: updated.originalFileSize ? Number(updated.originalFileSize) : null,
        optimizedFileSize: updated.optimizedFileSize ? Number(updated.optimizedFileSize) : null,
      },
      message: 'Media metadata updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const user = await requireSessionUser();

    const deleted = await deleteMediaMetadata(params.mediaId, user.userId);

    return NextResponse.json({
      success: true,
      data: {
        ...deleted,
        fileSize: Number(deleted.fileSize),
        originalFileSize: deleted.originalFileSize ? Number(deleted.originalFileSize) : null,
        optimizedFileSize: deleted.optimizedFileSize ? Number(deleted.optimizedFileSize) : null,
      },
      message: 'Media item marked as deleted.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
