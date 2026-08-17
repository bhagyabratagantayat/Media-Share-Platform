import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getEventStats } from '@/server/events/service';
import { getOrganisationAuthContext } from '@/server/auth/session';
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

    const stats = await getEventStats(params.eventId, userRole, hasOrgAccess);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
