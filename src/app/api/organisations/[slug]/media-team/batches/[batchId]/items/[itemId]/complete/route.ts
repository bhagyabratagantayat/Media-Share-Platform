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
    let parts: { partNumber: number; etag: string }[] | undefined;

    try {
      const body = await request.json();
      if (body.parts && Array.isArray(body.parts)) {
        parts = body.parts;
      }
    } catch {
      // Body optional for single PUT
    }

    const item = await BatchService.completeBatchItem(
      params.batchId,
      params.itemId,
      user.userId,
      parts
    );

    return NextResponse.json({
      success: true,
      data: item,
      message: 'Batch item upload completed successfully.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
