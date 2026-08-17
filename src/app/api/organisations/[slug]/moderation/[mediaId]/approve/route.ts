import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { ModerationService } from '@/server/media/moderation-service';
import { handleApiError, NotFoundError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; mediaId: string } }
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

    const body = await request.json().catch(() => ({}));

    const result = await ModerationService.approveMedia({
      organisationId: org.id,
      mediaId: params.mediaId,
      actorUserId: user.userId,
      note: body.note,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Media successfully approved.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
