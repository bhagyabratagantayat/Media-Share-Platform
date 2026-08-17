import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { reorderAlbums } from '@/server/albums/service';
import { requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string; eventId: string } }
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
    if (!body.orderedAlbumIds || !Array.isArray(body.orderedAlbumIds)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'orderedAlbumIds array is required.' } },
        { status: 400 }
      );
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
