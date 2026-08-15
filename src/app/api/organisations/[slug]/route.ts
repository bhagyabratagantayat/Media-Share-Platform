import { NextRequest } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSessionUser();
    const org = await getOrganisationBySlug(params.slug, session?.userId);
    return successResponse(org);
  } catch (error) {
    return errorResponse(error);
  }
}
