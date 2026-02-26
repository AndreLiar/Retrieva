import './assessmentWorker.js';
import './documentIndexWorker.js';
import logger from '../config/logger.js';
import { disconnectRedis } from '../config/redis.js';
import { closeQueues } from '../config/queue.js';
import { disconnectDB } from '../config/database.js';

const indexConcurrency = parseInt(process.env.INDEX_WORKER_CONCURRENCY) || 3;

logger.info('='.repeat(60));
logger.info('BullMQ Workers Started');
logger.info('='.repeat(60));
logger.info('Active workers:');
logger.info('  - Assessment Worker (concurrency: 2)');
logger.info(`  - Document Index Worker (concurrency: ${indexConcurrency})`);
logger.info('='.repeat(60));

/**
 * Graceful shutdown handler
 * Ensures all workers finish their current jobs before exiting
 */
async function gracefulShutdown(signal) {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Close queues (stops accepting new jobs, waits for current jobs)
    logger.info('Closing queues...');
    await closeQueues();

    // Disconnect from Redis
    logger.info('Disconnecting from Redis...');
    await disconnectRedis();

    // Disconnect from MongoDB
    logger.info('Disconnecting from MongoDB...');
    await disconnectDB();

    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
