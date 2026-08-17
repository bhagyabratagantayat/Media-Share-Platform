import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { GallerySearchService } from '@/server/gallery/service';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { MediaType } from '@prisma/client';

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
      throw new NotFoundError('Organisation not found.');
    }

    const auth = await getOrganisationAuthContext(org.id);

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';
    const mediaType = (searchParams.get('mediaType') || undefined) as MediaType | undefined;
    const eventId = searchParams.get('eventId') || undefined;
    const albumId = searchParams.get('albumId') || undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;
    const cursor = searchParams.get('cursor') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 30;

    const result = await GallerySearchService.searchOrganisation({
      organisationId: org.id,
      userId: auth.user?.userId,
      userRole: auth.userRole || undefined,
      query,
      mediaType,
      eventId,
      albumId,
      year,
      cursor,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
