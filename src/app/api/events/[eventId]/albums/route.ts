import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { listAlbumsByEvent, createAlbum } from '@/server/albums/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { organisationId: true },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 }
      );
    }

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(event.organisationId);

    const albums = await listAlbumsByEvent(params.eventId, userRole, hasOrgAccess);

    return NextResponse.json({
      success: true,
      data: albums,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const user = await requireSessionUser();

    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
      select: { id: true, organisationId: true },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Event not found.' } },
        { status: 404 }
      );
    }

    const body = await request.json();

    const album = await createAlbum({
      organisationId: event.organisationId,
      eventId: event.id,
      name: body.name,
      slug: body.slug,
      description: body.description,
      coverMediaId: body.coverMediaId,
      sortOrder: body.sortOrder,
      status: body.status,
      createdByUserId: user.userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: album,
        message: 'Album created successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
