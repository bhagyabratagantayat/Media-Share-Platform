import { hash, verify } from '@node-rs/argon2';
import { env } from '@/config/env';

/**
 * Argon2id Configuration (OWASP Recommended Parameters)
 * - Memory Cost: 19456 KiB (19 MiB)
 * - Time Cost: 2 iterations
 * - Parallelism: 1 lane
 * - Algorithm: Argon2id (Type 2)
 */
const ARGON2ID_ALGORITHM = 2;

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
  algorithm: ARGON2ID_ALGORITHM,
};

/**
 * Hashes a plaintext password using Argon2id.
 * Applies optional application-level secret pepper.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const payload = env.ARGON2_PEPPER ? `${plainPassword}${env.ARGON2_PEPPER}` : plainPassword;
  return await hash(payload, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Returns true if valid, false otherwise (timing-safe).
 */
export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  if (!plainPassword || !passwordHash) {
    return false;
  }

  try {
    const payload = env.ARGON2_PEPPER ? `${plainPassword}${env.ARGON2_PEPPER}` : plainPassword;
    return await verify(passwordHash, payload, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
