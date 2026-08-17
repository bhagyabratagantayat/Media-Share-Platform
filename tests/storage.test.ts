import { describe, it, expect, beforeEach } from 'vitest';
import { MockStorageProvider } from '@/server/storage/mock-storage';

describe('Phase 4: Storage Provider Abstraction', () => {
  let storage: MockStorageProvider;

  beforeEach(() => {
    storage = new MockStorageProvider();
  });

  it('generates presigned upload URL for single PUT', async () => {
    const key = 'organisations/org_1/events/evt_1/media/med_1/original';
    const uploadUrl = await storage.createUploadUrl(key, 'image/jpeg', 600);

    expect(uploadUrl).toContain('https://mock-storage.local/upload/');
    expect(uploadUrl).toContain('expires=600');

    const meta = await storage.headObject(key);
    expect(meta).not.toBeNull();
    expect(meta?.contentType).toBe('image/jpeg');
  });

  it('supports multipart upload initialization, part URLs, and completion', async () => {
    const key = 'organisations/org_1/events/evt_1/media/med_large/original';
    const init = await storage.createMultipartUpload(key, 'video/mp4');

    expect(init.key).toBe(key);
    expect(init.uploadId).toMatch(/^mock-upload-/);

    const part1Url = await storage.createPartUploadUrl(key, init.uploadId, 1, 900);
    const part2Url = await storage.createPartUploadUrl(key, init.uploadId, 2, 900);

    expect(part1Url).toContain(`/multipart/${init.uploadId}/part/1`);
    expect(part2Url).toContain(`/multipart/${init.uploadId}/part/2`);

    const result = await storage.completeMultipartUpload(key, init.uploadId, [
      { partNumber: 1, etag: '"etag-part-1"' },
      { partNumber: 2, etag: '"etag-part-2"' },
    ]);

    expect(result.etag).toBeDefined();

    const headMeta = await storage.headObject(key);
    expect(headMeta).not.toBeNull();
    expect(headMeta?.contentLength).toBe(10485760); // 2 parts * 5MB
    expect(headMeta?.contentType).toBe('video/mp4');
  });

  it('aborts multipart upload cleanly', async () => {
    const key = 'organisations/org_1/events/evt_1/media/med_abort/original';
    const init = await storage.createMultipartUpload(key, 'video/mp4');
    await storage.abortMultipartUpload(key, init.uploadId);

    // Attempting to generate a part URL for aborted upload throws
    await expect(storage.createPartUploadUrl(key, init.uploadId, 1)).rejects.toThrow(
      /Multipart session not found/
    );
  });

  it('generates secure presigned download URL with disposition', async () => {
    const key = 'organisations/org_1/events/evt_1/media/med_1/original';
    storage.seedObject(key, { contentLength: 5000, contentType: 'image/png' });

    const downloadUrl = await storage.createDownloadUrl(key, 300, 'celebration.png');
    expect(downloadUrl).toContain('https://mock-storage.local/download/');
    expect(downloadUrl).toContain('filename=celebration.png');
    expect(downloadUrl).toContain('expires=300');
  });

  it('deletes objects from storage', async () => {
    const key = 'organisations/org_1/events/evt_1/media/med_del/original';
    storage.seedObject(key, { contentLength: 1000 });

    expect(await storage.headObject(key)).not.toBeNull();
    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
  });
});
