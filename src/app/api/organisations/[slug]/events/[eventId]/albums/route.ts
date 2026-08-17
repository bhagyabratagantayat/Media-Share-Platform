import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { listAlbumsByEvent, createAlbum } from '@/server/albums/service';
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

    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const albums = await listAlbumsByEvent(params.eventId, userRole, hasOrgAccess, includeArchived);

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

    const album = await createAlbum({
      organisationId: org.id,
      eventId: params.eventId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      coverMediaId: body.coverMediaId,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      status: body.status,
      visibility: body.visibility,
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
