import { describe, it, expect } from 'vitest';
import { env } from '../src/config/env';

describe('Environment Variable Security & Integrity', () => {
  it('should have valid non-empty DATABASE_URL', () => {
    expect(env.DATABASE_URL).toBeDefined();
    expect(env.DATABASE_URL.length).toBeGreaterThan(0);
  });

  it('should have valid AUTH_SECRET and SESSION_SECRET', () => {
    expect(env.AUTH_SECRET).toBeDefined();
    expect(env.AUTH_SECRET.length).toBeGreaterThanOrEqual(16);
    expect(env.SESSION_SECRET).toBeDefined();
    expect(env.SESSION_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it('should not expose secret variables under NEXT_PUBLIC_ prefixes', () => {
    const nextPublicKeys = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'));
    const forbiddenSecrets = [
      'NEXT_PUBLIC_DATABASE_URL',
      'NEXT_PUBLIC_SECRET',
      'NEXT_PUBLIC_S3_SECRET',
      'NEXT_PUBLIC_AUTH_SECRET',
      'NEXT_PUBLIC_SESSION_SECRET',
    ];

    for (const forbidden of forbiddenSecrets) {
      expect(nextPublicKeys).not.toContain(forbidden);
    }
  });
});
