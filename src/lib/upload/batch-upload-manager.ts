export interface UploadFileItem {
  id: string; // client-generated local id
  file: File;
  batchItemId?: string;
  uploadSessionId?: string;
  mediaItemId?: string;
  status: 'PENDING' | 'PREPARING' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED';
  progress: number; // 0 to 100
  uploadedBytes: number;
  totalBytes: number;
  error?: string;
  uploadUrl?: string;
  isMultipart?: boolean;
  partsCount?: number;
  parts?: { partNumber: number; uploadUrl: string }[];
  chunkSize?: number;
  uploadId?: string;
}

export interface BatchUploadOptions {
  slug: string;
  eventId: string;
  albumId?: string | null;
  concurrency?: number;
  onItemProgress?: (item: UploadFileItem) => void;
  onItemStatusChange?: (item: UploadFileItem) => void;
  onBatchProgress?: (overallProgress: number, uploadedBytes: number, totalBytes: number) => void;
  onBatchComplete?: (completed: number, failed: number, cancelled: number) => void;
}

export class BatchUploadManager {
  private items: UploadFileItem[] = [];
  private options: BatchUploadOptions;
  private batchId: string | null = null;
  private isCancelled = false;
  private isPaused = false;
  private activeUploads = 0;
  private concurrency: number;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(files: File[], options: BatchUploadOptions) {
    this.options = options;
    this.concurrency = options.concurrency || 6;
    this.items = files.map((file, index) => ({
      id: `client-file-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`,
      file,
      status: 'PENDING',
      progress: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
    }));
  }

  public getItems(): UploadFileItem[] {
    return this.items;
  }

  public getBatchId(): string | null {
    return this.batchId;
  }

