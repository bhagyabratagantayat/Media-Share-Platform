import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { ModerationService } from '@/server/media/moderation-service';
import { handleApiError, NotFoundError, BadRequestError } from '@/lib/errors';
import { RejectionReason } from '@prisma/client';

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

    if (!body.rejectionCode || !Object.values(RejectionReason).includes(body.rejectionCode)) {
      throw new BadRequestError(
        `Valid rejection code required. Available options: ${Object.values(RejectionReason).join(', ')}`
      );
    }

    const result = await ModerationService.rejectMedia({
      organisationId: org.id,
      mediaId: params.mediaId,
      actorUserId: user.userId,
      rejectionCode: body.rejectionCode,
      rejectionReason: body.rejectionReason,
      note: body.note,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Media successfully rejected.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
