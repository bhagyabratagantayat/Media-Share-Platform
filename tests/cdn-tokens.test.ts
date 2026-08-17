import { describe, it, expect, beforeEach } from 'vitest';
import { CloudflareCdnProvider } from '@/server/cdn/cloudflare-cdn';
import { CloudFrontCdnProvider } from '@/server/cdn/cloudfront-cdn';
import { MockCdnProvider } from '@/server/cdn/mock-cdn';
import { setCdnProvider, getCdnProvider } from '@/server/cdn';

describe('Phase 6: CDN Providers & Token Signatures', () => {
  const secret = 'super-secret-hmac-key-for-test-32-chars';
  const baseUrl = 'https://media.test.internal';

  describe('CloudflareCdnProvider', () => {
    const cf = new CloudflareCdnProvider(baseUrl, secret, 300);

    it('generates signed media access URL with token and exp parameters', async () => {
      const storageKey = 'organisations/org-123/events/ev-456/media/med-789/thumbnail.webp';
      const url = await cf.generateMediaAccessUrl(storageKey, { deliveryType: 'THUMBNAIL' });

      expect(url).toContain(baseUrl);
      expect(url).toContain(storageKey);
      expect(url).toContain('token=');
      expect(url).toContain('exp=');
      expect(url).toContain('variant=thumbnail');

      const parsed = new URL(url);
      const token = parsed.searchParams.get('token')!;
      const exp = Number(parsed.searchParams.get('exp')!);

      expect(cf.verifyAccessSignature(storageKey, token, exp)).toBe(true);
    });

    it('rejects tampered token or expired timestamp', async () => {
      const storageKey = 'organisations/org-123/events/ev-456/media/med-789/optimized.webp';
      const url = await cf.generateMediaAccessUrl(storageKey);
      const parsed = new URL(url);
      const token = parsed.searchParams.get('token')!;
      const exp = Number(parsed.searchParams.get('exp')!);

      // Tampered token
      const tamperedToken = token.slice(0, -4) + 'abcd';
      expect(cf.verifyAccessSignature(storageKey, tamperedToken, exp)).toBe(false);

      // Expired timestamp
      const pastExp = Math.floor(Date.now() / 1000) - 100;
      expect(cf.verifyAccessSignature(storageKey, token, pastExp)).toBe(false);

      // Wrong storage key
      const wrongKey = 'organisations/org-999/events/ev-456/media/med-789/optimized.webp';
      expect(cf.verifyAccessSignature(wrongKey, token, exp)).toBe(false);
    });

    it('generates download URL with Content-Disposition attachment header', async () => {
      const storageKey = 'organisations/org-123/events/ev-456/media/med-789/original.mp4';
      const downloadUrl = await cf.generateDownloadUrl(storageKey, 'event_celebration.mp4');

      expect(downloadUrl).toContain('response-content-disposition=attachment%3B+filename%3D%22event_celebration.mp4%22');
      expect(downloadUrl).toContain('token=');
    });
  });

  describe('CloudFrontCdnProvider', () => {
    const cloudfront = new CloudFrontCdnProvider(baseUrl, secret, 300);

    it('generates signed URL with CloudFront parameters', async () => {
      const storageKey = 'organisations/org-123/events/ev-456/media/med-789/thumbnail.webp';
      const url = await cloudfront.generateMediaAccessUrl(storageKey);

      expect(url).toContain(baseUrl);
      expect(url).toContain('Expires=');
      expect(url).toContain('Signature=');
      expect(url).toContain('Key-Pair-Id=K_CF_SIGNER');

      const parsed = new URL(url);
      const sig = parsed.searchParams.get('Signature')!;
      const exp = Number(parsed.searchParams.get('Expires')!);

      expect(cloudfront.verifyAccessSignature(storageKey, sig, exp)).toBe(true);
    });
  });

  describe('MockCdnProvider & Factory', () => {
    it('sets and retrieves active provider from factory', () => {
      const mock = new MockCdnProvider();
      setCdnProvider(mock);
      expect(getCdnProvider().getProviderName()).toBe('mock');
    });
  });
});
