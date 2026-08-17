import {
  StorageProvider,
  StorageObjectMeta,
  UploadPartInput,
  MultipartUploadInit,
  MultipartUploadCompleteResult,
} from './storage';
import crypto from 'crypto';

interface MockStoredObject {
  contentLength: number;
  contentType: string;
  etag: string;
  lastModified: Date;
  metadata?: Record<string, string>;
  data?: Buffer;
}

interface MockMultipartSession {
  key: string;
  contentType: string;
  parts: Map<number, { etag: string; size: number }>;
}

export class MockStorageProvider implements StorageProvider {
  private objects = new Map<string, MockStoredObject>();
  private multipartSessions = new Map<string, MockMultipartSession>();

  // Utility to seed objects for testing
  seedObject(key: string, meta: Partial<MockStoredObject> & { data?: Buffer }) {
    this.objects.set(key, {
      contentLength: meta.contentLength || (meta.data ? meta.data.length : 1024),
      contentType: meta.contentType || 'image/jpeg',
      etag: meta.etag || '"mock-etag-12345"',
      lastModified: meta.lastModified || new Date(),
      metadata: meta.metadata,
      data: meta.data,
    });
  }

  clear() {
    this.objects.clear();
    this.multipartSessions.clear();
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 900
  ): Promise<string> {
    const signature = crypto.randomBytes(8).toString('hex');
    // Pre-register the object so headObject can find it upon upload completion in mock tests
    this.objects.set(key, {
      contentLength: 2048,
      contentType,
      etag: `"${crypto.randomBytes(16).toString('hex')}"`,
      lastModified: new Date(),
      data: Buffer.from('mock-file-content'),
    });

    return `https://mock-storage.local/upload/${encodeURIComponent(key)}?expires=${expiresInSeconds}&sig=${signature}`;
  }

  async createMultipartUpload(
    key: string,
    contentType: string
  ): Promise<MultipartUploadInit> {
    const uploadId = `mock-upload-${crypto.randomUUID()}`;
    this.multipartSessions.set(uploadId, {
      key,
      contentType,
      parts: new Map(),
    });

    return { uploadId, key };
  }

  async createPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds = 900
  ): Promise<string> {
    const session = this.multipartSessions.get(uploadId);
    if (!session || session.key !== key) {
      throw new Error(`Multipart session not found for upload ID '${uploadId}'.`);
    }

    const etag = `"${crypto.randomBytes(16).toString('hex')}"`;
    session.parts.set(partNumber, { etag, size: 5242880 });

    return `https://mock-storage.local/multipart/${uploadId}/part/${partNumber}?expires=${expiresInSeconds}`;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPartInput[]
  ): Promise<MultipartUploadCompleteResult> {
    const session = this.multipartSessions.get(uploadId);
    if (!session || session.key !== key) {
      throw new Error(`Multipart session not found for upload ID '${uploadId}'.`);
    }

    const totalSize = parts.length * 5242880;
    const finalEtag = `"${crypto.randomBytes(16).toString('hex')}-${parts.length}"`;

    this.objects.set(key, {
      contentLength: totalSize,
      contentType: session.contentType,
      etag: finalEtag,
      lastModified: new Date(),
      data: Buffer.alloc(totalSize),
    });

    this.multipartSessions.delete(uploadId);

    return {
      location: `https://mock-storage.local/objects/${encodeURIComponent(key)}`,
      etag: finalEtag,
    };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    this.multipartSessions.delete(uploadId);
  }

  async headObject(key: string): Promise<StorageObjectMeta | null> {
    const obj = this.objects.get(key);
    if (!obj) return null;

    return {
      contentLength: obj.contentLength,
      contentType: obj.contentType,
      etag: obj.etag,
      lastModified: obj.lastModified,
      metadata: obj.metadata,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`Object not found in mock storage: '${key}'.`);
    }
    return obj.data || Buffer.from('mock-file-binary-payload');
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<{ etag?: string }> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const etag = `"${crypto.randomBytes(16).toString('hex')}"`;

    this.objects.set(key, {
      contentLength: buf.length,
      contentType,
      etag,
      lastModified: new Date(),
      data: buf,
    });

    return { etag };
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.objects.delete(key);
    }
  }

  async createDownloadUrl(
    key: string,
    expiresInSeconds = 300,
    downloadFilename?: string
  ): Promise<string> {
    const obj = this.objects.get(key);
    if (!obj) {
      throw new Error(`Object not found: ${key}`);
    }

    const filenameParam = downloadFilename ? `&filename=${encodeURIComponent(downloadFilename)}` : '';
    return `https://mock-storage.local/download/${encodeURIComponent(key)}?expires=${expiresInSeconds}${filenameParam}`;
  }
}
