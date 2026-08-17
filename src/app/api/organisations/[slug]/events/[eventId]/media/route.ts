import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { GallerySearchService } from '@/server/gallery/service';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { MediaType } from '@prisma/client';

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
      throw new NotFoundError('Organisation not found.');
    }

    const auth = await getOrganisationAuthContext(org.id);

    const { searchParams } = new URL(request.url);
    const mediaType = (searchParams.get('mediaType') || undefined) as MediaType | undefined;
    const albumId = searchParams.get('albumId') || undefined;
    const search = searchParams.get('search') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const sort = (searchParams.get('sort') || 'newest') as 'newest' | 'oldest';
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 40;

    const result = await GallerySearchService.getGalleryMedia({
      organisationId: org.id,
      eventId: params.eventId,
      albumId,
      userId: auth.user?.userId,
      userRole: auth.userRole || undefined,
      mediaType,
      search,
      startDate,
      endDate,
      sort,
      cursor,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
