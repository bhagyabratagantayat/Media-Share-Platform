import { VariantType } from '@prisma/client';

export type MediaDeliveryType =
  | 'THUMBNAIL'
  | 'PREVIEW'
  | 'OPTIMIZED_IMAGE'
  | 'OPTIMIZED_VIDEO'
  | 'ORIGINAL'
  | 'STREAM'
  | 'DOWNLOAD';

export interface MediaAccessUrlOptions {
  expiresInSeconds?: number;
  deliveryType?: MediaDeliveryType;
  ip?: string;
  version?: number;
}

export interface DownloadUrlOptions {
  expiresInSeconds?: number;
  deliveryType?: MediaDeliveryType;
  filename?: string;
  isOriginal?: boolean;
}

export interface MediaAccessResult {
  url: string;
  variantType: VariantType;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  fileSize?: number | null;
  expiresAt: Date;
}

export interface BatchMediaAccessItem {
  mediaItemId: string;
  url?: string;
  thumbnailUrl?: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  status: string;
  error?: string;
}
