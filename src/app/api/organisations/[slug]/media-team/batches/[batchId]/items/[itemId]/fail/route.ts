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
    let errorCode = 'UPLOAD_FAILED';
    let errorMessage = 'Direct upload to storage failed.';

    try {
      const body = await request.json();
      if (body.errorCode) errorCode = body.errorCode;
      if (body.errorMessage) errorMessage = body.errorMessage;
    } catch {
      // Use defaults
    }

    const item = await BatchService.failBatchItem(
      params.batchId,
      params.itemId,
      user.userId,
      errorCode,
      errorMessage
    );

    return NextResponse.json({
      success: true,
      data: item,
      message: 'Batch item marked as failed.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
