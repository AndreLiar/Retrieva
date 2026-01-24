import 'dotenv/config';
import Redis from 'ioredis';
import logger from './logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6378';

/**
 * Create Redis connection for BullMQ
 * Uses IORedis which is required by BullMQ
 */
export const createRedisConnection = () => {
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
  });

  redis.on('connect', () => {
    logger.info('Redis connection established');
  });

  redis.on('ready', () => {
    logger.info('Redis client ready');
  });

  redis.on('error', (error) => {
    logger.error('Redis connection error:', error);
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redis.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return redis;
};

// Default Redis connection instance
export const redisConnection = createRedisConnection();

/**
 * Gracefully close Redis connection
 */
export const disconnectRedis = async () => {
  try {
    await redisConnection.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
    await redisConnection.disconnect();
  }
};
