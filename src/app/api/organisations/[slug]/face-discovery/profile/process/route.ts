import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { requireSessionUser } from '@/server/auth/session';
import { processSelfie } from '@/server/face/profile-service';
import { getStorageProvider } from '@/server/storage';
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

    const contentType = request.headers.get('content-type') || '';
    let imageBuffer: Buffer;
    let tempStorageKey: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'No file provided in form data' } },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      const body = await request.json().catch(() => ({}));
      if (body.storageKey) {
        tempStorageKey = body.storageKey;
        // Verify key format belongs to this user and organisation
        const expectedPrefix = `biometric/organisations/${org.id}/users/${user.userId}/`;
        if (!tempStorageKey!.startsWith(expectedPrefix)) {
          return NextResponse.json(
            { success: false, error: { code: 'FORBIDDEN', message: 'Invalid storage key prefix' } },
            { status: 403 }
          );
        }

        const storage = getStorageProvider();
        imageBuffer = await storage.getObject(tempStorageKey!);
      } else if (body.imageBase64) {
        const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        return NextResponse.json(
          { success: false, error: { code: 'BAD_REQUEST', message: 'Must provide file, storageKey, or imageBase64' } },
          { status: 400 }
        );
      }
    }

    const result = await processSelfie({
      userId: user.userId,
      organisationId: org.id,
      imageBuffer,
      tempStorageKey,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
