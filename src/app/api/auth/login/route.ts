import { NextRequest } from 'next/server';
import { loginUser } from '@/server/auth/service';
import { checkRateLimit, RATE_LIMITS } from '@/server/auth/rate-limit';
import { successResponse, errorResponse } from '@/lib/api-response';
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from '@/server/auth/session';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    checkRateLimit(`login:${ip}`, RATE_LIMITS.LOGIN);

    const body = await req.json();
    const userAgent = req.headers.get('user-agent') || undefined;

    const { user, sessionToken } = await loginUser({
      email: body.email,
      password: body.password,
      ipAddress: ip,
      userAgent,
    });

    const response = successResponse({ user });
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, COOKIE_OPTIONS);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
