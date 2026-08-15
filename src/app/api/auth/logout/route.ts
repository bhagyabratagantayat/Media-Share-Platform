import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/prisma';
import { getSessionUser, AUTH_COOKIE_NAME } from '@/server/auth/session';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    const ip = req.headers.get('x-forwarded-for') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    if (session) {
      await prisma.auditLog.create({
        data: {
          actorUserId: session.userId,
          action: 'USER_LOGOUT',
          resourceType: 'USER',
          resourceId: session.userId,
          ipAddress: ip,
          userAgent,
        },
      });
    }

    const response = successResponse({ message: 'Successfully logged out.' });
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
