import sharp from 'sharp';
import { env } from '@/config/env';
import { BadRequestError } from '@/lib/errors';

export interface ProcessedImageVariant {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  fileSize: number;
}

export interface ProcessedImageResult {
  optimized: ProcessedImageVariant;
  thumbnail: ProcessedImageVariant;
  originalMeta: {
    width: number;
    height: number;
    format: string;
  };
  compressionRatio: number;
}

export class ImageProcessor {
  /**
   * Validates and optimizes an image buffer using Sharp, extracting metadata,
   * stripping sensitive EXIF privacy markers, and producing OPTIMIZED and THUMBNAIL variants.
   */
  static async processImage(
    inputBuffer: Buffer,
    _mimeType: string
  ): Promise<ProcessedImageResult> {
    if (!inputBuffer || inputBuffer.length === 0) {
      throw new BadRequestError('Empty image payload cannot be processed.');
    }

    let sharpInstance = sharp(inputBuffer, { failOn: 'none' });
    let metadata;
    try {
      metadata = await sharpInstance.metadata();
    } catch (err: any) {
      throw new BadRequestError(`Invalid or corrupted image format: ${err.message}`);
    }

    if (!metadata.width || !metadata.height || !metadata.format) {
      throw new BadRequestError('Failed to decode valid dimensions or format from image.');
    }

    const origWidth = metadata.width;
    const origHeight = metadata.height;
    const origFormat = metadata.format;

    // 1. Generate Optimized Variant (Visually Near-Lossless, Stripped EXIF GPS/Serials, WebP)
    const optimizedSharp = sharp(inputBuffer, { failOn: 'none' })
      .rotate() // Automatically orient by EXIF orientation
      .webp({ quality: 85, effort: 4 });

    const optimizedBuffer = await optimizedSharp.toBuffer();
    const optimizedMeta = await sharp(optimizedBuffer, { failOn: 'none' }).metadata();

    const optimizedVariant: ProcessedImageVariant = {
      buffer: optimizedBuffer,
      mimeType: 'image/webp',
      width: optimizedMeta.width || origWidth,
      height: optimizedMeta.height || origHeight,
      fileSize: optimizedBuffer.length,
    };

    // 2. Generate Thumbnail Variant (~400px long edge, fit: inside)
    const thumbMaxDim = env.THUMBNAIL_MAX_DIMENSION || 400;
    const thumbnailSharp = sharp(inputBuffer, { failOn: 'none' })
      .rotate()
      .resize(thumbMaxDim, thumbMaxDim, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 });

    const thumbnailBuffer = await thumbnailSharp.toBuffer();
    const thumbMeta = await sharp(thumbnailBuffer, { failOn: 'none' }).metadata();

    const thumbnailVariant: ProcessedImageVariant = {
      buffer: thumbnailBuffer,
      mimeType: 'image/webp',
      width: thumbMeta.width || 400,
      height: thumbMeta.height || 300,
      fileSize: thumbnailBuffer.length,
    };

    // Calculate compression ratio (original / optimized)
    const originalSize = inputBuffer.length;
    const compressionRatio =
      optimizedVariant.fileSize > 0
        ? Number((originalSize / optimizedVariant.fileSize).toFixed(2))
        : 1.0;

    return {
      optimized: optimizedVariant,
      thumbnail: thumbnailVariant,
      originalMeta: {
        width: origWidth,
        height: origHeight,
        format: origFormat,
      },
      compressionRatio,
    };
  }
}
