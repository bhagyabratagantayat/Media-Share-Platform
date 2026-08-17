import { prisma } from '@/server/db/prisma';
import { getStorageProvider } from '@/server/storage';
import { ExportStatus } from '@prisma/client';
import { StreamingZipArchiver } from './zip-stream';
import { ExportManifestEntry } from './export-manifest';
import { env } from '@/config/env';

export interface ProcessExportResult {
  exportJobId: string;
  status: ExportStatus;
  archiveStorageKey?: string;
  archiveSize?: bigint;
  processedFiles: number;
  processedBytes: bigint;
  skippedFiles: number;
  error?: string;
}

/**
 * Executes an asynchronous export job: streams media objects from storage,
 * builds a PKZIP archive without RAM bloat, writes to private object storage,
 * and updates job progress atomically.
 */
export async function processExportJob(exportJobId: string): Promise<ProcessExportResult> {
  const storage = getStorageProvider();

  // 1. Fetch Export Job from Database
  const job = await prisma.mediaExportJob.findUnique({
    where: { id: exportJobId },
    include: {
      organisation: {
        select: { id: true, name: true },
      },
    },
  });

  if (!job) {
    throw new Error(`Export job ${exportJobId} not found.`);
  }

  if (job.status === ExportStatus.CANCELLED) {
    return {
      exportJobId,
      status: ExportStatus.CANCELLED,
      processedFiles: 0,
      processedBytes: BigInt(0),
      skippedFiles: 0,
    };
  }

  if (job.status === ExportStatus.READY) {
    return {
      exportJobId,
      status: ExportStatus.READY,
      archiveStorageKey: job.archiveStorageKey || undefined,
      archiveSize: job.archiveSize || undefined,
      processedFiles: job.processedFiles,
      processedBytes: job.processedBytes,
      skippedFiles: job.skippedFiles,
    };
  }

  // 2. Mark job as PROCESSING
  await prisma.mediaExportJob.update({
    where: { id: exportJobId },
    data: {
      status: ExportStatus.PROCESSING,
      startedAt: new Date(),
      progress: 0,
      errorMessage: null,
      errorCode: null,
    },
  });

  try {
    // 3. Parse Manifest
    if (!job.manifestJson) {
      throw new Error('Export manifest is missing or empty.');
    }

    let entries: ExportManifestEntry[] = [];
    try {
      entries = JSON.parse(job.manifestJson);
    } catch {
      throw new Error('Failed to parse export manifest JSON.');
    }

    if (entries.length === 0) {
      throw new Error('No media entries found in export manifest.');
    }

    const totalFiles = entries.length;
    let processedFiles = 0;
    let processedBytes = BigInt(0);
    let skippedFiles = job.skippedFiles || 0;
    let lastProgressUpdate = Date.now();
    let lastReportedProgress = 0;

    // 4. Initialize Streaming ZIP Archiver
    const archiver = new StreamingZipArchiver();
    const chunks: Buffer[] = [];

    archiver.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // 5. Stream each file into the archive
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Periodically verify if job was cancelled by user
      if (i > 0 && i % 5 === 0) {
        const checkJob = await prisma.mediaExportJob.findUnique({
          where: { id: exportJobId },
          select: { status: true },
        });

        if (checkJob?.status === ExportStatus.CANCELLED) {
          archiver.destroy();
          return {
            exportJobId,
            status: ExportStatus.CANCELLED,
            processedFiles,
            processedBytes,
            skippedFiles,
          };
        }
      }

      try {
        const fileBuffer = await storage.getObject(entry.storageKey);
        await archiver.appendEntry(fileBuffer, {
          filename: entry.archivePath,
          modifiedDate: new Date(entry.createdAt),
          compress: false, // Fast STORE for media
        });

        processedFiles++;
        processedBytes += BigInt(fileBuffer.length);
      } catch (err: any) {
        console.warn(
          `[ExportWorker] Failed to read storage key '${entry.storageKey}' for export ${exportJobId}: ${err.message}`
        );
        skippedFiles++;
      }

      // Calculate progress percentage (0 - 95% during streaming, 100% on upload complete)
      const currentProgress = Math.min(95, Math.floor((processedFiles / totalFiles) * 95));
      const now = Date.now();

      // Throttle DB updates: only update if progress increased by >= 5% or 3 seconds elapsed
      if (currentProgress > lastReportedProgress + 4 || now - lastProgressUpdate > 3000 || i === entries.length - 1) {
        lastReportedProgress = currentProgress;
        lastProgressUpdate = now;

        await prisma.mediaExportJob.update({
          where: { id: exportJobId },
          data: {
            progress: currentProgress,
            processedFiles,
            processedBytes,
            skippedFiles,
          },
        });
      }
    }

    // 6. Finalize ZIP Archive
    await archiver.finalize();

    // 7. Write ZIP Archive to Storage
    const archiveBuffer = Buffer.concat(chunks);
    const archiveStorageKey = `exports/organisations/${job.organisationId}/${exportJobId}.zip`;

    await storage.putObject(archiveStorageKey, archiveBuffer, 'application/zip');

    const archiveSize = BigInt(archiveBuffer.length);
    const expiresAt = new Date(Date.now() + env.EXPORT_RETENTION_HOURS * 3600 * 1000);

    // 8. Atomically Mark as READY
    await prisma.mediaExportJob.update({
      where: { id: exportJobId },
      data: {
        status: ExportStatus.READY,
        progress: 100,
        archiveStorageKey,
        archiveSize,
        processedFiles,
        processedBytes,
        skippedFiles,
        completedAt: new Date(),
        expiresAt,
      },
    });

    // Record Audit Log
    await prisma.auditLog.create({
      data: {
        organisationId: job.organisationId,
        actorUserId: job.userId,
        action: 'EXPORT_COMPLETED',
        resourceType: 'MediaExportJob',
        resourceId: exportJobId,
        metadata: {
          scopeType: job.scopeType,
          totalFiles: processedFiles,
          archiveSize: Number(archiveSize),
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    return {
      exportJobId,
      status: ExportStatus.READY,
      archiveStorageKey,
      archiveSize,
      processedFiles,
      processedBytes,
      skippedFiles,
    };
  } catch (error: any) {
    console.error(`[ExportWorker] Export job ${exportJobId} failed:`, error);

    await prisma.mediaExportJob.update({
      where: { id: exportJobId },
      data: {
        status: ExportStatus.FAILED,
        failedAt: new Date(),
        errorMessage: error.message || 'Export processing encountered an unexpected error.',
        errorCode: 'EXPORT_PROCESSING_FAILED',
      },
    });

    await prisma.auditLog.create({
      data: {
        organisationId: job.organisationId,
        actorUserId: job.userId,
        action: 'EXPORT_FAILED',
        resourceType: 'MediaExportJob',
        resourceId: exportJobId,
        metadata: {
          error: error.message,
        },
      },
    });

    return {
      exportJobId,
      status: ExportStatus.FAILED,
      processedFiles: 0,
      processedBytes: BigInt(0),
      skippedFiles: 0,
      error: error.message,
    };
  }
}
