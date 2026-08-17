import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { listEvents, createEvent } from '@/server/events/service';
import { getOrganisationAuthContext, requireSessionUser } from '@/server/auth/session';
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
    const search = searchParams.get('search') || undefined;
    const status = (searchParams.get('status') as any) || undefined;
    const visibility = (searchParams.get('visibility') as any) || undefined;
    const category = (searchParams.get('category') as any) || undefined;
    const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
    const timeFrame = (searchParams.get('timeFrame') as any) || undefined;
    const isFeatured = searchParams.get('isFeatured') === 'true' ? true : searchParams.get('isFeatured') === 'false' ? false : undefined;
    const sortBy = (searchParams.get('sortBy') as any) || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 12;

    const result = await listEvents({
      organisationId: org.id,
      search,
      status,
      visibility,
      category,
      year,
      timeFrame,
      isFeatured,
      sortBy,
      dateFrom,
      dateTo,
      cursor,
      limit,
      userRole,
      hasOrgAccess,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      meta: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

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

    const body = await request.json();

    const event = await createEvent({
      organisationId: org.id,
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
      coverMediaId: body.coverMediaId,
      status: body.status,
      visibility: body.visibility,
      isFeatured: body.isFeatured,
      allowUserUploads: body.allowUserUploads,
      allowDownloads: body.allowDownloads,
      allowOriginalDownloads: body.allowOriginalDownloads,
      allowBulkDownloads: body.allowBulkDownloads,
      faceSearchEnabled: body.faceSearchEnabled,
      createdByUserId: user.userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: event,
        message: 'Event created successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
