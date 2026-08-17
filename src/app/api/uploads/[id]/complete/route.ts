import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { completeUploadSession } from '@/server/uploads/service';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSessionUser();
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body may be empty for single PUT uploads
    }

    const session = await completeUploadSession({
      uploadSessionId: params.id,
      userId: user.userId,
      parts: body.parts,
    });

    return successResponse({ session });
  } catch (error) {
    return errorResponse(error);
  }
}
