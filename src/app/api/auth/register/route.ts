import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/server/auth/service';
import { checkRateLimit, RATE_LIMITS } from '@/server/auth/rate-limit';
import { successResponse, errorResponse } from '@/lib/api-response';
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from '@/server/auth/session';

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    checkRateLimit(`register:${ip}`, RATE_LIMITS.REGISTER);

    const body = await req.json();
    const userAgent = req.headers.get('user-agent') || undefined;

    const { user, sessionToken } = await registerUser({
      name: body.name,
      email: body.email,
      password: body.password,
      confirmPassword: body.confirmPassword,
      ipAddress: ip,
      userAgent,
    });

    const response = successResponse({ user }, undefined, 201);
    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, COOKIE_OPTIONS);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
