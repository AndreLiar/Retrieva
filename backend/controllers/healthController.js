import mongoose from 'mongoose';
import { redisConnection } from '../config/redis.js';
import { getVectorStore } from '../config/vectorStore.js';
import { llm } from '../config/llm.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';
import logger from '../config/logger.js';

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

  // Check Qdrant
  try {
    const vectorStore = await getVectorStore([]);
    const collectionInfo = await vectorStore.client.getCollection(
      process.env.QDRANT_COLLECTION_NAME || 'documents'
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
    };
    allHealthy = false;
  }

  // Check Ollama LLM
  try {
    const testResponse = await llm.invoke('test');
    health.services.ollama = {
      status: 'up',
      model: process.env.OLLAMA_MODEL || 'llama3.2:latest',
      responsive: !!testResponse,
    };
  } catch (error) {
    health.services.ollama = {
      status: 'down',
      error: error.message,
    };
    allHealthy = false;
  }

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
