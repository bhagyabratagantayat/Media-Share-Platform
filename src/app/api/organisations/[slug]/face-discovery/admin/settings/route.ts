import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser, getOrganisationAuthContext } from '@/server/auth/session';
import { updateOrganisationFaceSettings } from '@/server/face/media-indexing-service';
import { canManageFaceDiscovery } from '@/server/permissions/face-guards';
import { handleApiError } from '@/lib/errors';
import { ROLES } from '@/server/permissions/roles';

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
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organisation not found.' } },
        { status: 404 }
      );
    }

    const { userRole } = await getOrganisationAuthContext(org.id);

    if (!userRole || !canManageFaceDiscovery(userRole)) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Only organisation administrators can modify face settings' } },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const updated = await updateOrganisationFaceSettings({
      organisationId: org.id,
      userId: user.userId,
      userRole,
      settings: {
        faceDiscoveryEnabled: typeof body.faceDiscoveryEnabled === 'boolean' ? body.faceDiscoveryEnabled : undefined,
        allowFaceDiscoveryForMinors: typeof body.allowFaceDiscoveryForMinors === 'boolean' ? body.allowFaceDiscoveryForMinors : undefined,
        faceProfileRetentionDays: typeof body.faceProfileRetentionDays === 'number' ? body.faceProfileRetentionDays : undefined,
        temporaryFaceDataRetentionMinutes: typeof body.temporaryFaceDataRetentionMinutes === 'number' ? body.temporaryFaceDataRetentionMinutes : undefined,
        facePrivacyPolicyUrl: typeof body.facePrivacyPolicyUrl === 'string' ? body.facePrivacyPolicyUrl : undefined,
        facePrivacyContactEmail: typeof body.facePrivacyContactEmail === 'string' ? body.facePrivacyContactEmail : undefined,
        faceConsentVersion: typeof body.faceConsentVersion === 'string' ? body.faceConsentVersion : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        faceDiscoveryEnabled: updated.faceDiscoveryEnabled,
        allowFaceDiscoveryForMinors: updated.allowFaceDiscoveryForMinors,
        faceProfileRetentionDays: updated.faceProfileRetentionDays,
        temporaryFaceDataRetentionMinutes: updated.temporaryFaceDataRetentionMinutes,
        facePrivacyPolicyUrl: updated.facePrivacyPolicyUrl,
        facePrivacyContactEmail: updated.facePrivacyContactEmail,
        faceConsentVersion: updated.faceConsentVersion,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
