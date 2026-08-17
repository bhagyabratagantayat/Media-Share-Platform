import { NextRequest, NextResponse } from 'next/server';
import { reorderAlbums } from '@/server/albums/service';
import { requireSessionUser } from '@/server/auth/session';
import { handleApiError, BadRequestError } from '@/lib/errors';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();

    if (!Array.isArray(body.orderedAlbumIds)) {
      throw new BadRequestError('orderedAlbumIds must be an array of album ID strings.');
    }

    await reorderAlbums(params.eventId, user.userId, body.orderedAlbumIds);

    return NextResponse.json({
      success: true,
      message: 'Albums reordered successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
