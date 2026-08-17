import { describe, it, expect } from 'vitest';
import { VideoProcessor } from '@/server/processing/video-processor';
import { BadRequestError } from '@/lib/errors';

describe('VideoProcessor', () => {
  it('should reject empty video buffer with BadRequestError', async () => {
    await expect(
      VideoProcessor.processVideo(Buffer.alloc(0), 'video/mp4')
    ).rejects.toThrow(BadRequestError);
  });

  it('should process a valid buffer and return video variants and metadata', async () => {
    const mockVideoBuffer = Buffer.from('mock-mp4-video-payload-for-testing');

    const result = await VideoProcessor.processVideo(mockVideoBuffer, 'video/mp4');

    expect(result).toBeDefined();
    expect(result.optimizedBuffer).toBeDefined();
    expect(result.thumbnailBuffer).toBeDefined();
    expect(result.metadata.width).toBeGreaterThan(0);
    expect(result.metadata.height).toBeGreaterThan(0);
    expect(result.metadata.durationMs).toBeGreaterThan(0);
    expect(result.optimizedFileSize).toBeGreaterThan(0);
    expect(result.compressionRatio).toBeGreaterThan(0);
  });
});
