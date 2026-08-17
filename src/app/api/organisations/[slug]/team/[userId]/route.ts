import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { TeamService } from '@/server/team/service';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { Role } from '@prisma/client';

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string; userId: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    const body = await request.json();

    const updated = await TeamService.updateTeamRole({
      organisationId: org.id,
      targetUserId: params.userId,
      newRole: body.role as Role,
      actorUserId: user.userId,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Team member role updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string; userId: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    await TeamService.removeTeamMember({
      organisationId: org.id,
      targetUserId: params.userId,
      actorUserId: user.userId,
    });

    return NextResponse.json({
      success: true,
      message: 'Team member removed from media team.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
