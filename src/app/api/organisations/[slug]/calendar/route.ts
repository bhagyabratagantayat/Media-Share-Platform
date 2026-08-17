import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getEventCalendar } from '@/server/events/service';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
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
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;

    const calendar = await getEventCalendar(org.id, year, userRole, hasOrgAccess);

    return NextResponse.json({
      success: true,
      data: calendar,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
