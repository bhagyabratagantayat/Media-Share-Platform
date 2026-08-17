import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { OfficialMediaService } from '@/server/media/official-service';
import { handleApiError, NotFoundError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const body = await request.json();

    const result = await OfficialMediaService.bulkAssignAlbum({
      organisationId: org.id,
      eventId: body.eventId,
      albumId: body.albumId || null,
      mediaIds: body.mediaIds || [],
      userId: user.userId,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully updated album for ${result.assignedCount} media item(s).`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
