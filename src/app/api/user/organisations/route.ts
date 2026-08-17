import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getUserOrganisations } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionUser();
    const organisations = await getUserOrganisations(session.userId);
    return successResponse(organisations);
  } catch (error) {
    return errorResponse(error);
  }
}
