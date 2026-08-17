import Redis, { RedisOptions } from 'ioredis';
import { env } from '@/config/env';

let sharedRedisClient: Redis | null = null;

export function getRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 3000);
      return delay;
    },
  };
}

export function createRedisConnection(): Redis {
  const client = new Redis(env.REDIS_URL, getRedisOptions());

  client.on('error', (err) => {
    // Only log if not in silent test mode
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`[Redis] Connection warning: ${err.message}`);
    }
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!sharedRedisClient) {
    sharedRedisClient = createRedisConnection();
  }
  return sharedRedisClient;
}

export async function closeRedisConnection(): Promise<void> {
  if (sharedRedisClient) {
    await sharedRedisClient.quit();
    sharedRedisClient = null;
  }
}
