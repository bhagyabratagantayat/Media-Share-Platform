import { Worker, WorkerOptions, Job } from 'bullmq';
import { getRedisClient } from '@/server/queue/redis';
import { MEDIA_PROCESSING_QUEUE_NAME } from '@/server/queue/media-queue';
import { MediaProcessingJobData, MediaProcessingResult } from '@/server/queue/types';
import { MediaProcessorService } from '@/server/processing/media-processor';
import { env } from '@/config/env';

let workerInstance: Worker<MediaProcessingJobData, MediaProcessingResult> | null = null;

export function createMediaWorker(): Worker<MediaProcessingJobData, MediaProcessingResult> {
  const workerConcurrency =
    (env.IMAGE_WORKER_CONCURRENCY || 4) + (env.VIDEO_WORKER_CONCURRENCY || 2);

  const workerOptions: WorkerOptions = {
    connection: getRedisClient() as any,
    concurrency: workerConcurrency,
    lockDuration: 30000,
    maxStalledCount: 2,
  };

  const worker = new Worker<MediaProcessingJobData, MediaProcessingResult>(
    MEDIA_PROCESSING_QUEUE_NAME,
    async (job: Job<MediaProcessingJobData, MediaProcessingResult>) => {
      const startTime = Date.now();
      console.log(
        `[Worker] Processing job ${job.id} for media ${job.data.mediaItemId} (${job.data.mediaType})`
      );

      const result = await MediaProcessorService.processMediaJob(job.data, (progress) => {
        job.updateProgress(progress);
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[Worker] Completed job ${job.id} in ${elapsed}s. Optimized size: ${result.optimizedFileSize} bytes (ratio: ${result.compressionRatio}x)`
      );

      return result;
    },
    workerOptions
  );

  worker.on('completed', (job: Job) => {
    console.log(`[Worker] Job ${job.id} marked COMPLETED in queue.`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(
      `[Worker] Job ${job?.id} FAILED after attempt ${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`
    );
  });

  worker.on('error', (err: Error) => {
    console.error(`[Worker] Fatal worker error: ${err.message}`);
  });

  return worker;
}

export function startMediaWorker() {
  if (!workerInstance) {
    workerInstance = createMediaWorker();
    console.log(
      `[Worker] Media processing worker started with concurrency: ${
        (env.IMAGE_WORKER_CONCURRENCY || 4) + (env.VIDEO_WORKER_CONCURRENCY || 2)
      }`
    );
  }
  return workerInstance;
}

export async function closeMediaWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    console.log('[Worker] Media processing worker shut down cleanly.');
  }
}
