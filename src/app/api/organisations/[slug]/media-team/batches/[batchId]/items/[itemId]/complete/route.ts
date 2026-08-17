import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { BatchService } from '@/server/batches/service';
import { successResponse, errorResponse } from '@/lib/api-response';

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

    return successResponse(item, undefined, 200);
  } catch (error) {
    return errorResponse(error);
  }
}
