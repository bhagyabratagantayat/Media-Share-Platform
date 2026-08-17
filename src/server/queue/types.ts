import { VariantType, MediaType, UploadType } from '@prisma/client';

export interface MediaProcessingJobData {
  mediaItemId: string;
  organisationId: string;
  eventId: string;
  albumId?: string | null;
  userId: string;
  mediaType: MediaType;
  originalStorageKey: string;
  mimeType: string;
  fileName: string;
  uploadType: UploadType;
  processingVersion: number;
}

export interface CreatedVariantInfo {
  variantType: VariantType;
  storageKey: string;
  fileSize: number;
  width?: number;
  height?: number;
  mimeType: string;
  durationMs?: number;
  bitrate?: number;
  codec?: string;
}

export interface MediaProcessingResult {
  success: boolean;
  mediaItemId: string;
  variantsCreated: CreatedVariantInfo[];
  originalFileSize?: number;
  optimizedFileSize?: number;
  compressionRatio?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  frameRate?: number;
  codec?: string;
  error?: string;
}
