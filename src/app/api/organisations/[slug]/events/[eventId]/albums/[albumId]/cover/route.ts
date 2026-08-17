import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { setAlbumCoverFromMedia } from '@/server/albums/service';
import { requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; eventId: string; albumId: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organisation not found.' } },
        { status: 404 }
      );
    }

    const body = await request.json();
    if (!body.mediaId) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'mediaId is required.' } },
        { status: 400 }
      );
    }

    const album = await setAlbumCoverFromMedia(params.albumId, user.userId, body.mediaId);

    return NextResponse.json({
      success: true,
      data: album,
      message: 'Album cover updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
