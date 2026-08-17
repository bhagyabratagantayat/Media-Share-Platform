import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser, getOrganisationAuthContext } from '@/server/auth/session';
import { getOrganisationFaceStats } from '@/server/face/media-indexing-service';
import { canViewFaceAdminStats } from '@/server/permissions/face-guards';
import { handleApiError } from '@/lib/errors';
import { ROLES } from '@/server/permissions/roles';

export async function GET(
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

    const { userRole } = await getOrganisationAuthContext(org.id);

    if (!userRole || !canViewFaceAdminStats(userRole)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only organisation administrators can view face analytics' } },
        { status: 403 }
      );
    }

    const stats = await getOrganisationFaceStats(org.id);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
