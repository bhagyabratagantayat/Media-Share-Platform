import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { NotificationService } from '@/server/notifications/service';
import { handleApiError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await NotificationService.getUserNotifications(user.userId, page, limit);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
