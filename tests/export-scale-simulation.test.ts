import { describe, it, expect } from 'vitest';
import { CloudflareCdnProvider } from '@/server/cdn/cloudflare-cdn';

describe('Phase 13: 500+ Concurrent User Secure Download & CDN Scale Simulation', () => {
  it('handles 500+ concurrent signed download URL token generations with low latency', async () => {
    const CONCURRENT_USERS = 500;
    const baseUrl = 'https://cdn.photos.college.edu';
    const secret = 'production-grade-hmac-sha256-signature-key-32-chars';
    const cdn = new CloudflareCdnProvider(baseUrl, secret, 300);

    const storageKey = 'organisations/org-123/exports/full-archive.zip';
    const downloadFilename = 'TechFest_2026_Memories.zip';

    const startTime = performance.now();

    const tasks = Array.from({ length: CONCURRENT_USERS }, (_, i) => {
      return (async () => {
        const t0 = performance.now();
        const downloadUrl = await cdn.generateDownloadUrl(storageKey, downloadFilename);

        // Parse token and exp
        const url = new URL(downloadUrl);
        const token = url.searchParams.get('token');
        const exp = Number(url.searchParams.get('exp'));

        if (!token || !exp) throw new Error('Signed URL missing token or exp parameter.');

        const verified = cdn.verifyAccessSignature(storageKey, token, exp);

        const t1 = performance.now();
        return {
          durationMs: t1 - t0,
          verified,
        };
      })();
    });

    const results = await Promise.all(tasks);
    const totalDurationMs = performance.now() - startTime;

    // Verify all 500 operations succeeded
    const allVerified = results.every((r) => r.verified);
    expect(allVerified).toBe(true);
    expect(results.length).toBe(CONCURRENT_USERS);

    // Calculate percentiles
    const latencies = results.map((r) => r.durationMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(CONCURRENT_USERS * 0.5)];
    const p95 = latencies[Math.floor(CONCURRENT_USERS * 0.95)];
    const p99 = latencies[Math.floor(CONCURRENT_USERS * 0.99)];

    console.log(
      `[Phase 13 Scale Benchmark] 500 Concurrent Download Token Operations: Total=${totalDurationMs.toFixed(
        2
      )}ms, p50=${p50.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, p99=${p99.toFixed(2)}ms`
    );

    // Strict performance assertions
    expect(p95).toBeLessThan(150); // Under 150ms for p95 cryptographic token generation
    expect(p99).toBeLessThan(250); // Under 250ms for p99
  });
});
