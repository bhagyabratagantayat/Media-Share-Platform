import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getOrganisationAuthContext } from '@/server/auth/session';
import { GallerySearchService } from '@/server/gallery/service';
import { handleApiError, NotFoundError } from '@/lib/errors';

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

    const { userRole } = await getOrganisationAuthContext(org.id);

    const summary = await GallerySearchService.getEventGallerySummary(
      org.id,
      params.eventId,
      userRole || undefined
    );

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
