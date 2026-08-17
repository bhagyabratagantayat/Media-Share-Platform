import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser, getOrganisationAuthContext } from '@/server/auth/session';
import { searchUserPhotos } from '@/server/face/search-service';
import { handleApiError } from '@/lib/errors';
import { ROLES } from '@/server/permissions/roles';

export async function POST(
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
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organisation not found.' } },
        { status: 404 }
      );
    }

    const { userRole, hasOrgAccess } = await getOrganisationAuthContext(org.id);

    const body = await request.json().catch(() => ({}));
    const eventId = typeof body.eventId === 'string' ? body.eventId : undefined;
    const albumId = typeof body.albumId === 'string' ? body.albumId : undefined;
    const limit = typeof body.limit === 'number' ? body.limit : 20;
    const cursor = typeof body.cursor === 'string' ? body.cursor : undefined;

    const result = await searchUserPhotos({
      userId: user.userId,
      organisationId: org.id,
      userRole: userRole || ROLES.USER,
      hasOrgAccess,
      eventId,
      albumId,
      limit,
      cursor,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
