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

  let lastWarnTime = 0;
  client.on('error', (err) => {
    // Only log if not in silent test mode and debounce to avoid log flood
    if (process.env.NODE_ENV !== 'test') {
      const now = Date.now();
      if (now - lastWarnTime > 30000) {
        lastWarnTime = now;
        console.warn(`[Redis] Offline (Optional for local UI dev): ${err.message}`);
      }
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
