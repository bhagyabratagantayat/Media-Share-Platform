import { describe, it, expect } from 'vitest';
import { CloudflareCdnProvider } from '@/server/cdn/cloudflare-cdn';
import { CloudFrontCdnProvider } from '@/server/cdn/cloudfront-cdn';
import { MockCdnProvider } from '@/server/cdn/mock-cdn';

describe('Phase 6: CDN Cache Security & Signed Token Validation', () => {
  const secretA = 'secret-signing-key-for-tenant-a-32-chars';
  const cf = new CloudflareCdnProvider('https://cdn.example.com', secretA, 300);

  it('validates that signed tokens are strictly bound to the specific media storage path', async () => {
    const userAMediaKey = 'organisations/org-a/events/ev-1/media/photo-user-a.webp';
    const userBMediaKey = 'organisations/org-b/events/ev-2/media/private-user-b.webp';

    const userASignedUrl = await cf.generateMediaAccessUrl(userAMediaKey);
    const parsed = new URL(userASignedUrl);
    const token = parsed.searchParams.get('token')!;
    const exp = Number(parsed.searchParams.get('exp')!);

    // User A can access their own media
    expect(cf.verifyAccessSignature(userAMediaKey, token, exp)).toBe(true);

    // Replay attack: An unauthorized actor attempts to use User A's valid token to access User B's private media
    expect(cf.verifyAccessSignature(userBMediaKey, token, exp)).toBe(false);
  });

  it('invalidates tokens when expiration timestamp has passed', async () => {
    const mediaKey = 'organisations/org-a/events/ev-1/media/time-sensitive.webp';
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 10; // 10s in the past

    // Manually construct signature for an expired timestamp
    const cloudflareProvider = new CloudflareCdnProvider('https://cdn.example.com', secretA, 0);
    const expiredUrl = await cloudflareProvider.generateMediaAccessUrl(mediaKey, { expiresInSeconds: -5 });
    const parsed = new URL(expiredUrl);
    const token = parsed.searchParams.get('token')!;

    expect(cf.verifyAccessSignature(mediaKey, token, expiredTimestamp)).toBe(false);
  });

  it('rejects tampered signature bytes with timing-safe protection', async () => {
    const mediaKey = 'organisations/org-a/events/ev-1/media/immutable.webp';
    const url = await cf.generateMediaAccessUrl(mediaKey);
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token')!;
    const exp = Number(parsed.searchParams.get('exp')!);

    // Alter one byte
    const tampered = token.substring(0, token.length - 2) + '00';
    expect(cf.verifyAccessSignature(mediaKey, tampered, exp)).toBe(false);
  });
});
