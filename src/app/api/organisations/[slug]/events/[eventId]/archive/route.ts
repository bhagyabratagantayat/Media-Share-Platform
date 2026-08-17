import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { archiveEvent } from '@/server/events/service';
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

    const event = await archiveEvent(params.eventId, user.userId);

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event archived successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
