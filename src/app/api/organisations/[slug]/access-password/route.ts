import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, rotateOrganisationAccessPassword } from '@/server/organisations/service';
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

    const result = await rotateOrganisationAccessPassword(
      org.id,
      session.userId,
      body.newPassword,
      body.invalidateSessions ?? true,
      ip,
      userAgent
    );

    return successResponse({
      message: 'Access password updated successfully.',
      accessVersion: result.accessVersion,
      passwordChangedAt: result.passwordChangedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
