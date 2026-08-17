import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { handleApiError } from '@/lib/errors';
import { UploadBatchItemStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string; batchId: string } }
) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);

    const status = (searchParams.get('status') as UploadBatchItemStatus) || undefined;
    const search = searchParams.get('search') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;

    const result = await BatchService.getBatchDetails(
      {
        batchId: params.batchId,
        status,
        search,
        page,
        limit,
      },
      user.userId
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string; batchId: string } }
) {
  try {
    const user = await requireSessionUser();

    const cancelledBatch = await BatchService.cancelBatch(params.batchId, user.userId);

    return NextResponse.json({
      success: true,
      data: cancelledBatch,
      message: 'Upload batch cancelled successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
