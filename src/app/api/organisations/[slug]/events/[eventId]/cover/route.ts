import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { setEventCoverFromMedia } from '@/server/events/service';
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
    if (!body.mediaId) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'mediaId is required.' } },
        { status: 400 }
      );
    }

    const event = await setEventCoverFromMedia(params.eventId, user.userId, body.mediaId);

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event cover updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
