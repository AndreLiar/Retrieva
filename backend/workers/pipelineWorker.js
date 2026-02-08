/**
 * Phase 3: Pipeline Worker Entry Point
 *
 * This worker initializes all pipeline stage workers.
 * Can be run alongside or instead of the legacy documentIndexWorker.
 *
 * Usage:
 *   npm run workers:pipeline    # Run pipeline workers only
 *   npm run workers             # Run legacy worker (default)
 *
 * Environment:
 *   USE_PIPELINE=true          # Enable pipeline architecture
 *   PIPELINE_WORKERS_ENABLED=true  # Start pipeline workers
 */

import { connectDB } from '../config/database.js';
import logger from '../config/logger.js';
import {
  initializePipelineWorkers,
  stopPipelineWorkers,
} from '../services/pipeline/pipelineOrchestrator.js';
import { initializeMigrationWorker } from '../services/pipeline/embeddingMigration.js';

let shuttingDown = false;

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down pipeline workers...`, {
    service: 'pipeline-worker',
  });

  try {
    await stopPipelineWorkers();
    logger.info('Pipeline workers stopped successfully', {
      service: 'pipeline-worker',
    });
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      service: 'pipeline-worker',
      error: error.message,
    });
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    logger.info('Starting pipeline workers...', {
      service: 'pipeline-worker',
    });

    // Connect to database
    await connectDB();

    // Initialize all pipeline stage workers
    await initializePipelineWorkers();

    // Initialize migration worker
    await initializeMigrationWorker();

    logger.info('Pipeline workers started successfully', {
      service: 'pipeline-worker',
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start pipeline workers', {
      service: 'pipeline-worker',
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Run
main();

export default main;
