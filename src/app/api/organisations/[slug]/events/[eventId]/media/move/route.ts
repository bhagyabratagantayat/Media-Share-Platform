import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { moveMediaToAlbum, moveMediaToEvent } from '@/server/albums/service';
import { requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function POST(
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

    if (!body.mediaIds || !Array.isArray(body.mediaIds) || body.mediaIds.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'mediaIds array is required.' } },
        { status: 400 }
      );
    }

    // Check if this is a cross-event move or intra-event album move
    if (body.targetEventId && body.targetEventId !== params.eventId) {
      const result = await moveMediaToEvent({
        organisationId: org.id,
        sourceEventId: params.eventId,
        targetEventId: body.targetEventId,
        targetAlbumId: body.targetAlbumId || null,
        mediaIds: body.mediaIds,
        userId: user.userId,
      });

      return NextResponse.json({
        success: true,
        data: result,
        message: `Successfully moved ${result.updatedCount} media items to target event.`,
      });
    }

    // Intra-event move to target album (or unassigned/null)
    const result = await moveMediaToAlbum({
      organisationId: org.id,
      eventId: params.eventId,
      targetAlbumId: body.targetAlbumId !== undefined ? body.targetAlbumId : null,
      mediaIds: body.mediaIds,
      userId: user.userId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully updated album assignment for ${result.updatedCount} media items.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
