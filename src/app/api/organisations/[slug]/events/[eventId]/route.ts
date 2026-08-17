import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getEventById, updateEvent } from '@/server/events/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string; eventId: string } }
) {
  try {
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

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(org.id);

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

    const updated = await updateEvent(params.eventId, user.userId, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      category: body.category,
      startDate: body.startDate,
      endDate: body.endDate,
      eventDate: body.eventDate || body.startDate,
      startTime: body.startTime,
      endTime: body.endTime,
      location: body.location,
      status: body.status,
      visibility: body.visibility,
      isFeatured: body.isFeatured,
      allowUserUploads: body.allowUserUploads,
      allowDownloads: body.allowDownloads,
      allowOriginalDownloads: body.allowOriginalDownloads,
      allowBulkDownloads: body.allowBulkDownloads,
      faceSearchEnabled: body.faceSearchEnabled,
      coverMediaId: body.coverMediaId,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Event updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
