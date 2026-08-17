import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { withdrawFaceDiscoveryConsent } from '@/server/face/consent-service';
import { handleApiError } from '@/lib/errors';

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

    const updatedConsent = await withdrawFaceDiscoveryConsent({
      userId: user.userId,
      organisationId: org.id,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: {
        consentId: updatedConsent.id,
        status: updatedConsent.status,
        withdrawnAt: updatedConsent.withdrawnAt?.toISOString(),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
