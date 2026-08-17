import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { ModerationService } from '@/server/media/moderation-service';
import { handleApiError, NotFoundError, BadRequestError } from '@/lib/errors';
import { RejectionReason } from '@prisma/client';

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

    const body = await request.json().catch(() => ({}));

    if (!Array.isArray(body.mediaIds) || body.mediaIds.length === 0) {
      throw new BadRequestError('Array of mediaIds is required.');
    }

    if (!body.rejectionCode || !Object.values(RejectionReason).includes(body.rejectionCode)) {
      throw new BadRequestError(
        `Valid rejection code required. Available options: ${Object.values(RejectionReason).join(', ')}`
      );
    }

    const result = await ModerationService.bulkReject({
      organisationId: org.id,
      mediaIds: body.mediaIds,
      actorUserId: user.userId,
      rejectionCode: body.rejectionCode,
      rejectionReason: body.rejectionReason,
      note: body.note,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully rejected ${result.rejectedCount} media item(s).`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
