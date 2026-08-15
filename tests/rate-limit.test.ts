import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '@/server/auth/rate-limit';

describe('Phase 2 — Rate Limiting Protection', () => {
  it('allows requests within the limit and blocks when exceeded', () => {
    const key = `test-ip-${Date.now()}`;
    const options = { windowMs: 1000, maxRequests: 3, message: 'Too many requests.' };

    // Requests 1, 2, 3 should pass
    expect(() => checkRateLimit(key, options)).not.toThrow();
    expect(() => checkRateLimit(key, options)).not.toThrow();
    expect(() => checkRateLimit(key, options)).not.toThrow();

    // Request 4 should be blocked with 429
    expect(() => checkRateLimit(key, options)).toThrow('Too many requests.');
  });
});
