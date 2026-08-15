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

  // Redis & Storage (Placeholders for future phases)
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional().default('us-east-1'),
  S3_BUCKET: z.string().optional().default('media-share-bucket'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional().default('http://localhost:3000/cdn'),

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
