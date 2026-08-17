import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { NotificationService } from '@/server/notifications/service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();

    await NotificationService.markAsRead(params.id, user.userId);

    return NextResponse.json({
      success: true,
      message: 'Notification marked as read.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
