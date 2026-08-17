import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { requestSelfieUploadUrl } from '@/server/face/profile-service';
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

    const uploadInfo = await requestSelfieUploadUrl(user.userId, org.id);

    return NextResponse.json({
      success: true,
      data: uploadInfo,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
