import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { requireSessionUser, ORG_PASS_COOKIE_PREFIX } from '@/server/auth/session';
import { getOrganisationBySlug, getOrganisationDashboard } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);

    // Retrieve pass token from cookie or Authorization header fallback
    const cookieStore = cookies();
    const passToken =
      cookieStore.get(`${ORG_PASS_COOKIE_PREFIX}${org.id}`)?.value ||
      req.headers.get('x-org-pass-token') ||
      undefined;

    const dashboard = await getOrganisationDashboard(params.slug, session.userId, passToken);
    return successResponse(dashboard);
  } catch (error) {
    return errorResponse(error);
  }
}
