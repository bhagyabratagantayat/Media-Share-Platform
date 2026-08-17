import {
  S3Client,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageProvider,
  StorageObjectMeta,
  UploadPartInput,
  MultipartUploadInit,
  MultipartUploadCompleteResult,
} from './storage';
import { env } from '@/config/env';

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  defaultUploadExpiresSeconds?: number;
  defaultDownloadExpiresSeconds?: number;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private defaultUploadExpiresSeconds: number;
  private defaultDownloadExpiresSeconds: number;

  constructor(config?: Partial<S3StorageConfig>) {
    this.bucket = config?.bucket || env.S3_BUCKET;
    this.defaultUploadExpiresSeconds =
      config?.defaultUploadExpiresSeconds || env.S3_UPLOAD_URL_EXPIRES_SECONDS;
    this.defaultDownloadExpiresSeconds =
      config?.defaultDownloadExpiresSeconds || env.S3_DOWNLOAD_URL_EXPIRES_SECONDS;

    const accessKeyId = config?.accessKeyId || env.S3_ACCESS_KEY_ID;
    const secretAccessKey = config?.secretAccessKey || env.S3_SECRET_ACCESS_KEY;
    const endpoint = config?.endpoint || env.S3_ENDPOINT;
    const region = config?.region || env.S3_REGION;
    const forcePathStyle = config?.forcePathStyle ?? env.S3_FORCE_PATH_STYLE;

    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds?: number
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds || this.defaultUploadExpiresSeconds,
    });
  }

  async createMultipartUpload(
    key: string,
    contentType: string
  ): Promise<MultipartUploadInit> {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const response = await this.client.send(command);

    if (!response.UploadId) {
      throw new Error(`Failed to initiate multipart upload for key '${key}'.`);
    }

    return {
      uploadId: response.UploadId,
      key,
    };
  }

  async createPartUploadUrl(
    key: string,
    uploadId: string,
    partNumber: number,
    expiresInSeconds?: number
  ): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds || this.defaultUploadExpiresSeconds,
    });
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: UploadPartInput[]
  ): Promise<MultipartUploadCompleteResult> {
    const sortedParts = [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => ({
        PartNumber: p.partNumber,
        ETag: p.etag.replace(/"/g, ''), // Strip surrounding quotes if present
      }));

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    });

    const response = await this.client.send(command);

    return {
      location: response.Location,
      etag: response.ETag,
    };
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });

    await this.client.send(command);
  }

  async headObject(key: string): Promise<StorageObjectMeta | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        contentLength: response.ContentLength || 0,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (err: any) {
      if (
        err.name === 'NotFound' ||
        err.name === 'NoSuchKey' ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty response body for object '${key}'.`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array,
    contentType: string
  ): Promise<{ etag?: string }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    const response = await this.client.send(command);
    return {
      etag: response.ETag,
    };
  }

  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: keys.map((Key) => ({ Key })),
        Quiet: true,
      },
    });

    await this.client.send(command);
  }

  async createDownloadUrl(
    key: string,
    expiresInSeconds?: number,
    downloadFilename?: string
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: downloadFilename
        ? `attachment; filename="${encodeURIComponent(downloadFilename)}"`
        : undefined,
    });

    return getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds || this.defaultDownloadExpiresSeconds,
    });
  }
}
