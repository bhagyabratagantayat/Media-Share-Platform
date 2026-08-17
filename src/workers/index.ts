import { startMediaWorker, closeMediaWorker } from './media-worker';
import { startExportWorker, closeExportWorker } from './export-worker';
import { closeRedisConnection } from '@/server/queue/redis';

console.log('====================================================');
console.log('🚀 Organisation Event Media - Processing & Export Worker');
console.log('====================================================');

const mediaWorker = startMediaWorker();
const exportWorker = startExportWorker();

async function handleShutdown(signal: string) {
  console.log(`\n[Worker] Received ${signal}. Gracefully shutting down...`);
  try {
    await Promise.all([closeMediaWorker(), closeExportWorker()]);
    await closeRedisConnection();
    console.log('[Worker] Shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
