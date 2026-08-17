import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { abortUploadSession } from '@/server/uploads/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const session = await abortUploadSession(params.id, user.userId);
    return successResponse({ aborted: true, session });
  } catch (error) {
    return errorResponse(error);
  }
}
