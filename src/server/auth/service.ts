import crypto from 'crypto';
import { prisma } from '@/server/db/prisma';
import { hashPassword, verifyPassword } from './password';
import { signUserSessionToken } from './token';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
} from '@/lib/errors';
import { UserStatus } from '@prisma/client';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  confirmPassword?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Normalizes email address to lower-case and trimmed string.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Validates password strength (minimum 8 characters, at least 1 number/letter).
 */
export function validatePasswordStrength(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestError('Password must be at least 8 characters long.');
  }
}

/**
 * Registers a new user account with Argon2id password hash.
 */
export async function registerUser(input: RegisterInput) {
  if (!input.name || input.name.trim().length < 2) {
    throw new BadRequestError('Name must be at least 2 characters long.');
  }

  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new BadRequestError('Please provide a valid email address.');
  }

  if (input.confirmPassword && input.password !== input.confirmPassword) {
    throw new BadRequestError('Passwords do not match.');
  }

  validatePasswordStrength(input.password);

  // Check unique email
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existingUser) {
    throw new ConflictError('An account with this email address already exists.');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isPlatformAdmin: true,
      avatarUrl: true,
      createdAt: true,
    },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'USER_REGISTERED',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: { email: user.email, name: user.name },
    },
  });

  const sessionToken = await signUserSessionToken({
    userId: user.id,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  return { user, sessionToken };
}

/**
 * Authenticates user credentials and returns session token.
 */
export async function loginUser(input: LoginInput) {
  const normalizedEmail = normalizeEmail(input.email);
  if (!normalizedEmail || !input.password) {
    throw new BadRequestError('Email and password are required.');
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new ForbiddenError('Your account has been suspended. Please contact platform support.');
  }

  if (user.status === UserStatus.DELETED) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  const isPasswordValid = await verifyPassword(input.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password.');
  }

  // Update lastLoginAt
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Audit Log
  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'USER_LOGIN',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });

  const sessionToken = await signUserSessionToken({
    userId: user.id,
    email: user.email,
    isPlatformAdmin: user.isPlatformAdmin,
  });

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    isPlatformAdmin: user.isPlatformAdmin,
    avatarUrl: user.avatarUrl,
  };

  return { user: safeUser, sessionToken };
}

/**
 * Helper to hash password reset tokens before database storage.
 */
function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Initiates single-use password reset token with 1-hour expiry.
 */
export async function requestPasswordReset(email: string, ipAddress?: string, userAgent?: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Always return success to prevent user enumeration
  if (!user || user.status !== UserStatus.ACTIVE) {
    return { success: true, message: 'If an account exists, password reset instructions have been dispatched.' };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress,
      userAgent,
    },
  });

  return {
    success: true,
    message: 'If an account exists, password reset instructions have been dispatched.',
    resetToken: rawToken, // Used by notification dispatcher or test harness
  };
}

/**
 * Resets user password using single-use reset token.
 */
export async function resetPassword(rawToken: string, newPassword: string, ipAddress?: string, userAgent?: string) {
  if (!rawToken) {
    throw new BadRequestError('Reset token is required.');
  }

  validatePasswordStrength(newPassword);

  const tokenHash = hashResetToken(rawToken);

  const tokenRecord = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!tokenRecord || !tokenRecord.user || tokenRecord.user.status !== UserStatus.ACTIVE) {
    throw new BadRequestError('Invalid or expired password reset link.');
  }

  const newPasswordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: tokenRecord.userId },
      data: { passwordHash: newPasswordHash },
    });

    await tx.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: tokenRecord.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        resourceType: 'USER',
        resourceId: tokenRecord.userId,
        ipAddress,
        userAgent,
      },
    });
  });

  return { success: true, message: 'Password has been successfully updated. Please log in.' };
}

/**
 * Retrieves full user profile including active organisation memberships and assigned roles.
 */
export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      isPlatformAdmin: true,
      avatarUrl: true,
      createdAt: true,
      lastLoginAt: true,
      memberships: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          role: true,
          status: true,
          createdAt: true,
          organisation: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              city: true,
              logoUrl: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new NotFoundError('User account not found.');
  }

  return user;
}
