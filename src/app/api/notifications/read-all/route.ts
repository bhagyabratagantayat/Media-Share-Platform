import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { NotificationService } from '@/server/notifications/service';
import { handleApiError } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();

    await NotificationService.markAllAsRead(user.userId);

    return NextResponse.json({
      success: true,
      message: 'All notifications marked as read.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
