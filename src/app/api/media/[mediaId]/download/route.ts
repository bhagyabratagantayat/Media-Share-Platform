import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { MediaAccessService } from '@/server/cdn/media-access-service';
import { prisma } from '@/server/db/prisma';
import { handleApiError, NotFoundError } from '@/lib/errors';
import { verifyOrgAccessPassToken } from '@/server/auth/token';
import { RoleType } from '@/server/permissions/roles';

export async function GET(
  req: NextRequest,
  { params }: { params: { mediaId: string } }
) {
  try {
    const user = await getSessionUser();
    const { searchParams } = new URL(req.url);
    const isOriginal = searchParams.get('isOriginal') === 'true' || searchParams.get('variant') === 'ORIGINAL';

    // Fetch media to determine its organisation and visibility
    const media = await prisma.mediaItem.findUnique({
      where: { id: params.mediaId },
      select: {
        id: true,
        organisationId: true,
        organisation: {
          select: {
            accessSettings: {
              select: {
                accessVersion: true,
              },
            },
          },
        },
      },
    });

    if (!media) {
      throw new NotFoundError('Media item not found.');
    }

    let userRole: RoleType | null = null;
    let hasOrgAccess = false;

    if (user) {
      if (user.isPlatformAdmin) {
        userRole = 'PLATFORM_ADMIN';
        hasOrgAccess = true;
      } else {
        const member = await prisma.organisationMember.findUnique({
          where: {
            unique_organisation_user: {
              organisationId: media.organisationId,
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
      const passCookie = req.cookies.get(`media_org_pass_${media.organisationId}`);
      if (passCookie?.value && media.organisation.accessSettings) {
        const isValid = await verifyOrgAccessPassToken(
          passCookie.value,
          media.organisationId,
          media.organisation.accessSettings.accessVersion
        );
        if (isValid) {
          hasOrgAccess = true;
        }
      }
    }

    const downloadResult = await MediaAccessService.getAuthorizedMediaDownload({
      mediaId: params.mediaId,
      isOriginal,
      userId: user?.userId,
      userRole,
      hasOrgAccess,
    });

    if (searchParams.get('redirect') === 'true') {
      return NextResponse.redirect(downloadResult.downloadUrl, {
        status: 302,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: downloadResult,
      message: 'Authorized download URL generated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
