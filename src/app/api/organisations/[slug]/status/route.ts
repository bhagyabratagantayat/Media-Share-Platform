import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, updateOrganisationStatus } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { OrgStatus } from '@prisma/client';

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

    const updated = await updateOrganisationStatus(
      org.id,
      session.userId,
      body.status as OrgStatus,
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse({
      message: `Organisation status updated to ${updated.status}.`,
      organisation: updated,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
