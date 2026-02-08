import mongoose from 'mongoose';
import { redisConnection } from '../config/redis.js';
import { getVectorStore } from '../config/vectorStore.js';
import { getDefaultLLM, getCurrentProvider } from '../config/llm.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';
import { promiseWithTimeout } from '../utils/core/asyncHelpers.js';
import logger from '../config/logger.js';
// ISSUE #29 FIX: Import queues for health check
import { notionSyncQueue, documentIndexQueue } from '../config/queue.js';

// ISSUE #14 FIX: Health check timeouts to prevent hanging
const HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 seconds for each service check

/**
 * Basic health check
 * GET /api/v1/health
 */
export const basicHealth = async (req, res) => {
  sendSuccess(res, 200, 'Service is healthy', {
    status: 'up',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

/**
 * Detailed health check with all dependencies
 * GET /api/v1/health/detailed
 */
export const detailedHealth = async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  let allHealthy = true;

  // Check MongoDB
  try {
    const mongoState = mongoose.connection.readyState;
    health.services.mongodb = {
      status: mongoState === 1 ? 'up' : 'down',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoState],
      database: mongoose.connection.name,
    };
    if (mongoState !== 1) allHealthy = false;
  } catch (error) {
    health.services.mongodb = {
      status: 'down',
      error: error.message,
    };
    allHealthy = false;
  }

  // Check Redis
  try {
    const redisPing = await redisConnection.ping();
    health.services.redis = {
      status: redisPing === 'PONG' ? 'up' : 'down',
      response: redisPing,
    };
    if (redisPing !== 'PONG') allHealthy = false;
  } catch (error) {
    health.services.redis = {
      status: 'down',
      error: error.message,
    };
    allHealthy = false;
  }

  // Check Qdrant (with timeout - ISSUE #14 FIX)
  try {
    const qdrantCheck = async () => {
      const vectorStore = await getVectorStore([]);
      const collectionInfo = await vectorStore.client.getCollection(
        process.env.QDRANT_COLLECTION_NAME || 'documents'
      );
      return collectionInfo;
    };

    const collectionInfo = await promiseWithTimeout(
      qdrantCheck(),
      HEALTH_CHECK_TIMEOUT_MS,
      'Qdrant health check timed out'
    );

    health.services.qdrant = {
      status: 'up',
      collection: collectionInfo.name,
      vectorsCount: collectionInfo.vectors_count || collectionInfo.points_count,
    };
  } catch (error) {
    health.services.qdrant = {
      status: 'down',
      error: error.message,
      timeout: error.message?.includes('timed out'),
    };
    allHealthy = false;
  }

  // Check LLM Provider (with timeout - ISSUE #14 FIX)
  try {
    const llmCheck = async () => {
      const llm = await getDefaultLLM();
      const testResponse = await llm.invoke('test');
      return testResponse;
    };

    const testResponse = await promiseWithTimeout(
      llmCheck(),
      HEALTH_CHECK_TIMEOUT_MS,
      'LLM health check timed out'
    );

    health.services.llm = {
      status: 'up',
      provider: getCurrentProvider(),
      model: process.env.LLM_MODEL || process.env.AZURE_OPENAI_LLM_DEPLOYMENT || 'default',
      responsive: !!testResponse,
    };
  } catch (error) {
    health.services.llm = {
      status: 'down',
      provider: getCurrentProvider(),
      error: error.message,
      timeout: error.message?.includes('timed out'),
    };
    allHealthy = false;
  }

  // ISSUE #29 FIX: Check BullMQ Queues
  try {
    const [syncQueueCounts, indexQueueCounts] = await Promise.all([
      notionSyncQueue.getJobCounts(),
      documentIndexQueue.getJobCounts(),
    ]);

    health.services.queues = {
      status: 'up',
      notionSync: {
        waiting: syncQueueCounts.waiting || 0,
        active: syncQueueCounts.active || 0,
        completed: syncQueueCounts.completed || 0,
        failed: syncQueueCounts.failed || 0,
      },
      documentIndex: {
        waiting: indexQueueCounts.waiting || 0,
        active: indexQueueCounts.active || 0,
        completed: indexQueueCounts.completed || 0,
        failed: indexQueueCounts.failed || 0,
      },
    };
  } catch (error) {
    health.services.queues = {
      status: 'down',
      error: error.message,
    };
    // Queues are non-critical - don't mark as unhealthy
    logger.warn('Queue health check failed', { error: error.message });
  }

  // ISSUE #29 FIX: Check SMTP Configuration
  const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
  health.services.smtp = {
    status: smtpConfigured ? 'configured' : 'not_configured',
    host: process.env.SMTP_HOST ? 'set' : 'not_set',
    // Don't expose actual host for security
  };

  // System metrics
  health.system = {
    nodeVersion: process.version,
    platform: process.platform,
    memory: {
      heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    },
    cpu: process.cpuUsage(),
  };

  health.status = allHealthy ? 'healthy' : 'degraded';

  const statusCode = allHealthy ? 200 : 503;

  logger.info('Health check performed', {
    status: health.status,
    servicesUp: Object.values(health.services).filter((s) => s.status === 'up').length,
    servicesTotal: Object.keys(health.services).length,
  });

  res.status(statusCode).json({
    status: 'success',
    data: health,
  });
};

/**
 * Readiness check (for Kubernetes)
 * GET /api/v1/health/ready
 */
export const readinessCheck = async (req, res) => {
  try {
    // Check critical services
    const mongoReady = mongoose.connection.readyState === 1;
    const redisPing = await redisConnection.ping();
    const redisReady = redisPing === 'PONG';

    if (mongoReady && redisReady) {
      return sendSuccess(res, 200, 'Service is ready', {
        ready: true,
        mongodb: mongoReady,
        redis: redisReady,
      });
    }

    return res.status(503).json({
      status: 'error',
      message: 'Service not ready',
      data: {
        ready: false,
        mongodb: mongoReady,
        redis: redisReady,
      },
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    return res.status(503).json({
      status: 'error',
      message: 'Readiness check failed',
      data: { ready: false },
    });
  }
};

/**
 * Liveness check (for Kubernetes)
 * GET /api/v1/health/live
 */
export const livenessCheck = async (req, res) => {
  // Simple check - if we can respond, we're alive
  sendSuccess(res, 200, 'Service is alive', {
    alive: true,
    uptime: process.uptime(),
  });
};
