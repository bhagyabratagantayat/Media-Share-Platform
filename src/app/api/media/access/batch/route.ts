import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { MediaAccessService } from '@/server/cdn/media-access-service';
import { prisma } from '@/server/db/prisma';
import { handleApiError, BadRequestError } from '@/lib/errors';
import { verifyOrgAccessPassToken } from '@/server/auth/token';
import { RoleType } from '@/server/permissions/roles';

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const body = await req.json();

    if (!body || !Array.isArray(body.mediaIds)) {
      throw new BadRequestError('mediaIds must be an array of media IDs.');
    }

    const { mediaIds, organisationId, variant } = body;

    let userRole: RoleType | null = null;
    let hasOrgAccess = false;

    if (organisationId) {
      if (user) {
        if (user.isPlatformAdmin) {
          userRole = 'PLATFORM_ADMIN';
          hasOrgAccess = true;
        } else {
          const member = await prisma.organisationMember.findUnique({
            where: {
              unique_organisation_user: {
                organisationId,
                userId: user.userId,
              },
            },
          });
          if (member && member.status === 'ACTIVE') {
            userRole = member.role as RoleType;
            hasOrgAccess = true;
          }
        }
      }

      if (!hasOrgAccess) {
        const passCookie = req.cookies.get(`media_org_pass_${organisationId}`);
        if (passCookie?.value) {
          const settings = await prisma.organisationAccessSettings.findUnique({
            where: { organisationId },
            select: { accessVersion: true },
          });
          if (settings) {
            const isValid = await verifyOrgAccessPassToken(
              passCookie.value,
              organisationId,
              settings.accessVersion
            );
            if (isValid) {
              hasOrgAccess = true;
            }
          }
        }
      }
    }

    const items = await MediaAccessService.getBatchMediaAccess({
      mediaIds,
      variant,
      userId: user?.userId,
      userRole,
      hasOrgAccess,
      organisationId,
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        count: items.length,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
