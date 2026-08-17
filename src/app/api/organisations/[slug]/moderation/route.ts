import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { ModerationService } from '@/server/media/moderation-service';
import { handleApiError, NotFoundError } from '@/lib/errors';

export async function GET(
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

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || undefined) as any;
    const mediaType = (searchParams.get('mediaType') || undefined) as any;
    const eventId = searchParams.get('eventId') || undefined;
    const uploaderId = searchParams.get('uploaderId') || undefined;
    const search = searchParams.get('search') || undefined;
    const sortBy = (searchParams.get('sortBy') || 'newest') as 'newest' | 'oldest';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await ModerationService.getModerationQueue({
      organisationId: org.id,
      actorUserId: user.userId,
      status,
      mediaType,
      eventId,
      uploaderId,
      search,
      sortBy,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
