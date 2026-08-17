import { CdnProvider } from './cdn';
import { CloudflareCdnProvider } from './cloudflare-cdn';
import { CloudFrontCdnProvider } from './cloudfront-cdn';
import { MockCdnProvider } from './mock-cdn';
import { StorageDirectCdnProvider } from './storage-direct-cdn';
import { env } from '@/config/env';

let currentCdnProvider: CdnProvider | null = null;

export function getCdnProvider(): CdnProvider {
  if (currentCdnProvider) {
    return currentCdnProvider;
  }

  const providerType = env.CDN_PROVIDER;

  switch (providerType) {
    case 'cloudflare':
      currentCdnProvider = new CloudflareCdnProvider();
      break;
    case 'cloudfront':
      currentCdnProvider = new CloudFrontCdnProvider();
      break;
    case 'storage_direct':
      currentCdnProvider = new StorageDirectCdnProvider();
      break;
    case 'mock':
    default:
      currentCdnProvider = new MockCdnProvider();
      break;
  }

  return currentCdnProvider;
}

export function setCdnProvider(provider: CdnProvider): void {
  currentCdnProvider = provider;
}

/**
 * Helper to generate CDN URLs for a media item's variants.
 */
export async function generateMediaCdnUrls(
  mediaId: string,
  variants: Array<{ variantType: string; storageKey: string }> = [],
  _options?: { userId?: string; organisationId?: string; userRole?: string }
): Promise<{ thumbnailUrl: string; previewUrl: string; originalUrl: string }> {
  const cdn = getCdnProvider();
  const thumb = variants.find((v) => v.variantType === 'THUMBNAIL');
  const opt = variants.find((v) => v.variantType === 'OPTIMIZED');
  const original = variants.find((v) => v.variantType === 'ORIGINAL');

  const thumbKey = thumb?.storageKey || opt?.storageKey || original?.storageKey;
  const previewKey = opt?.storageKey || original?.storageKey || thumb?.storageKey;

  const thumbnailUrl = thumbKey
    ? await cdn.generateMediaAccessUrl(thumbKey, {
        deliveryType: 'THUMBNAIL',
        expiresInSeconds: env.MEDIA_URL_EXPIRES_SECONDS,
      })
    : `/api/media/${mediaId}/thumbnail`;

  const previewUrl = previewKey
    ? await cdn.generateMediaAccessUrl(previewKey, {
        deliveryType: 'PREVIEW',
        expiresInSeconds: env.MEDIA_URL_EXPIRES_SECONDS,
      })
    : `/api/media/${mediaId}/preview`;

  const originalUrl = `/api/media/${mediaId}/download`;

  return {
    thumbnailUrl,
    previewUrl,
    originalUrl,
  };
}

export * from './types';
export * from './cdn';
export * from './cloudflare-cdn';
export * from './cloudfront-cdn';
export * from './mock-cdn';
export * from './storage-direct-cdn';
export * from './media-access-service';
