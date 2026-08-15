import { RateLimitError } from '@/lib/errors';

interface RateLimitRecord {
  timestamps: number[];
}

const memoryStore = new Map<string, RateLimitRecord>();

// Clean up stale memory records every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    memoryStore.forEach((record, key) => {
      record.timestamps = record.timestamps.filter((ts) => now - ts < 15 * 60 * 1000);
      if (record.timestamps.length === 0) {
        memoryStore.delete(key);
      }
    });
  }, 5 * 60 * 1000).unref?.();
}

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
}

/**
 * Checks rate limit for a given key (e.g. `login:ip:127.0.0.1` or `org-pass:org_123:ip`).
 * Throws RateLimitError (429) if exceeded.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  const record = memoryStore.get(key) ?? { timestamps: [] };

  // Filter out timestamps outside window
  const windowStart = now - options.windowMs;
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.maxRequests) {
    const retryAfterSec = Math.ceil((record.timestamps[0] + options.windowMs - now) / 1000);
    throw new RateLimitError(
      options.message ?? `Too many attempts. Please try again in ${retryAfterSec} seconds.`
    );
  }

  record.timestamps.push(now);
  memoryStore.set(key, record);
}

// Preset rate limiting configurations
export const RATE_LIMITS = {
  LOGIN: { windowMs: 60 * 1000, maxRequests: 5, message: 'Too many login attempts. Please wait 1 minute.' },
  REGISTER: { windowMs: 5 * 60 * 1000, maxRequests: 3, message: 'Too many registrations from this IP. Please wait 5 minutes.' },
  FORGOT_PASSWORD: { windowMs: 15 * 60 * 1000, maxRequests: 3, message: 'Too many reset requests. Please wait 15 minutes.' },
  RESET_PASSWORD: { windowMs: 15 * 60 * 1000, maxRequests: 5, message: 'Too many password reset attempts.' },
  ORG_ACCESS_PASS: { windowMs: 60 * 1000, maxRequests: 5, message: 'Too many access attempts for this organisation. Please wait 1 minute.' },
} as const;
