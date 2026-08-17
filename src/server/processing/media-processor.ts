import { prisma } from '@/server/db/prisma';
import { getStorageProvider } from '@/server/storage';
import { ImageProcessor } from './image-processor';
import { VideoProcessor } from './video-processor';
import { MediaProcessingJobData, MediaProcessingResult, CreatedVariantInfo } from '@/server/queue/types';
import { buildMediaVariantStorageKey } from '@/server/media/storage-keys';
import {
  MediaStatus,
  VariantType,
  MediaType,
} from '@prisma/client';
import { NotFoundError } from '@/lib/errors';

export class MediaProcessorService {
  /**
   * Orchestrates the complete processing pipeline for an image or video job.
   * Handles idempotency, variant generation, storage uploading, and atomic database commits.
   */
  static async processMediaJob(
    data: MediaProcessingJobData,
    onProgress?: (percent: number) => void
  ): Promise<MediaProcessingResult> {
    const storage = getStorageProvider();

    // 1. Fetch MediaItem from database
    const media = await prisma.mediaItem.findUnique({
      where: { id: data.mediaItemId },
      include: {
        variants: true,
      },
    });

    if (!media) {
      throw new NotFoundError(`Media item '${data.mediaItemId}' not found.`);
    }

    // 2. IDEMPOTENCY CHECK: If already processed for this version and READY, skip re-processing
    const hasOptimized = media.variants.some((v) => v.variantType === VariantType.OPTIMIZED);
    const hasThumbnail = media.variants.some((v) => v.variantType === VariantType.THUMBNAIL);

    if (
      media.status === MediaStatus.READY &&
      media.processingVersion === data.processingVersion &&
      hasOptimized &&
      hasThumbnail
    ) {
      return {
        success: true,
        mediaItemId: media.id,
        variantsCreated: media.variants.map((v) => ({
          variantType: v.variantType,
          storageKey: v.storageKey,
          fileSize: Number(v.fileSize),
          mimeType: v.mimeType,
          width: v.width || undefined,
          height: v.height || undefined,
        })),
        originalFileSize: Number(media.originalFileSize || media.fileSize),
        optimizedFileSize: Number(media.optimizedFileSize || 0),
        compressionRatio: media.compressionRatio || 1.0,
      };
    }

    // 3. Mark MediaItem as PROCESSING
    await prisma.mediaItem.update({
      where: { id: media.id },
      data: {
        status: MediaStatus.PROCESSING,
        processingStartedAt: new Date(),
        processingProgress: 10,
        processingError: null,
      },
    });

    onProgress?.(10);

    try {
      // 4. Download original binary from object storage
      const originalBuffer = await storage.getObject(data.originalStorageKey);
      onProgress?.(30);

      const variantsToCreate: CreatedVariantInfo[] = [];
      let width: number | undefined;
      let height: number | undefined;
      let durationMs: number | undefined;
      let frameRate: number | undefined;
      let codec: string | undefined;
      let optimizedFileSize = 0;
      let compressionRatio = 1.0;

      const optimizedKey = buildMediaVariantStorageKey(
        data.organisationId,
        data.eventId,
        data.mediaItemId,
        VariantType.OPTIMIZED
      );

      const thumbnailKey = buildMediaVariantStorageKey(
        data.organisationId,
        data.eventId,
        data.mediaItemId,
        VariantType.THUMBNAIL
      );

      if (data.mediaType === MediaType.IMAGE) {
        // Process Image
        const result = await ImageProcessor.processImage(originalBuffer, data.mimeType);
        onProgress?.(60);

        // Upload Optimized Variant
        await storage.putObject(optimizedKey, result.optimized.buffer, result.optimized.mimeType);
        variantsToCreate.push({
          variantType: VariantType.OPTIMIZED,
          storageKey: optimizedKey,
          fileSize: result.optimized.fileSize,
          width: result.optimized.width,
          height: result.optimized.height,
          mimeType: result.optimized.mimeType,
        });

        // Upload Thumbnail Variant
        await storage.putObject(thumbnailKey, result.thumbnail.buffer, result.thumbnail.mimeType);
        variantsToCreate.push({
          variantType: VariantType.THUMBNAIL,
          storageKey: thumbnailKey,
          fileSize: result.thumbnail.fileSize,
          width: result.thumbnail.width,
          height: result.thumbnail.height,
          mimeType: result.thumbnail.mimeType,
        });

        width = result.optimized.width;
        height = result.optimized.height;
        optimizedFileSize = result.optimized.fileSize;
        compressionRatio = result.compressionRatio;
      } else {
        // Process Video
        const result = await VideoProcessor.processVideo(
          originalBuffer,
          data.mimeType,
          (p) => onProgress?.(30 + Math.round(p * 0.4))
        );

        // Upload Optimized Video
        await storage.putObject(optimizedKey, result.optimizedBuffer, 'video/mp4');
        variantsToCreate.push({
          variantType: VariantType.OPTIMIZED,
          storageKey: optimizedKey,
          fileSize: result.optimizedFileSize,
          width: result.metadata.width,
          height: result.metadata.height,
          durationMs: result.metadata.durationMs,
          codec: result.metadata.codec,
          mimeType: 'video/mp4',
        });

        // Upload Video Thumbnail
        await storage.putObject(thumbnailKey, result.thumbnailBuffer, 'image/jpeg');
        variantsToCreate.push({
          variantType: VariantType.THUMBNAIL,
          storageKey: thumbnailKey,
          fileSize: result.thumbnailBuffer.length,
          mimeType: 'image/jpeg',
        });

        width = result.metadata.width;
        height = result.metadata.height;
        durationMs = result.metadata.durationMs;
        frameRate = result.metadata.frameRate;
        codec = result.metadata.codec;
        optimizedFileSize = result.optimizedFileSize;
        compressionRatio = result.compressionRatio;
      }

      onProgress?.(90);

      // 5. ATOMIC DATABASE COMMIT & QUOTA RECONCILIATION
      const totalNewVariantBytes = variantsToCreate.reduce((sum, v) => sum + v.fileSize, 0);

      await prisma.$transaction(async (tx) => {
        // Clean up prior variants for this mediaItem if reprocessing
        const existingVariants = await tx.mediaVariant.findMany({
          where: {
            mediaItemId: data.mediaItemId,
            variantType: { in: [VariantType.OPTIMIZED, VariantType.THUMBNAIL] },
          },
        });

        const priorVariantBytes = existingVariants.reduce(
          (sum, v) => sum + Number(v.fileSize),
          0
        );

        // Delete previous non-original variants to prevent duplicate records
        if (existingVariants.length > 0) {
          await tx.mediaVariant.deleteMany({
            where: {
              mediaItemId: data.mediaItemId,
              variantType: { in: [VariantType.OPTIMIZED, VariantType.THUMBNAIL] },
            },
          });
        }

        // Create new variants
        for (const variant of variantsToCreate) {
          await tx.mediaVariant.create({
            data: {
              mediaItemId: data.mediaItemId,
              variantType: variant.variantType,
              storageKey: variant.storageKey,
              mimeType: variant.mimeType,
              fileSize: BigInt(variant.fileSize),
              width: variant.width || null,
              height: variant.height || null,
              durationMs: variant.durationMs || null,
              codec: variant.codec || null,
              status: MediaStatus.READY,
            },
          });
        }

        // Adjust organization quota for new variants in an idempotent way
        const netBytesDelta = BigInt(totalNewVariantBytes - priorVariantBytes);
        if (netBytesDelta !== BigInt(0)) {
          await tx.organisationQuota.update({
            where: { organisationId: data.organisationId },
            data: {
              storageUsedBytes: { increment: netBytesDelta },
            },
          });
        }

        // Mark MediaItem as READY
        await tx.mediaItem.update({
          where: { id: data.mediaItemId },
          data: {
            status: MediaStatus.READY,
            processingProgress: 100,
            processingCompletedAt: new Date(),
            processingError: null,
            width: width || null,
            height: height || null,
            durationMs: durationMs || null,
            frameRate: frameRate || null,
            codec: codec || null,
            originalFileSize: BigInt(originalBuffer.length),
            optimizedFileSize: BigInt(optimizedFileSize),
            compressionRatio,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            organisationId: data.organisationId,
            actorUserId: data.userId,
            action: 'MEDIA_PROCESSING_COMPLETED',
            resourceType: 'MEDIA_ITEM',
            resourceId: data.mediaItemId,
            metadata: {
              variantsCount: variantsToCreate.length,
              optimizedFileSize,
              compressionRatio,
              mediaType: data.mediaType,
            },
          },
        });
      });

      onProgress?.(100);

      return {
        success: true,
        mediaItemId: data.mediaItemId,
        variantsCreated: variantsToCreate,
        originalFileSize: originalBuffer.length,
        optimizedFileSize,
        compressionRatio,
        width,
        height,
        durationMs,
        frameRate,
        codec,
      };
    } catch (error: any) {
      // Record failure state
      await prisma.mediaItem.update({
        where: { id: data.mediaItemId },
        data: {
          status: MediaStatus.FAILED,
          processingError: error.message || 'Media processing failed.',
        },
      });

      await prisma.auditLog.create({
        data: {
          organisationId: data.organisationId,
          actorUserId: data.userId,
          action: 'MEDIA_PROCESSING_FAILED',
          resourceType: 'MEDIA_ITEM',
          resourceId: data.mediaItemId,
          metadata: {
            error: error.message,
            mediaType: data.mediaType,
          },
        },
      });

      throw error;
    }
  }
}
