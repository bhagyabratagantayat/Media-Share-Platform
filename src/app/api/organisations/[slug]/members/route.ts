import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { getOrganisationBySlug, inviteOrAddMember } from '@/server/organisations/service';
import { requirePermission } from '@/server/permissions/guards';
import { PERMISSIONS } from '@/server/permissions/permissions';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);

    // Guard: Require TEAM_READ permission
    await requirePermission(session.userId, org.id, PERMISSIONS.TEAM_READ, session.isPlatformAdmin);

    const members = await prisma.organisationMember.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
    });

    return successResponse(members);
  } catch (error) {
    return errorResponse(error);
  }
}

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

    const newMember = await inviteOrAddMember(
      org.id,
      session.userId,
      {
        email: body.email,
        role: body.role,
      },
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse(newMember, undefined, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
