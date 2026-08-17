import { CdnProvider } from './cdn';
import { MediaAccessUrlOptions, DownloadUrlOptions } from './types';
import { getStorageProvider } from '@/server/storage';
import { env } from '@/config/env';

export class StorageDirectCdnProvider implements CdnProvider {
  getProviderName(): string {
    return 'storage_direct';
  }

  async generateMediaAccessUrl(
    storageKey: string,
    options?: MediaAccessUrlOptions
  ): Promise<string> {
    const storage = getStorageProvider();
    const expiresIn = options?.expiresInSeconds || env.MEDIA_URL_EXPIRES_SECONDS;
    return storage.createDownloadUrl(storageKey, expiresIn);
  }

  async generateDownloadUrl(
    storageKey: string,
    filename: string,
    options?: DownloadUrlOptions
  ): Promise<string> {
    const storage = getStorageProvider();
    const expiresIn = options?.expiresInSeconds || env.DOWNLOAD_URL_EXPIRES_SECONDS;
    return storage.createDownloadUrl(storageKey, expiresIn, filename);
  }

  verifyAccessSignature(
    _storageKey: string,
    _token: string,
    _expiresTimestamp: number
  ): boolean {
    // Storage direct delegates signature checking to the object storage provider
    return true;
  }
}
