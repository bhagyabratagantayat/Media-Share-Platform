import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; batchId: string } }
) {
  try {
    const user = await requireSessionUser();

    const batch = await BatchService.retryBatch(params.batchId, user.userId);

    return NextResponse.json({
      success: true,
      data: batch,
      message: 'All failed/cancelled batch items reset for retry.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
