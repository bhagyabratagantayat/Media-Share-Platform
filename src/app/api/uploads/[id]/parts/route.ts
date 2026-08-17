import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { generatePartUploadUrls } from '@/server/uploads/service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { BadRequestError } from '@/lib/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    const body = await req.json();

    if (!Array.isArray(body.partNumbers) || body.partNumbers.length === 0) {
      throw new BadRequestError('partNumbers must be a non-empty array of integers.');
    }

    const parts = await generatePartUploadUrls(params.id, user.userId, body.partNumbers);
    return successResponse({ parts });
  } catch (error) {
    return errorResponse(error);
  }
}
