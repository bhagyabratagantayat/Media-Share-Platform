import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, revokeAllOrganisationSessions } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);

    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await revokeAllOrganisationSessions(
      org.id,
      session.userId,
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse({
      message: 'All organisation access sessions have been revoked.',
      accessVersion: result.accessVersion,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
