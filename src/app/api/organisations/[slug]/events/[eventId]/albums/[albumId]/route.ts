import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getAlbumById, updateAlbum } from '@/server/albums/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string; eventId: string; albumId: string } }
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

    const album = await getAlbumById(params.albumId, userRole, hasOrgAccess);

    return NextResponse.json({
      success: true,
      data: album,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string; eventId: string; albumId: string } }
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

    const updated = await updateAlbum(params.albumId, user.userId, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      coverMediaId: body.coverMediaId,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
      status: body.status,
      visibility: body.visibility,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Album updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
