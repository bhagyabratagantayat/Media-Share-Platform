import { Worker, WorkerOptions, Job } from 'bullmq';
import { getRedisClient } from '@/server/queue/redis';
import { MEDIA_EXPORT_QUEUE_NAME } from '@/server/export/export-queue';
import { MediaExportJobData } from '@/server/export/export-types';
import { processExportJob, ProcessExportResult } from '@/server/export/export-worker';
import { env } from '@/config/env';

let exportWorkerInstance: Worker<MediaExportJobData, ProcessExportResult> | null = null;

export function createExportWorker(): Worker<MediaExportJobData, ProcessExportResult> {
  const workerOptions: WorkerOptions = {
    connection: getRedisClient() as any,
    concurrency: env.EXPORT_WORKER_CONCURRENCY || 2,
    lockDuration: 60000,
    maxStalledCount: 2,
  };

  const worker = new Worker<MediaExportJobData, ProcessExportResult>(
    MEDIA_EXPORT_QUEUE_NAME,
    async (job: Job<MediaExportJobData, ProcessExportResult>) => {
      const startTime = Date.now();
      console.log(
        `[ExportWorker] Processing export ${job.data.exportJobId} for org ${job.data.organisationId} (scope: ${job.data.scopeType})`
      );

      const result = await processExportJob(job.data.exportJobId);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[ExportWorker] Completed export ${job.data.exportJobId} in ${elapsed}s. Processed ${result.processedFiles} files.`
      );

      return result;
    },
    workerOptions
  );

  worker.on('completed', (job: Job) => {
    console.log(`[ExportWorker] Export job ${job.id} marked COMPLETED in queue.`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(
      `[ExportWorker] Export job ${job?.id} FAILED after attempt ${job?.attemptsMade}/${job?.opts.attempts}: ${err.message}`
    );
  });

  worker.on('error', (err: Error) => {
    console.error(`[ExportWorker] Fatal export worker error: ${err.message}`);
  });

  return worker;
}

export function startExportWorker() {
  if (!exportWorkerInstance) {
    exportWorkerInstance = createExportWorker();
    console.log(
      `[ExportWorker] Media export worker started with concurrency: ${env.EXPORT_WORKER_CONCURRENCY || 2}`
    );
  }
  return exportWorkerInstance;
}

export async function closeExportWorker(): Promise<void> {
  if (exportWorkerInstance) {
    await exportWorkerInstance.close();
    exportWorkerInstance = null;
    console.log('[ExportWorker] Media export worker shut down cleanly.');
  }
}
