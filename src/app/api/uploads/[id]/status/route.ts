import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getUploadSessionStatus } from '@/server/uploads/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const result = await getUploadSessionStatus(params.id, user.userId);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
