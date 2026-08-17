import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getAlbumById, updateAlbum, archiveAlbum } from '@/server/albums/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  _request: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const rawAlbum = await prisma.album.findUnique({
      where: { id: params.albumId },
      select: { organisationId: true },
    });

    if (!rawAlbum) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Album not found.' } },
        { status: 404 }
      );
    }

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(rawAlbum.organisationId);

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
  { params }: { params: { albumId: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();

    const updated = await updateAlbum(params.albumId, user.userId, body);

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Album updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { albumId: string } }
) {
  try {
    const user = await requireSessionUser();

    const archived = await archiveAlbum(params.albumId, user.userId);

    return NextResponse.json({
      success: true,
      data: archived,
      message: 'Album archived successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
