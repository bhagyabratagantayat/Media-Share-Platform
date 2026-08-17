export interface StorageObjectMeta {
  contentLength: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface UploadPartInput {
  partNumber: number;
  etag: string;
}

export interface MultipartUploadInit {
  uploadId: string;
  key: string;
}

export interface MultipartUploadCompleteResult {
  location?: string;
  etag?: string;
}

/**
 * StorageProvider abstraction representing S3, Cloudflare R2, MinIO, or test mocks.
 */
export interface StorageProvider {
  /**
   * Generates a short-lived presigned URL for direct single PUT upload.
   */
  createUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;

  /**
   * Initiates a multipart upload and returns the upload ID.
   */
  createMultipartUpload(key: string, contentType: string): Promise<MultipartUploadInit>;

  /**
   * Generates a short-lived presigned URL for uploading a specific multipart chunk.
   */
  createPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number
  ): Promise<string>;

  /**
   * Assembles the uploaded parts and completes the multipart upload.
   */
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPartInput[]
  ): Promise<MultipartUploadCompleteResult>;

  /**
   * Aborts an in-progress multipart upload and cleans up stored parts.
   */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /**
   * Retrieves object metadata (size, etag, content type) from storage without downloading the payload.
   */
  headObject(key: string): Promise<StorageObjectMeta | null>;

  /**
   * Downloads an object's binary buffer from storage for server-side processing.
   */
  getObject(key: string): Promise<Buffer>;

  /**
   * Uploads an object directly from a Buffer/Uint8Array to storage (for processed variants).
   */
  putObject(key: string, data: Buffer | Uint8Array, contentType: string): Promise<{ etag?: string }>;

  /**
   * Permanently deletes an object from storage.
   */
  deleteObject(key: string): Promise<void>;

  /**
   * Permanently deletes multiple objects from storage in batch.
   */
  deleteObjects(keys: string[]): Promise<void>;

  /**
   * Generates a short-lived presigned URL for secure authorised file downloads.
   */
  createDownloadUrl(
    key: string,
    expiresInSeconds?: number,
    downloadFilename?: string
  ): Promise<string>;
}
