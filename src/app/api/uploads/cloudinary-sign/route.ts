import { NextRequest } from 'next/server';
import { requireSessionUser } from '@/server/auth/session';
import { cloudinary } from '@/lib/cloudinary';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const session = await requireSessionUser();
    const body = await req.json().catch(() => ({}));
    const { folder = 'media-share-uploads', public_id } = body;

    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign: Record<string, any> = {
      timestamp,
      folder,
    };

    if (public_id) {
      paramsToSign.public_id = public_id;
    }

    const apiSecret = process.env.CLOUDINARY_API_SECRET || 'oKk-BtSMAYh2ndLABZn_Fbyb4tg';
    const apiKey = process.env.CLOUDINARY_API_KEY || '769223324249544';
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'bbty6ctr';

    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return successResponse({
      signature,
      timestamp,
      apiKey,
      cloudName,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      userId: session.userId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
