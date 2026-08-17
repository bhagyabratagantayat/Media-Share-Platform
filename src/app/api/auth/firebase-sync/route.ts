import { NextRequest, NextResponse } from 'next/server';
import { signUserSessionToken } from '@/server/auth/token';
import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from '@/server/auth/session';
import { prisma } from '@/server/db/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uid, email, displayName, photoURL } = body;

    if (!uid || !email) {
      return NextResponse.json(
        { success: false, error: { message: 'Firebase UID and email are required.' } },
        { status: 400 }
      );
    }

    const name = displayName || email.split('@')[0];
    const normalizedEmail = email.toLowerCase().trim();

    // Try optional sync to Prisma PostgreSQL if available (never block if DB is offline)
    try {
      await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name,
          avatarUrl: photoURL || null,
          lastLoginAt: new Date(),
        },
        create: {
          id: uid,
          email: normalizedEmail,
          name,
          passwordHash: 'FIREBASE_AUTH_MANAGED',
          avatarUrl: photoURL || null,
          status: 'ACTIVE',
        },
      });
    } catch {
      // Postgres silent fallback
    }

    // Generate signed user session token
    const sessionToken = await signUserSessionToken({
      userId: uid,
      email: normalizedEmail,
      isPlatformAdmin: false,
    });

    const response = NextResponse.json({
      success: true,
      data: {
        user: {
          id: uid,
          name,
          email: normalizedEmail,
          avatarUrl: photoURL || null,
          isPlatformAdmin: false,
        },
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, COOKIE_OPTIONS);
    return response;
  } catch (err: any) {
    console.error('Firebase Sync Error:', err);
    return NextResponse.json(
      { success: false, error: { message: err?.message || 'Session synchronization failed.' } },
      { status: 500 }
    );
  }
}
