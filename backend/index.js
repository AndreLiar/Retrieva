import dotenv from 'dotenv';
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
import { startMemoryDecayWorker } from './workers/memoryDecayWorker.js';
import { scheduleMemoryDecayJob } from './config/queue.js';

dotenv.config();

const port = process.env.PORT || 3000;

// Create HTTP server for both Express and Socket.io
const httpServer = http.createServer(app);

// Connect to MongoDB then start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start memory decay worker
    startMemoryDecayWorker({ concurrency: 1 });

    // Schedule memory decay job (runs every 24 hours by default)
    await scheduleMemoryDecayJob();

    // Log workers initialization
    logger.info('='.repeat(60));
    logger.info('🚀 BullMQ Workers Started', { service: 'rag-backend' });
    logger.info('  - Notion Sync Worker: Active', { service: 'rag-backend' });
    logger.info('  - Document Index Worker: Active (concurrency: 20)', { service: 'rag-backend' });
    logger.info('  - Memory Decay Worker: Active (scheduled daily)', { service: 'rag-backend' });
    logger.info('  - Batch size: 10 documents per batch', { service: 'rag-backend' });
    logger.info(`  - API rate limit: ${process.env.NOTION_API_RATE_LIMIT || 2} req/sec`, {
      service: 'rag-backend',
    });
    logger.info('='.repeat(60));

    // Initialize existing Notion workspace connections
    await startupInitService.initialize();

    // Initialize Notion workspace sync schedules
    await syncScheduler.initializeAllSchedules();
    logger.info('Notion workspace sync schedules initialized');

    // Pre-warm RAG system at startup (eliminates first-request delay)
    logger.info('🔥 Pre-warming RAG system...', { service: 'rag-backend' });
    const ragStartTime = Date.now();
    await ragService.init();
    const ragInitTime = ((Date.now() - ragStartTime) / 1000).toFixed(2);
    logger.info(`✅ RAG system ready (initialized in ${ragInitTime}s)`, { service: 'rag-backend' });

    // Pre-warm answer formatter
    logger.info('🔥 Pre-warming answer formatter...', { service: 'rag-backend' });
    const formatterStartTime = Date.now();
    await answerFormatter.init();
    const formatterInitTime = ((Date.now() - formatterStartTime) / 1000).toFixed(2);
    logger.info(`✅ Answer formatter ready (initialized in ${formatterInitTime}s)`, {
      service: 'rag-backend',
    });

    // Initialize Socket.io server for real-time features
    logger.info('🔌 Initializing WebSocket server...', { service: 'rag-backend' });
    initializeSocketServer(httpServer);
    logger.info('✅ WebSocket server ready', { service: 'rag-backend' });

    // Start HTTP server (Express + Socket.io)
    httpServer.listen(port, () => {
      logger.info(`App listening at http://localhost:${port}`, { service: 'rag-backend' });
      logger.info(`WebSocket available at ws://localhost:${port}`, { service: 'rag-backend' });
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, {
        service: 'rag-backend',
      });
      logger.info('✅ Backend service ready - API + Workers + RAG + WebSocket running', {
        service: 'rag-backend',
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', { service: 'rag-backend', error: error.message });
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server', { service: 'rag-backend' });
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server', { service: 'rag-backend' });
  process.exit(0);
});

startServer();
