import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import {
  getOrganisationBySlug,
  updateMemberRole,
  removeMember,
} from '@/server/organisations/service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { NotFoundError } from '@/lib/errors';
import { RoleType } from '@/server/permissions/roles';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { slug: string; memberId: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);
    const body = await req.json();

    // Resolve target member
    const member = await prisma.organisationMember.findFirst({
      where: {
        organisationId: org.id,
        OR: [{ id: params.memberId }, { userId: params.memberId }],
      },
    });

    if (!member) {
      throw new NotFoundError('Member record not found in this organisation.');
    }

    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const updated = await updateMemberRole(
      org.id,
      session.userId,
      member.userId,
      body.role as RoleType,
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { slug: string; memberId: string } }
) {
  try {
    const session = await requireSessionUser();
    const org = await getOrganisationBySlug(params.slug);

    // Resolve target member
    const member = await prisma.organisationMember.findFirst({
      where: {
        organisationId: org.id,
        OR: [{ id: params.memberId }, { userId: params.memberId }],
      },
    });

    if (!member) {
      throw new NotFoundError('Member record not found in this organisation.');
    }

    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await removeMember(
      org.id,
      session.userId,
      member.userId,
      session.isPlatformAdmin,
      ip,
      userAgent
    );

    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
