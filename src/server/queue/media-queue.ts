import { Queue, QueueOptions } from 'bullmq';
import { getRedisClient } from './redis';
import { MediaProcessingJobData } from './types';
import { prisma } from '@/server/db/prisma';
import { MediaStatus, UploadType } from '@prisma/client';
import { env } from '@/config/env';

export const MEDIA_PROCESSING_QUEUE_NAME = 'media-processing';

let mediaQueueInstance: Queue<MediaProcessingJobData> | null = null;

export function getMediaQueue(): Queue<MediaProcessingJobData> {
  if (!mediaQueueInstance) {
    const queueOptions: QueueOptions = {
      connection: getRedisClient() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    };

    mediaQueueInstance = new Queue<MediaProcessingJobData>(
      MEDIA_PROCESSING_QUEUE_NAME,
      queueOptions
    );
  }

  return mediaQueueInstance;
}

/**
 * Enqueues an asynchronous media processing job with priority and deduplication.
 */
export async function enqueueMediaProcessingJob(
  data: MediaProcessingJobData
): Promise<string> {
  const jobId = `media-proc-${data.mediaItemId}-v${data.processingVersion || env.MEDIA_PROCESSING_VERSION}`;

  // 1. Mark MediaItem as QUEUED in database
  await prisma.mediaItem.update({
    where: { id: data.mediaItemId },
    data: {
      status: MediaStatus.QUEUED,
      processingProgress: 0,
      processingError: null,
      processingVersion: data.processingVersion || env.MEDIA_PROCESSING_VERSION,
    },
  });

  // In test environments, avoid blocking on external Redis network sockets
  if (process.env.NODE_ENV === 'test') {
    return jobId;
  }

  // 2. Determine priority (Lower number = higher priority in BullMQ)
  const priority = data.uploadType === UploadType.OFFICIAL ? 1 : 5;

  // 3. Enqueue to BullMQ
  try {
    const queue = getMediaQueue();
    const job = await queue.add(
      `process-${data.mediaType.toLowerCase()}`,
      data,
      {
        jobId,
        priority,
      }
    );

    return job.id || jobId;
  } catch (err: any) {
    console.warn(`[Queue] Failed to enqueue job ${jobId} to Redis: ${err.message}`);
    // In environments where Redis is not active, return the deterministic jobId
    return jobId;
  }
}
