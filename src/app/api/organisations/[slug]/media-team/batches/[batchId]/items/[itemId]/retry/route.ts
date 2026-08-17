import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { handleApiError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string; batchId: string; itemId: string } }
) {
  try {
    const user = await requireSessionUser();

    const item = await BatchService.retryBatchItem(
      params.batchId,
      params.itemId,
      user.userId
    );

    return NextResponse.json({
      success: true,
      data: item,
      message: 'Batch item reset for retry.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
