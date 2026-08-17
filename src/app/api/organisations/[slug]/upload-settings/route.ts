import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { checkRolePermission, PERMISSIONS } from '@/server/permissions/permissions';
import { RoleType, ROLES } from '@/server/permissions/roles';
import { handleApiError, NotFoundError, ForbiddenError, BadRequestError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        allowUserUploads: true,
        requireUserUploadApproval: true,
        allowUserVideoUploads: true,
        allowUserPhotoUploads: true,
        autoPublishUserUploads: true,
        maxUserFilesPerBatch: true,
        maxUserImageSize: true,
        maxUserVideoSize: true,
        maxUserUploadsPerDay: true,
        autoPublishOfficialMedia: true,
      },
    });

    if (!org) {
      throw new NotFoundError('Organisation not found.');
    }

    return NextResponse.json({
      success: true,
      data: {
        ...org,
        maxUserImageSize: Number(org.maxUserImageSize),
        maxUserVideoSize: Number(org.maxUserVideoSize),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
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

    // Check admin permissions
    const sessionUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { isPlatformAdmin: true },
    });

    let userRole: RoleType = ROLES.USER;
    if (sessionUser?.isPlatformAdmin) {
      userRole = ROLES.PLATFORM_ADMIN;
    } else {
      const member = await prisma.organisationMember.findUnique({
        where: {
          unique_organisation_user: {
            organisationId: org.id,
            userId: user.userId,
          },
        },
      });

      if (!member || member.status !== 'ACTIVE') {
        throw new ForbiddenError('Active organisation membership required.');
      }
      userRole = member.role as RoleType;
    }

    if (!checkRolePermission(userRole, PERMISSIONS.ORG_UPDATE)) {
      throw new ForbiddenError('You do not have permission to modify organisation settings.');
    }

    const body = await request.json().catch(() => ({}));
    const updateData: any = {};

    if (typeof body.allowUserUploads === 'boolean') updateData.allowUserUploads = body.allowUserUploads;
    if (typeof body.requireUserUploadApproval === 'boolean') updateData.requireUserUploadApproval = body.requireUserUploadApproval;
    if (typeof body.allowUserVideoUploads === 'boolean') updateData.allowUserVideoUploads = body.allowUserVideoUploads;
    if (typeof body.allowUserPhotoUploads === 'boolean') updateData.allowUserPhotoUploads = body.allowUserPhotoUploads;
    if (typeof body.autoPublishUserUploads === 'boolean') updateData.autoPublishUserUploads = body.autoPublishUserUploads;
    if (typeof body.autoPublishOfficialMedia === 'boolean') updateData.autoPublishOfficialMedia = body.autoPublishOfficialMedia;

    if (body.maxUserFilesPerBatch !== undefined) {
      const val = parseInt(body.maxUserFilesPerBatch, 10);
      if (isNaN(val) || val < 1 || val > 200) {
        throw new BadRequestError('maxUserFilesPerBatch must be between 1 and 200.');
      }
      updateData.maxUserFilesPerBatch = val;
    }

    if (body.maxUserUploadsPerDay !== undefined) {
      const val = parseInt(body.maxUserUploadsPerDay, 10);
      if (isNaN(val) || val < 1 || val > 5000) {
        throw new BadRequestError('maxUserUploadsPerDay must be between 1 and 5000.');
      }
      updateData.maxUserUploadsPerDay = val;
    }

    if (body.maxUserImageSize !== undefined) {
      updateData.maxUserImageSize = BigInt(body.maxUserImageSize);
    }

    if (body.maxUserVideoSize !== undefined) {
      updateData.maxUserVideoSize = BigInt(body.maxUserVideoSize);
    }

    const updated = await prisma.organisation.update({
      where: { id: org.id },
      data: updateData,
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        organisationId: org.id,
        actorUserId: user.userId,
        action: 'ORG_UPLOAD_SETTINGS_UPDATED',
        resourceType: 'ORGANISATION',
        resourceId: org.id,
        metadata: body,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        maxUserImageSize: Number(updated.maxUserImageSize),
        maxUserVideoSize: Number(updated.maxUserVideoSize),
      },
      message: 'Upload settings updated successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
