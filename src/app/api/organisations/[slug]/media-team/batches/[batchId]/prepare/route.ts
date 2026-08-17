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
    let limit: number | undefined;

    try {
      const body = await request.json();
      if (body.limit && typeof body.limit === 'number') {
        limit = body.limit;
      }
    } catch {
      // Body optional
    }

    const result = await BatchService.prepareBatchChunk(params.batchId, user.userId, limit);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
