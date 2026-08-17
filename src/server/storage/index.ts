import { StorageProvider } from './storage';
import { S3StorageProvider } from './s3-storage';
import { MockStorageProvider } from './mock-storage';
import { env } from '@/config/env';

let storageInstance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageInstance) {
    if (env.STORAGE_PROVIDER === 'mock' || env.NODE_ENV === 'test') {
      storageInstance = new MockStorageProvider();
    } else {
      storageInstance = new S3StorageProvider();
    }
  }
  return storageInstance;
}

export function setStorageProvider(provider: StorageProvider): void {
  storageInstance = provider;
}

export * from './storage';
export * from './s3-storage';
export * from './mock-storage';
