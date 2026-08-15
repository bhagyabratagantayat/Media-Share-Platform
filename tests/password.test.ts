import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/server/auth/password';

describe('Password Security (Argon2id)', () => {
  it('should hash a valid password into a valid Argon2id hash format', async () => {
    const rawPassword = 'SecurePassword2026!';
    const hash = await hashPassword(rawPassword);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    // Argon2id hashes begin with $argon2id$
    expect(hash.startsWith('$argon2id$')).toBe(true);
    // Plaintext password must never appear in the hash
    expect(hash).not.toContain(rawPassword);
  });

  it('should generate distinct salt hashes for identical passwords', async () => {
    const password = 'IdenticalPassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    expect(hash1).not.toEqual(hash2);
  });

  it('should correctly verify valid password against hash', async () => {
    const rawPassword = 'CorrectPassword999#';
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword(rawPassword, hash);
    expect(isValid).toBe(true);
  });

  it('should reject incorrect password against hash', async () => {
    const rawPassword = 'CorrectPassword999#';
    const wrongPassword = 'WrongPassword999#';
    const hash = await hashPassword(rawPassword);

    const isValid = await verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });

  it('should reject passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters');
  });
});
