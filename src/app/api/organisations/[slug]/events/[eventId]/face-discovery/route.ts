import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser, getOrganisationAuthContext } from '@/server/auth/session';
import { toggleEventFaceDiscovery } from '@/server/face/media-indexing-service';
import { handleApiError } from '@/lib/errors';
import { ROLES } from '@/server/permissions/roles';

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

    const { userRole } = await getOrganisationAuthContext(org.id);

    if (!userRole) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;

    const updatedEvent = await toggleEventFaceDiscovery(
      org.id,
      params.eventId,
      enabled,
      user.userId,
      userRole
    );

    return NextResponse.json({
      success: true,
      data: {
        eventId: updatedEvent.id,
        faceSearchEnabled: updatedEvent.faceSearchEnabled,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
