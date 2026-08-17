import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { restoreEvent } from '@/server/events/service';
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

    let targetStatus;
    try {
      const body = await request.json();
      targetStatus = body.targetStatus;
    } catch {
      // Empty body is valid, defaults to COMPLETED
    }

    const event = await restoreEvent(params.eventId, user.userId, targetStatus);

    return NextResponse.json({
      success: true,
      data: event,
      message: 'Event restored successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