  /**
   * Starts the batch creation and controlled concurrent upload pipeline.
   */
  public async start() {
    this.isCancelled = false;
    this.isPaused = false;

    // 1. Create the batch on the server
    const batchPayload = {
      eventId: this.options.eventId,
      albumId: this.options.albumId || null,
      files: this.items.map((item) => ({
        fileName: item.file.name,
        fileSize: item.file.size,
        mimeType: item.file.type || 'application/octet-stream',
      })),
    };

    const res = await fetch(`/api/organisations/${this.options.slug}/media-team/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batchPayload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Failed to create upload batch on server.');
    }

    const batchData = await res.json();
    this.batchId = batchData.data.id;

    // 2. Begin pipeline loop
    await this.processQueue();
  }

  /**
   * Continuously pulls chunks of sessions and uploads with concurrency limit.
   */
  private async processQueue() {
    if (this.isCancelled || this.isPaused || !this.batchId) return;

    // Prepare next sessions chunk from backend if any pending without sessions
    const pendingItems = this.items.filter((i) => i.status === 'PENDING');
    if (pendingItems.length > 0) {
      try {
        const prepRes = await fetch(
          `/api/organisations/${this.options.slug}/media-team/batches/${this.batchId}/prepare`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 25 }),
          }
        );

        if (prepRes.ok) {
          const prepData = await prepRes.json();
          const prepared = prepData.data?.items || [];

          for (const prep of prepared) {
            // Find corresponding client item
            const item = this.items.find(
              (i) =>
                i.status === 'PENDING' &&
                i.file.name === prep.fileName &&
                i.file.size === prep.fileSize
            );

            if (item) {
              if (prep.error) {
                item.status = 'FAILED';
                item.error = prep.error;
                item.batchItemId = prep.batchItemId;
                this.options.onItemStatusChange?.(item);
              } else if (prep.session) {
                item.batchItemId = prep.batchItemId;
                item.uploadSessionId = prep.session.uploadSessionId;
                item.mediaItemId = prep.session.mediaItemId;
                item.uploadUrl = prep.session.uploadUrl;
                item.isMultipart = prep.session.isMultipart;
                item.parts = prep.session.parts;
                item.partsCount = prep.session.partsCount;
                item.chunkSize = prep.session.chunkSize;
                item.uploadId = prep.session.uploadId;
              }
            }
          }
        }
      } catch (err) {
        console.warn('Chunk preparation error:', err);
      }
    }

    // Schedule available uploads up to concurrency
    while (this.activeUploads < this.concurrency && !this.isCancelled && !this.isPaused) {
      const nextItem = this.items.find(
        (i) => i.status === 'PENDING' && i.batchItemId && (i.uploadUrl || i.parts)
      );

      if (!nextItem) break;

      this.activeUploads++;
      this.uploadItem(nextItem).finally(() => {
        this.activeUploads--;
        this.updateOverallProgress();
        this.processQueue();
      });
    }

    // Check if entire batch completed
    const allTerminal = this.items.every((i) =>
      ['READY', 'PROCESSING', 'FAILED', 'CANCELLED'].includes(i.status)
    );

    if (allTerminal && this.activeUploads === 0) {
      const completed = this.items.filter((i) => ['READY', 'PROCESSING'].includes(i.status)).length;
      const failed = this.items.filter((i) => i.status === 'FAILED').length;
      const cancelled = this.items.filter((i) => i.status === 'CANCELLED').length;
      this.options.onBatchComplete?.(completed, failed, cancelled);
    }
  }

  /**
   * Uploads a single file directly to object storage via signed URL.
   */
  private async uploadItem(item: UploadFileItem) {
    if (this.isCancelled) return;

    item.status = 'UPLOADING';
    item.progress = 0;
    this.options.onItemStatusChange?.(item);

    const controller = new AbortController();
    this.abortControllers.set(item.id, controller);

    try {
      if (!item.isMultipart && item.uploadUrl) {
        // Single Direct S3 PUT
        await this.uploadSinglePut(item, item.uploadUrl, controller.signal);
      } else if (item.isMultipart && item.parts && item.chunkSize) {
        // Multipart upload
        await this.uploadMultipart(item, controller.signal);
      } else {
        throw new Error('Missing upload URL or multipart part information.');
      }

      // Notify server of completion
      const compRes = await fetch(
        `/api/organisations/${this.options.slug}/media-team/batches/${this.batchId}/items/${item.batchItemId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      if (!compRes.ok) {
        const errJson = await compRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Server completion verification failed.');
      }

      item.status = 'PROCESSING';
      item.progress = 100;
      item.uploadedBytes = item.totalBytes;
      this.options.onItemStatusChange?.(item);
    } catch (err: any) {
      if (controller.signal.aborted) {
        item.status = 'CANCELLED';
        item.error = 'Upload cancelled by user.';
      } else {
        item.status = 'FAILED';
        item.error = err.message || 'Upload failed.';

        // Report failure to server
        if (this.batchId && item.batchItemId) {
          fetch(
            `/api/organisations/${this.options.slug}/media-team/batches/${this.batchId}/items/${item.batchItemId}/fail`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ errorCode: 'DIRECT_UPLOAD_FAILED', errorMessage: item.error }),
            }
          ).catch(() => {});
        }
      }
      this.options.onItemStatusChange?.(item);
    } finally {
      this.abortControllers.delete(item.id);
    }
  }

  /**
   * Uploads single file with XMLHttpRequest for granular progress tracking.
   * Supports S3 PUT and Cloudinary POST FormData.
   */
  private uploadSinglePut(item: UploadFileItem, uploadUrl: string, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const isCloudinary = uploadUrl.includes('cloudinary.com');

      if (isCloudinary) {
        try {
          const parsedUrl = new URL(uploadUrl);
          const timestamp = parsedUrl.searchParams.get('timestamp');
          const publicId = parsedUrl.searchParams.get('public_id');
          const apiKey = parsedUrl.searchParams.get('api_key');
          const signature = parsedUrl.searchParams.get('signature');
          const uploadPreset = parsedUrl.searchParams.get('upload_preset');

          const baseEndpoint = `${parsedUrl.origin}${parsedUrl.pathname}`;
          xhr.open('POST', baseEndpoint, true);

          const formData = new FormData();
          formData.append('file', item.file);
          if (apiKey) formData.append('api_key', apiKey);
          if (timestamp) formData.append('timestamp', timestamp);
          if (signature) formData.append('signature', signature);
          if (publicId) formData.append('public_id', publicId);
          if (uploadPreset) formData.append('upload_preset', uploadPreset);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              item.uploadedBytes = e.loaded;
              item.progress = Math.min(99, Math.round((e.loaded / e.total) * 100));
              this.options.onItemProgress?.(item);
              this.updateOverallProgress();
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              let msg = `Cloudinary returned ${xhr.status}`;
              try {
                const parsed = JSON.parse(xhr.responseText);
                if (parsed.error?.message) {
                  msg = parsed.error.message;
                }
              } catch {}
              reject(new Error(msg));
            }
          };

          xhr.onerror = () => {
            reject(new Error('Network error occurred during Cloudinary upload.'));
          };

          xhr.onabort = () => {
            reject(new Error('Upload aborted by user.'));
          };

          signal.addEventListener('abort', () => xhr.abort());
          xhr.send(formData);
        } catch (err: any) {
          reject(err);
        }
      } else {
        // Standard S3 PUT
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            item.uploadedBytes = e.loaded;
            item.progress = Math.min(99, Math.round((e.loaded / e.total) * 100));
            this.options.onItemProgress?.(item);
            this.updateOverallProgress();
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage server returned HTTP ${xhr.status}: ${xhr.statusText}`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error occurred during direct storage upload.'));
        };

        xhr.onabort = () => {
          reject(new Error('Upload aborted.'));
        };

        signal.addEventListener('abort', () => xhr.abort());
        xhr.send(item.file);
      }
    });
  }

  /**
   * Uploads multipart chunks sequentially or with small internal parallelism.
   */
  private async uploadMultipart(item: UploadFileItem, signal: AbortSignal): Promise<void> {
    const parts = item.parts || [];
    const chunkSize = item.chunkSize || 10485760;
    const uploadedParts: { partNumber: number; etag: string }[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (signal.aborted) throw new Error('Upload aborted');

      const partInfo = parts[i];
      const start = (partInfo.partNumber - 1) * chunkSize;
      const end = Math.min(item.file.size, start + chunkSize);
      const chunk = item.file.slice(start, end);

      const res = await fetch(partInfo.uploadUrl, {
        method: 'PUT',
        body: chunk,
        signal,
      });

      if (!res.ok) {
        throw new Error(`Part ${partInfo.partNumber} upload failed with status ${res.status}`);
      }

      const etag = res.headers.get('ETag') || `part-${partInfo.partNumber}`;
      uploadedParts.push({ partNumber: partInfo.partNumber, etag });

      item.uploadedBytes = Math.min(item.totalBytes, (i + 1) * chunkSize);
      item.progress = Math.min(99, Math.round((item.uploadedBytes / item.totalBytes) * 100));
      this.options.onItemProgress?.(item);
      this.updateOverallProgress();
    }
  }

  private updateOverallProgress() {
    const totalBytes = this.items.reduce((acc, i) => acc + i.totalBytes, 0);
    const uploadedBytes = this.items.reduce((acc, i) => acc + i.uploadedBytes, 0);
    const overallProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
    this.options.onBatchProgress?.(overallProgress, uploadedBytes, totalBytes);
  }

  /**
   * Cancels a specific file item.
   */
  public cancelItem(itemId: string) {
    const item = this.items.find((i) => i.id === itemId);
    if (item && (item.status === 'PENDING' || item.status === 'UPLOADING')) {
      const controller = this.abortControllers.get(itemId);
      if (controller) {
        controller.abort();
      }
      item.status = 'CANCELLED';
      item.error = 'Cancelled by user.';
      this.options.onItemStatusChange?.(item);
    }
  }

  /**
   * Cancels the whole batch.
   */
  public cancelAll() {
    this.isCancelled = true;
    this.abortControllers.forEach((controller) => {
      controller.abort();
    });
    this.abortControllers.clear();

    for (const item of this.items) {
      if (item.status === 'PENDING' || item.status === 'UPLOADING') {
        item.status = 'CANCELLED';
      }
    }

    if (this.batchId) {
      fetch(`/api/organisations/${this.options.slug}/media-team/batches/${this.batchId}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  }

  /**
   * Retries failed items.
   */
  public retryFailed() {
    const failed = this.items.filter((i) => i.status === 'FAILED');
    for (const item of failed) {
      item.status = 'PENDING';
      item.progress = 0;
      item.uploadedBytes = 0;
      item.error = undefined;
      item.uploadSessionId = undefined;
      item.uploadUrl = undefined;
      this.options.onItemStatusChange?.(item);
    }

    if (this.batchId) {
      fetch(`/api/organisations/${this.options.slug}/media-team/batches/${this.batchId}/retry`, {
        method: 'POST',
      }).catch(() => {});
    }

    this.processQueue();
  }
}
