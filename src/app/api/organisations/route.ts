import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { listOrganisations, createOrganisation } from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { OrgType, OrgPrivacy } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const type = (searchParams.get('type') as OrgType) || undefined;
    const city = searchParams.get('city') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '12', 10);

    const data = await listOrganisations({
      search,
      type,
      city,
      page,
      limit,
    });

    return successResponse(data.items, { pagination: data.pagination });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionUser();
    const body = await req.json();
    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const org = await createOrganisation({
      name: body.name,
      slug: body.slug,
      type: body.type,
      officialEmail: body.officialEmail,
      contactPhone: body.contactPhone,
      country: body.country,
      state: body.state,
      city: body.city,
      website: body.website,
      description: body.description,
      logoUrl: body.logoUrl,
      coverUrl: body.coverUrl,
      privacy: body.privacy as OrgPrivacy,
      initialOwnerUserId: session.userId,
      accessPassword: body.accessPassword,
      ipAddress: ip,
      userAgent,
    });

    return successResponse(org, undefined, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
