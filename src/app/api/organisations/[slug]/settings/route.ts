import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, updateOrganisationSettings } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);
    const body = await req.json();

    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const updated = await updateOrganisationSettings(
      org.id,
      session.userId,
      {
        name: body.name,
        description: body.description,
        officialEmail: body.officialEmail,
        contactPhone: body.contactPhone,
        country: body.country,
        state: body.state,
        city: body.city,
        website: body.website,
        privacy: body.privacy,
        allowOriginalDownloads: body.allowOriginalDownloads,
        allowVideoDownloads: body.allowVideoDownloads,
        allowPhotoDownloads: body.allowPhotoDownloads,
        allowBulkDownloads: body.allowBulkDownloads,
      },
      ip,
      userAgent
    );

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
