import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

// Validate environment variables before anything else
import { validateEnvOrExit, getEnvInfo } from './config/envValidator.js';
validateEnvOrExit();

import http from 'http';
import app from './app.js';
import logger from './config/logger.js';
import { connectDB } from './config/database.js';
import { syncScheduler } from './services/syncScheduler.js';
import { startupInitService } from './services/startupInit.js';
import { ragService } from './services/rag.js';
import { answerFormatter } from './services/answerFormatter.js';
import { initializeSocketServer, getStats as getSocketStats } from './services/socketService.js';
// Import workers to start them with the server
import './workers/notionSyncWorker.js';
import './workers/documentIndexWorker.js';
import './workers/assessmentWorker.js';
import { startMemoryDecayWorker } from './workers/memoryDecayWorker.js';
import { scheduleMemoryDecayJob } from './config/queue.js';
// Pipeline workers (Phase 3)
import {
  initializePipelineWorkers,
  stopPipelineWorkers,
  isPipelineEnabled,
} from './services/pipeline/index.js';
// Notion token health monitor
import { notionTokenMonitor } from './services/notionTokenMonitor.js';

const port = process.env.PORT || 3000;

// Create HTTP server for both Express and Socket.io
const httpServer = http.createServer(app);

// Connect to MongoDB then start server
const startServer = async () => {
  try {
    // Log environment configuration
    const envInfo = getEnvInfo();
    logger.info('Environment configuration:', { service: 'rag-backend', ...envInfo });

    // Connect to MongoDB
    await connectDB();

    // Start memory decay worker
    startMemoryDecayWorker({ concurrency: 1 });

    // Schedule memory decay job in background (non-blocking)
    scheduleMemoryDecayJob().catch((err) => {
      logger.error('Memory decay job scheduling failed (non-critical):', {
        service: 'rag-backend',
        error: err.message,
      });
    });

    // Start pipeline workers if enabled (Phase 3)
    const pipelineEnabled = isPipelineEnabled();
    if (pipelineEnabled) {
      await initializePipelineWorkers();
      logger.info('Pipeline workers initialized', { service: 'rag-backend' });
    }

    // Log workers initialization
    const indexConcurrency = parseInt(process.env.INDEX_WORKER_CONCURRENCY) || 3;
    const batchSize = parseInt(process.env.BATCH_SIZE) || 30;
    logger.info('='.repeat(60));
    logger.info('BullMQ Workers Started', { service: 'rag-backend' });
    logger.info('  - Notion Sync Worker: Active', { service: 'rag-backend' });
    logger.info(`  - Document Index Worker: Active (concurrency: ${indexConcurrency})`, {
      service: 'rag-backend',
    });
    logger.info('  - Memory Decay Worker: Active (scheduled daily)', { service: 'rag-backend' });
    if (pipelineEnabled) {
      logger.info('  - Pipeline Workers: Active (FETCH, CHUNK, PII_SCAN, EMBED, INDEX, ENRICH)', {
        service: 'rag-backend',
      });
    }
    logger.info(`  - Batch size: ${batchSize} documents per batch`, { service: 'rag-backend' });
    logger.info(`  - API rate limit: ${process.env.NOTION_API_RATE_LIMIT || 2} req/sec`, {
      service: 'rag-backend',
    });
    logger.info('='.repeat(60));

    // Initialize Socket.io server for real-time features
    logger.info('Initializing WebSocket server...', { service: 'rag-backend' });
    initializeSocketServer(httpServer);
    logger.info('WebSocket server ready', { service: 'rag-backend' });

    // Start HTTP server FIRST so the frontend can connect immediately
    // Pre-warming happens in the background - endpoints that need RAG
    // already have lazy-init guards (e.g. if (!ragService.retriever) await ragService.init())
    httpServer.listen(port, () => {
      logger.info(`App listening at http://localhost:${port}`, { service: 'rag-backend' });
      logger.info(`WebSocket available at ws://localhost:${port}`, { service: 'rag-backend' });
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, {
        service: 'rag-backend',
      });
      logger.info('Backend service accepting requests', { service: 'rag-backend' });
    });

    // Background initialization: these don't block the server from accepting requests
    // Auth, conversations, and other endpoints work immediately
    // RAG endpoints will lazy-init on first request if pre-warming hasn't finished

    // Initialize existing Notion workspace connections
    startupInitService.initialize().catch((err) => {
      logger.error('Startup init failed (non-critical):', {
        service: 'rag-backend',
        error: err.message,
      });
    });

    // Initialize Notion workspace sync schedules
    syncScheduler
      .initializeAllSchedules()
      .then(() => {
        logger.info('Notion workspace sync schedules initialized');
      })
      .catch((err) => {
        logger.error('Sync scheduler init failed (non-critical):', {
          service: 'rag-backend',
          error: err.message,
        });
      });

    // Start Notion token health monitor (checks token validity periodically)
    if (process.env.NOTION_TOKEN_MONITOR_ENABLED !== 'false') {
      notionTokenMonitor.start();
      logger.info('Notion token health monitor started', { service: 'rag-backend' });
    }

    // Pre-warm RAG system in background
    logger.info('Pre-warming RAG system (background)...', { service: 'rag-backend' });
    ragService
      .init()
      .then(() => {
        logger.info('RAG system ready', { service: 'rag-backend' });

        // Post-Phase 1: warn operator if existing chunks are stale
        if (process.env.PENDING_REINDEX === 'true') {
          logger.warn('='.repeat(60), { service: 'rag-backend' });
          logger.warn('PENDING RE-INDEX: Chunking parameters have changed (Phase 1).', {
            service: 'rag-backend',
          });
          logger.warn('Existing vectors in Qdrant use the old chunking strategy.', {
            service: 'rag-backend',
          });
          logger.warn('Trigger a full Notion re-sync to apply new chunk sizes,', {
            service: 'rag-backend',
          });
          logger.warn('quality gates, and embedding prefixes to all documents.', {
            service: 'rag-backend',
          });
          logger.warn('Set PENDING_REINDEX=false after re-indexing is complete.', {
            service: 'rag-backend',
          });
          logger.warn('='.repeat(60), { service: 'rag-backend' });
        }
      })
      .catch((err) => {
        logger.error('RAG pre-warm failed (will lazy-init on first request):', {
          service: 'rag-backend',
          error: err.message,
        });
      });

    // Pre-warm answer formatter in background
    logger.info('Pre-warming answer formatter (background)...', { service: 'rag-backend' });
    answerFormatter
      .init()
      .then(() => {
        logger.info('Answer formatter ready', { service: 'rag-backend' });
      })
      .catch((err) => {
        logger.error('Answer formatter pre-warm failed (non-critical):', {
          service: 'rag-backend',
          error: err.message,
        });
      });
  } catch (error) {
    logger.error('Failed to start server:', { service: 'rag-backend', error: error.message });
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} signal received: closing HTTP server`, { service: 'rag-backend' });

  // Stop pipeline workers if they were started
  if (isPipelineEnabled()) {
    logger.info('Stopping pipeline workers...', { service: 'rag-backend' });
    await stopPipelineWorkers();
    logger.info('Pipeline workers stopped', { service: 'rag-backend' });
  }

  // Stop token monitor
  notionTokenMonitor.stop();

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
