import { NextRequest } from 'next/server';
import { getSessionUser, ORG_PASS_COOKIE_PREFIX, COOKIE_OPTIONS } from '@/server/auth/session';
import { getOrganisationBySlug, verifyAndGrantOrganisationAccess } from '@/server/organisations/service';
import { checkRateLimit, RATE_LIMITS } from '@/server/auth/rate-limit';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await getSessionUser();
    const org = await getOrganisationBySlug(params.slug);

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    checkRateLimit(`org-pass:${org.id}:${ip}`, RATE_LIMITS.ORG_ACCESS_PASS);

    const body = await req.json();
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await verifyAndGrantOrganisationAccess(
      org.id,
      body.password,
      session?.userId,
      ip,
      userAgent
    );

    const response = successResponse({
      accessGranted: true,
      passToken: result.passToken,
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
    });

    // Set scoped organisation pass cookie
    response.cookies.set(
      `${ORG_PASS_COOKIE_PREFIX}${org.id}`,
      result.passToken,
      {
        ...COOKIE_OPTIONS,
        maxAge: 24 * 60 * 60, // 24 hours
      }
    );

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
