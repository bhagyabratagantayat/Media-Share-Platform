import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // Database Connection
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().optional(),

  // Authentication & Cryptography Secrets (Strict 32 chars in production)
  AUTH_SECRET: z
    .string()
    .min(16, 'AUTH_SECRET must be at least 16 characters in development')
    .refine(
      (val) => process.env.NODE_ENV !== 'production' || val.length >= 32,
      'AUTH_SECRET must be at least 32 characters in production'
    ),
  SESSION_SECRET: z
    .string()
    .min(16, 'SESSION_SECRET must be at least 16 characters in development')
    .refine(
      (val) => process.env.NODE_ENV !== 'production' || val.length >= 32,
      'SESSION_SECRET must be at least 32 characters in production'
    ),
  ARGON2_PEPPER: z.string().default(''),

  // Redis & BullMQ Queue Infrastructure (Phase 5)
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Background Media Worker Concurrency & Limits (Phase 5)
  IMAGE_WORKER_CONCURRENCY: z.coerce.number().default(4),
  VIDEO_WORKER_CONCURRENCY: z.coerce.number().default(2),
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().default(7200), // 2 hours
  MAX_PROCESSING_TIME_SECONDS: z.coerce.number().default(600), // 10 minutes
  KEEP_ORIGINALS: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .default(true),
  MEDIA_PROCESSING_VERSION: z.coerce.number().default(1),
  THUMBNAIL_MAX_DIMENSION: z.coerce.number().default(400),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  // Object Storage Architecture (S3 or Cloudinary)
  STORAGE_PROVIDER: z.enum(['s3', 'mock', 'local', 'cloudinary']).default('cloudinary'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'bbty6ctr'),
  CLOUDINARY_API_KEY: z.string().optional().default('769223324249544'),
  CLOUDINARY_API_SECRET: z.string().optional().default('oKk-BtSMAYh2ndLAbZn_Fbyb4tg'),
  CLOUDINARY_URL: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('media-share-bucket'),
  S3_ACCESS_KEY_ID: z.string().optional().default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().optional().default('minioadmin'),
  S3_FORCE_PATH_STYLE: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .default(true),
  S3_UPLOAD_URL_EXPIRES_SECONDS: z.coerce.number().default(900), // 15 mins
  S3_DOWNLOAD_URL_EXPIRES_SECONDS: z.coerce.number().default(300), // 5 mins

  // Upload Quotas & File Size Controls
  MAX_IMAGE_UPLOAD_BYTES: z.coerce.number().default(52428800), // 50 MB
  MAX_VIDEO_UPLOAD_BYTES: z.coerce.number().default(2147483648), // 2 GB
  MULTIPART_CHUNK_SIZE_BYTES: z.coerce.number().default(10485760), // 10 MB per part

  // Content Delivery Network & Secure Media Delivery (Phase 6)
  CDN_PROVIDER: z.enum(['cloudflare', 'cloudfront', 'storage_direct', 'mock']).default('mock'),
  CDN_BASE_URL: z.string().default('https://media.example.com'),
  CDN_SIGNING_SECRET: z.string().min(16).default('cdn-signing-secret-default-key-32-chars!'),
  MEDIA_URL_EXPIRES_SECONDS: z.coerce.number().default(300), // 5 minutes
  DOWNLOAD_URL_EXPIRES_SECONDS: z.coerce.number().default(300), // 5 minutes
  ALLOW_ORIGINAL_DOWNLOAD_DEFAULT: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .default(false),

  // Social Media Team & Bulk Upload Workflow (Phase 7)
  MAX_FILES_PER_BATCH: z.coerce.number().default(1000),
  DEFAULT_UPLOAD_CONCURRENCY: z.coerce.number().default(6),
  BATCH_CHUNK_PREPARATION_SIZE: z.coerce.number().default(25),

  // Biometric Privacy & Face Discovery (Phase 12)
  FACE_DISCOVERY_ENABLED: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .default(false),
  FACE_MODEL_NAME: z.string().default('MobileFaceNet-128D'),
  FACE_MODEL_VERSION: z.string().default('face-model-v1'),
  FACE_EMBEDDING_DIMENSION: z.coerce.number().default(128),
  FACE_SIMILARITY_THRESHOLD: z.coerce.number().default(0.72),
  FACE_HIGH_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.82),
  FACE_PROCESSING_CONCURRENCY: z.coerce.number().default(2),
  FACE_RETENTION_DAYS_DEFAULT: z.coerce.number().default(365),
  TEMP_FACE_RETENTION_MINUTES: z.coerce.number().default(60),

  // Secure Media Downloads & Bulk Export Infrastructure (Phase 13)
  EXPORT_WORKER_CONCURRENCY: z.coerce.number().default(2),
  MAX_ACTIVE_EXPORTS_PER_USER: z.coerce.number().default(2),
  MAX_ACTIVE_EXPORTS_PER_ORGANISATION: z.coerce.number().default(5),
  MAX_EXPORT_SIZE_BYTES: z.coerce.number().default(53687091200), // 50 GB
  MAX_EXPORT_FILE_COUNT: z.coerce.number().default(10000),
  EXPORT_URL_TTL_SECONDS: z.coerce.number().default(900), // 15 mins
  EXPORT_RETENTION_HOURS: z.coerce.number().default(24),
  ALLOW_BULK_DOWNLOAD_DEFAULT: z
    .preprocess((val) => val === 'true' || val === true || val === '1', z.boolean())
    .default(true),

  // Seed Configuration (Optional dev overrides)
  SEED_ADMIN_EMAIL: z.string().email().optional().default('admin@platform.test'),
  SEED_ADMIN_PASSWORD: z.string().optional().default('DemoAdminPassword123!'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.format();
    console.error('❌ Invalid or missing environment variables:');
    console.error(JSON.stringify(formattedErrors, null, 2));
    throw new Error('Environment configuration validation failed. Inspect error logs above.');
  }

  return result.data;
}

export const env = validateEnv();
