import { MediaAccessUrlOptions, DownloadUrlOptions } from './types';

export interface CdnProvider {
  /**
   * Generates a short-lived authorized CDN URL for media delivery (thumbnail, optimized image/video, stream).
   */
  generateMediaAccessUrl(
    storageKey: string,
    options?: MediaAccessUrlOptions
  ): Promise<string>;

  /**
   * Generates an authorized download CDN URL with Content-Disposition attachment headers.
   */
  generateDownloadUrl(
    storageKey: string,
    filename: string,
    options?: DownloadUrlOptions
  ): Promise<string>;

  /**
   * Verifies the cryptographic token signature, expiry timestamp, and path isolation.
   */
  verifyAccessSignature(
    storageKey: string,
    token: string,
    expiresTimestamp: number
  ): boolean;

  /**
   * Returns the registered identifier of the CDN provider.
   */
  getProviderName(): string;
}
