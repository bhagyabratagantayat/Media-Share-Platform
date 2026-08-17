import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getEventById, updateEvent, archiveEvent } from '@/server/events/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const rawEvent = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { organisationId: true },
    });

    if (!rawEvent) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 }
      );
    }

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(rawEvent.organisationId);

    const event = await getEventById(params.eventId, userRole, hasOrgAccess);

    return NextResponse.json({
      success: true,
      data: event,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();

    const updated = await updateEvent(params.eventId, user.userId, body);

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Event updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const user = await requireSessionUser();

    const archived = await archiveEvent(params.eventId, user.userId);

    return NextResponse.json({
      success: true,
      data: archived,
      message: 'Event archived successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
