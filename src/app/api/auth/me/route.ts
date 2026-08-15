import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { getUserProfile } from '@/server/auth/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSessionUser();
    const profile = await getUserProfile(session.userId);
    return successResponse(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
