import crypto from 'crypto';
import { CdnProvider } from './cdn';
import { MediaAccessUrlOptions, DownloadUrlOptions } from './types';
import { env } from '@/config/env';

export class CloudflareCdnProvider implements CdnProvider {
  private baseUrl: string;
  private signingSecret: string;
  private defaultExpiry: number;

  constructor(
    baseUrl = env.CDN_BASE_URL,
    signingSecret = env.CDN_SIGNING_SECRET,
    defaultExpiry = env.MEDIA_URL_EXPIRES_SECONDS
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.signingSecret = signingSecret;
    this.defaultExpiry = defaultExpiry;
  }

  getProviderName(): string {
    return 'cloudflare';
  }

  async generateMediaAccessUrl(
    storageKey: string,
    options?: MediaAccessUrlOptions
  ): Promise<string> {
    const cleanKey = storageKey.replace(/^\/+/, '');
    const expiresIn = options?.expiresInSeconds || this.defaultExpiry;
    const exp = Math.floor(Date.now() / 1000) + expiresIn;

    const signature = this.generateHmacSignature(cleanKey, exp);
    const params = new URLSearchParams({
      token: signature,
      exp: exp.toString(),
    });

    if (options?.deliveryType) {
      params.set('variant', options.deliveryType.toLowerCase());
    }

    return `${this.baseUrl}/${cleanKey}?${params.toString()}`;
  }

  async generateDownloadUrl(
    storageKey: string,
    filename: string,
    options?: DownloadUrlOptions
  ): Promise<string> {
    const cleanKey = storageKey.replace(/^\/+/, '');
    const expiresIn = options?.expiresInSeconds || env.DOWNLOAD_URL_EXPIRES_SECONDS;
    const exp = Math.floor(Date.now() / 1000) + expiresIn;

    const signature = this.generateHmacSignature(cleanKey, exp);
    const sanitizedFilename = encodeURIComponent(filename.replace(/["\r\n]/g, '_'));

    const params = new URLSearchParams({
      token: signature,
      exp: exp.toString(),
      'response-content-disposition': `attachment; filename="${sanitizedFilename}"`,
    });

    return `${this.baseUrl}/${cleanKey}?${params.toString()}`;
  }

  verifyAccessSignature(
    storageKey: string,
    token: string,
    expiresTimestamp: number
  ): boolean {
    if (!token || !expiresTimestamp) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (expiresTimestamp < now) {
      return false; // Expired
    }

    const cleanKey = storageKey.replace(/^\/+/, '');
    const expectedSignature = this.generateHmacSignature(cleanKey, expiresTimestamp);

    const tokenBuf = Buffer.from(token, 'hex');
    const expectedBuf = Buffer.from(expectedSignature, 'hex');

    if (tokenBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
  }

  private generateHmacSignature(path: string, exp: number): string {
    const payload = `${path}|${exp}`;
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(payload)
      .digest('hex');
  }
}
