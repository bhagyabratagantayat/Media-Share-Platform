import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, transferOrganisationOwnership } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);
    const body = await req.json();

    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await transferOrganisationOwnership(
      org.id,
      session.userId,
      body.targetUserId,
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse({
      message: 'Organisation ownership transferred successfully.',
      newOwner: result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
