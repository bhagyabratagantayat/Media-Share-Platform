import { ExportScope, ExportStatus } from '@prisma/client';

export interface MediaExportJobData {
  exportJobId: string;
  organisationId: string;
  userId: string;
  scopeType: ExportScope;
  eventId?: string | null;
  albumId?: string | null;
  requestedVariant: 'ORIGINAL' | 'OPTIMIZED';
  createdAt: string;
}

export interface ExportProgressEvent {
  exportJobId: string;
  status: ExportStatus;
  progress: number;
  processedFiles: number;
  totalFiles: number;
  processedBytes: number;
  totalBytes: number;
  skippedFiles: number;
  archiveSize?: number;
  downloadUrl?: string;
  errorMessage?: string;
  errorCode?: string;
}
