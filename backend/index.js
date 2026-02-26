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
import { startupInitService } from './services/startupInit.js';
import { ragService } from './services/rag.js';
import { answerFormatter } from './services/answerFormatter.js';
// Import workers to start them with the server
import './workers/documentIndexWorker.js';
import './workers/assessmentWorker.js';

const port = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const startServer = async () => {
  try {
    const envInfo = getEnvInfo();
    logger.info('Environment configuration:', { service: 'rag-backend', ...envInfo });

    await connectDB();

    const indexConcurrency = parseInt(process.env.INDEX_WORKER_CONCURRENCY) || 3;
    logger.info('='.repeat(60));
    logger.info('BullMQ Workers Started', { service: 'rag-backend' });
    logger.info(`  - Document Index Worker: Active (concurrency: ${indexConcurrency})`, {
      service: 'rag-backend',
    });
    logger.info('  - Assessment Worker: Active', { service: 'rag-backend' });
    logger.info('='.repeat(60));

    httpServer.listen(port, () => {
      logger.info(`App listening at http://localhost:${port}`, { service: 'rag-backend' });
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, {
        service: 'rag-backend',
      });
      logger.info('Backend service accepting requests', { service: 'rag-backend' });
    });

    // Non-blocking startup init
    startupInitService.initialize().catch((err) => {
      logger.error('Startup init failed (non-critical):', {
        service: 'rag-backend',
        error: err.message,
      });
    });

    // Pre-warm RAG system in background
    ragService
      .init()
      .then(() => logger.info('RAG system ready', { service: 'rag-backend' }))
      .catch((err) => {
        logger.error('RAG pre-warm failed (will lazy-init on first request):', {
          service: 'rag-backend',
          error: err.message,
        });
      });

    // Pre-warm answer formatter in background
    answerFormatter
      .init()
      .then(() => logger.info('Answer formatter ready', { service: 'rag-backend' }))
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

const gracefulShutdown = async (signal) => {
  logger.info(`${signal} signal received: closing HTTP server`, { service: 'rag-backend' });
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();
