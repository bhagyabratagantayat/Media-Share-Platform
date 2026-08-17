import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser, getOrganisationAuthContext } from '@/server/auth/session';
import { grantFaceDiscoveryConsent, getConsentStatus } from '@/server/face/consent-service';
import { handleApiError } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await requireSessionUser();

    const org = await prisma.organisation.findUnique({
      where: { slug: params.slug },
      select: { id: true, faceDiscoveryEnabled: true, facePrivacyPolicyUrl: true, facePrivacyContactEmail: true },
    });

    if (!org) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Organisation not found.' } },
        { status: 404 }
      );
    }

    const consentStatus = await getConsentStatus(user.userId, org.id);

    return NextResponse.json({
      success: true,
      data: {
        ...consentStatus,
        faceDiscoveryEnabled: org.faceDiscoveryEnabled,
        privacyPolicyUrl: org.facePrivacyPolicyUrl,
        privacyContactEmail: org.facePrivacyContactEmail,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const isMinor = !!body.isMinor;

    const consentRecord = await grantFaceDiscoveryConsent({
      userId: user.userId,
      organisationId: org.id,
      isMinor,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        consentId: consentRecord.id,
        status: consentRecord.status,
        consentVersion: consentRecord.consentVersion,
        consentedAt: consentRecord.consentedAt.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
