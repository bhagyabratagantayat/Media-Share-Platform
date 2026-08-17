import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { listMediaByEvent } from '@/server/media/service';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const album = await prisma.album.findUnique({
      where: { id: params.albumId },
      select: { id: true, eventId: true, organisationId: true },
    });

    if (!album) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Album not found.' } },
        { status: 404 }
      );
    }

    const { user, userRole, hasOrgAccess } = await getOrganisationAuthContext(album.organisationId);

    const { searchParams } = new URL(request.url);
    const mediaType = (searchParams.get('mediaType') as any) || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 24;

    const result = await listMediaByEvent({
      eventId: album.eventId,
      albumId: album.id,
      mediaType,
      cursor,
      limit,
      userRole,
      hasOrgAccess,
      userId: user?.userId,
    });

    const serializedItems = result.items.map((item) => ({
      ...item,
      fileSize: Number(item.fileSize),
    }));

    return NextResponse.json({
      success: true,
      data: serializedItems,
      meta: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
