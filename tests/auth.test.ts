import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  normalizeEmail,
  validatePasswordStrength,
} from '@/server/auth/service';
import { hashPassword } from '@/server/auth/password';
import { verifyUserSessionToken } from '@/server/auth/token';
import { prisma } from '@/server/db/prisma';
import { UserStatus } from '@prisma/client';
import crypto from 'crypto';

vi.mock('@/server/db/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      passwordResetToken: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        return cb(prisma);
      }),
    },
  };
});

describe('Phase 2 — User Authentication & Password Reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes email addresses correctly', () => {
    expect(normalizeEmail('  User.NAME@Example.COM  ')).toBe('user.name@example.com');
  });

  it('validates password strength according to security standards', () => {
    expect(() => validatePasswordStrength('short')).toThrow('Password must be at least 8 characters long.');
    expect(() => validatePasswordStrength('validpassword123')).not.toThrow();
  });

  it('registers a new user with Argon2id password hash and session JWT', async () => {
    const testEmail = 'newuser@example.com';
    const testPassword = 'SecurePassword123!';

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.user.create).mockResolvedValueOnce({
      id: 'usr-123',
      name: 'Auth Test User',
      email: testEmail,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: false,
      avatarUrl: null,
      createdAt: new Date(),
    } as any);

    const result = await registerUser({
      name: 'Auth Test User',
      email: testEmail,
      password: testPassword,
      confirmPassword: testPassword,
    });

    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testEmail);
    expect(result.sessionToken).toBeDefined();

    // Verify session token
    const decoded = await verifyUserSessionToken(result.sessionToken);
    expect(decoded?.userId).toBe('usr-123');
    expect(decoded?.email).toBe(testEmail);
  });

  it('prevents registration of duplicate email addresses', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'existing-usr',
      email: 'duplicate@example.com',
    } as any);

    await expect(
      registerUser({
        name: 'Duplicate User',
        email: 'duplicate@example.com',
        password: 'Password123!',
      })
    ).rejects.toThrow('An account with this email address already exists.');
  });

  it('authenticates active user with correct password and generates session JWT', async () => {
    const password = 'CorrectPassword123!';
    const passwordHash = await hashPassword(password);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'usr-456',
      name: 'Active User',
      email: 'active@example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: false,
      avatarUrl: null,
    } as any);

    const result = await loginUser({
      email: 'Active@Example.com',
      password,
    });

    expect(result.user.id).toBe('usr-456');
    expect(result.sessionToken).toBeDefined();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'usr-456' } })
    );
  });

  it('rejects login with invalid password', async () => {
    const passwordHash = await hashPassword('ActualPassword123!');

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'usr-456',
      name: 'Active User',
      email: 'active@example.com',
      passwordHash,
      status: UserStatus.ACTIVE,
      isPlatformAdmin: false,
    } as any);

    await expect(
      loginUser({
        email: 'active@example.com',
        password: 'WrongPassword999!',
      })
    ).rejects.toThrow('Invalid email or password.');
  });

  it('blocks suspended user accounts from authenticating', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'usr-suspended',
      name: 'Suspended User',
      email: 'suspended@example.com',
      passwordHash: 'hash',
      status: UserStatus.SUSPENDED,
      isPlatformAdmin: false,
    } as any);

    await expect(
      loginUser({
        email: 'suspended@example.com',
        password: 'AnyPassword123!',
      })
    ).rejects.toThrow('Your account has been suspended.');
  });

  it('handles secure single-use password reset workflow', async () => {
    const email = 'reset@example.com';
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'usr-reset',
      email,
      status: UserStatus.ACTIVE,
    } as any);

    const resetReq = await requestPasswordReset(email);
    expect(resetReq.success).toBe(true);
    expect(resetReq.resetToken).toBeDefined();

    const rawToken = resetReq.resetToken!;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    vi.mocked(prisma.passwordResetToken.findFirst).mockResolvedValueOnce({
      id: 'token-123',
      userId: 'usr-reset',
      tokenHash,
      usedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
      user: {
        id: 'usr-reset',
        status: UserStatus.ACTIVE,
      },
    } as any);

    const resetResult = await resetPassword(rawToken, 'BrandNewPassword456!');
    expect(resetResult.success).toBe(true);
    expect(prisma.user.update).toHaveBeenCalled();
    expect(prisma.passwordResetToken.update).toHaveBeenCalled();
  });
});
