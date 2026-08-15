import { NextRequest } from 'next/server';
import { requestPasswordReset } from '@/server/auth/service';
import { checkRateLimit, RATE_LIMITS } from '@/server/auth/rate-limit';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    checkRateLimit(`forgot-password:${ip}`, RATE_LIMITS.FORGOT_PASSWORD);

    const body = await req.json();
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await requestPasswordReset(body.email, ip, userAgent);
    return successResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
