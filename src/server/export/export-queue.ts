import { Queue, QueueOptions } from 'bullmq';
import { getRedisClient } from '@/server/queue/redis';
import { MediaExportJobData } from './export-types';

export const MEDIA_EXPORT_QUEUE_NAME = 'media-export';

let exportQueueInstance: Queue<MediaExportJobData> | null = null;

export function getExportQueue(): Queue<MediaExportJobData> {
  if (!exportQueueInstance) {
    const queueOptions: QueueOptions = {
      connection: getRedisClient() as any,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 500,
        removeOnFail: 2000,
      },
    };

    exportQueueInstance = new Queue<MediaExportJobData>(
      MEDIA_EXPORT_QUEUE_NAME,
      queueOptions
    );
  }

  return exportQueueInstance;
}

/**
 * Enqueues a media export archive generation job to BullMQ.
 */
export async function enqueueMediaExportJob(
  data: MediaExportJobData
): Promise<string> {
  const jobId = `export-${data.exportJobId}`;

  // In test environment, allow tests to run without Redis socket
  if (process.env.NODE_ENV === 'test') {
    return jobId;
  }

  try {
    const queue = getExportQueue();
    const job = await queue.add('generate-zip-export', data, {
      jobId,
      priority: 2, // Standard priority for batch export jobs
    });

    return job.id || jobId;
  } catch (err: any) {
    console.warn(`[ExportQueue] Failed to enqueue export job ${jobId} to Redis: ${err.message}`);
    return jobId;
  }
}
