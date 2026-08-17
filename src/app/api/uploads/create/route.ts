import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { createUploadSession } from '@/server/uploads/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await req.json();

    const result = await createUploadSession({
      organisationId: body.organisationId,
      eventId: body.eventId,
      albumId: body.albumId || null,
      userId: user.userId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: Number(body.fileSize),
      visibility: body.visibility,
      forceMultipart: body.forceMultipart,
    });

    return successResponse(result, undefined, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
