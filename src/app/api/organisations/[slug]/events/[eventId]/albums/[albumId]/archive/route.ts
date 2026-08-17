import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { archiveAlbum } from '@/server/albums/service';
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

    const album = await archiveAlbum(params.albumId, user.userId);

    return NextResponse.json({
      success: true,
      data: album,
      message: 'Album archived successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
