import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { ImageProcessor } from '@/server/processing/image-processor';
import { BadRequestError } from '@/lib/errors';

describe('ImageProcessor', () => {
  it('should optimize a valid image and generate optimized & thumbnail WebP variants', async () => {
    // Generate a valid test image (1200x800 red rectangle)
    const testImageBuffer = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await ImageProcessor.processImage(testImageBuffer, 'image/jpeg');

    expect(result).toBeDefined();
    expect(result.originalMeta.width).toBe(1200);
    expect(result.originalMeta.height).toBe(800);

    // Verify optimized variant
    expect(result.optimized.mimeType).toBe('image/webp');
    expect(result.optimized.width).toBe(1200);
    expect(result.optimized.height).toBe(800);
    expect(result.optimized.fileSize).toBeGreaterThan(0);
    expect(result.optimized.buffer.length).toBe(result.optimized.fileSize);

    // Verify thumbnail variant
    expect(result.thumbnail.mimeType).toBe('image/webp');
    expect(result.thumbnail.width).toBeLessThanOrEqual(400);
    expect(result.thumbnail.height).toBeLessThanOrEqual(400);
    expect(result.thumbnail.fileSize).toBeGreaterThan(0);

    // Verify compression ratio
    expect(result.compressionRatio).toBeGreaterThan(0);
  });

  it('should throw BadRequestError when processing empty buffer', async () => {
    await expect(
      ImageProcessor.processImage(Buffer.alloc(0), 'image/jpeg')
    ).rejects.toThrow(BadRequestError);
  });

  it('should throw BadRequestError when processing corrupted image buffer', async () => {
    const corruptBuffer = Buffer.from('not-a-valid-image-data-string');
    await expect(
      ImageProcessor.processImage(corruptBuffer, 'image/jpeg')
    ).rejects.toThrow(BadRequestError);
  });
});
