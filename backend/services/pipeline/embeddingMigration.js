import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../../config/redis.js';
import { connectDB } from '../../config/database.js';
import logger from '../../config/logger.js';
import { DocumentSource } from '../../models/DocumentSource.js';
import { NotionWorkspace } from '../../models/NotionWorkspace.js';
import { getVectorStore } from '../../config/vectorStore.js';
import { prepareNotionDocumentForIndexing } from '../../loaders/notionDocumentLoader.js';
import {
  EMBEDDING_VERSION,
  needsEmbeddingMigration,
  createEmbeddingMetadata,
} from './pipelineStages.js';

/**
 * Phase 3: Embedding Version Migration
 *
 * Handles migration of embeddings when:
 * - Embedding model changes
 * - Vector dimensions change
 * - Provider changes (local <-> cloud)
 *
 * Migration is:
 * - Batch-based to avoid overwhelming the system
 * - Resumable (tracks progress)
 * - Non-blocking (runs in background)
 */

// =============================================================================
// MIGRATION QUEUE
// =============================================================================

const MIGRATION_QUEUE_NAME = 'embedding-migration';

let migrationQueue = null;
let migrationWorker = null;

function getMigrationQueue() {
  if (!migrationQueue) {
    migrationQueue = new Queue(MIGRATION_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      },
    });
  }
  return migrationQueue;
}

// =============================================================================
// MIGRATION STATUS TRACKING
// =============================================================================

const migrationStatus = {
  inProgress: false,
  workspaceId: null,
  totalDocuments: 0,
  processedDocuments: 0,
  failedDocuments: 0,
  startedAt: null,
  estimatedCompletionAt: null,
  lastError: null,
  fromVersion: null,
  toVersion: EMBEDDING_VERSION.current,
};

export function getMigrationStatus() {
  return { ...migrationStatus };
}

function updateMigrationStatus(updates) {
  Object.assign(migrationStatus, updates);

  // Estimate completion time
  if (migrationStatus.processedDocuments > 0 && migrationStatus.totalDocuments > 0) {
    const elapsed = Date.now() - new Date(migrationStatus.startedAt).getTime();
    const avgTimePerDoc = elapsed / migrationStatus.processedDocuments;
    const remaining = migrationStatus.totalDocuments - migrationStatus.processedDocuments;
    const estimatedMs = remaining * avgTimePerDoc;
    migrationStatus.estimatedCompletionAt = new Date(Date.now() + estimatedMs).toISOString();
  }
}

// =============================================================================
// MIGRATION FUNCTIONS
// =============================================================================

/**
 * Check which documents need migration in a workspace
 */
export async function getDocumentsNeedingMigration(workspaceId, limit = 1000) {
  const documents = await DocumentSource.find({
    workspaceId,
    status: 'synced',
  })
    .select('sourceId title embeddingMetadata chunkCount')
    .limit(limit)
    .lean();

  const needsMigration = documents.filter((doc) => needsEmbeddingMigration(doc.embeddingMetadata));

  return {
    total: documents.length,
    needsMigration: needsMigration.length,
    documents: needsMigration,
  };
}

/**
 * Start migration for a workspace
 */
export async function startMigration(workspaceId, options = {}) {
  const { batchSize = 10, priority = 'normal', dryRun = false } = options;

  if (migrationStatus.inProgress) {
    throw new Error('Migration already in progress');
  }

  // Get documents needing migration
  const { needsMigration, documents } = await getDocumentsNeedingMigration(workspaceId);

  if (needsMigration === 0) {
    return {
      status: 'no_migration_needed',
      message: 'All documents are using current embedding version',
    };
  }

  if (dryRun) {
    return {
      status: 'dry_run',
      documentsToMigrate: needsMigration,
      estimatedBatches: Math.ceil(needsMigration / batchSize),
      currentVersion: EMBEDDING_VERSION.current,
    };
  }

  // Update status
  updateMigrationStatus({
    inProgress: true,
    workspaceId,
    totalDocuments: needsMigration,
    processedDocuments: 0,
    failedDocuments: 0,
    startedAt: new Date().toISOString(),
    lastError: null,
    toVersion: EMBEDDING_VERSION.current,
  });

  // Queue migration jobs in batches
  const queue = getMigrationQueue();
  const batches = [];

  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    batches.push(batch);
  }

  for (let i = 0; i < batches.length; i++) {
    await queue.add(
      'migrate-batch',
      {
        workspaceId,
        batch: batches[i],
        batchIndex: i,
        totalBatches: batches.length,
      },
      {
        priority: priority === 'high' ? 1 : priority === 'low' ? 10 : 5,
      }
    );
  }

  logger.info('Embedding migration started', {
    service: 'migration',
    workspaceId,
    totalDocuments: needsMigration,
    batches: batches.length,
  });

  return {
    status: 'started',
    documentsToMigrate: needsMigration,
    batches: batches.length,
    migrationId: `migration-${workspaceId}-${Date.now()}`,
  };
}

/**
 * Process a migration batch
 */
async function processMigrationBatch(job) {
  const { workspaceId, batch, batchIndex, totalBatches } = job.data;

  logger.info(`Processing migration batch ${batchIndex + 1}/${totalBatches}`, {
    service: 'migration',
    workspaceId,
    documentsInBatch: batch.length,
  });

  const results = {
    processed: 0,
    failed: 0,
    errors: [],
  };

  for (const doc of batch) {
    try {
      await migrateDocument(workspaceId, doc.sourceId);
      results.processed++;
      updateMigrationStatus({
        processedDocuments: migrationStatus.processedDocuments + 1,
      });
    } catch (error) {
      results.failed++;
      results.errors.push({
        sourceId: doc.sourceId,
        error: error.message,
      });
      updateMigrationStatus({
        failedDocuments: migrationStatus.failedDocuments + 1,
        lastError: error.message,
      });

      logger.error('Document migration failed', {
        service: 'migration',
        workspaceId,
        sourceId: doc.sourceId,
        error: error.message,
      });
    }
  }

  // Check if migration complete
  const totalProcessed = migrationStatus.processedDocuments + migrationStatus.failedDocuments;
  if (totalProcessed >= migrationStatus.totalDocuments) {
    updateMigrationStatus({
      inProgress: false,
    });

    logger.info('Embedding migration completed', {
      service: 'migration',
      workspaceId,
      totalProcessed: migrationStatus.processedDocuments,
      totalFailed: migrationStatus.failedDocuments,
    });
  }

  return results;
}

/**
 * Migrate a single document to current embedding version
 */
async function migrateDocument(workspaceId, sourceId) {
  const startTime = Date.now();

  // Get document source
  const docSource = await DocumentSource.findOne({ workspaceId, sourceId });
  if (!docSource) {
    throw new Error(`Document source not found: ${sourceId}`);
  }

  // Get workspace for trust level
  const workspace = await NotionWorkspace.findOne({ workspaceId });
  const trustLevel = workspace?.trustLevel || 'internal';

  // Get original document content (stored in DocumentSource)
  const documentContent = {
    content: docSource.content || '',
    title: docSource.title,
    blocks: docSource.blocks || [],
    metadata: docSource.metadata || {},
  };

  // Delete old vectors (if tracked)
  if (docSource.vectorStoreIds && docSource.vectorStoreIds.length > 0) {
    try {
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
      const collectionName = process.env.QDRANT_COLLECTION_NAME || 'langchain-rag';
      const client = new QdrantClient({ url: qdrantUrl });

      await client.delete(collectionName, {
        filter: {
          must: [
            { key: 'metadata.workspaceId', match: { value: workspaceId } },
            { key: 'metadata.sourceId', match: { value: sourceId } },
          ],
        },
      });
    } catch (deleteError) {
      logger.warn('Failed to delete old vectors', {
        service: 'migration',
        sourceId,
        error: deleteError.message,
      });
    }
  }

  // Re-chunk document
  const chunks = await prepareNotionDocumentForIndexing(
    documentContent,
    workspaceId,
    documentContent.blocks
  );

  if (chunks.length === 0) {
    logger.warn('No chunks to migrate', {
      service: 'migration',
      sourceId,
    });
    return { migrated: false, reason: 'no_chunks' };
  }

  // Re-embed and index
  await getVectorStore(chunks);

  // Generate new point IDs
  const pointIds = chunks.map((_, index) => `${sourceId}_chunk_${index}`);

  // Determine provider based on trust level
  const provider = trustLevel === 'regulated' ? 'local' : 'cloud';

  // Update document source with new metadata
  docSource.vectorStoreIds = pointIds;
  docSource.chunkCount = chunks.length;
  docSource.embeddingMetadata = createEmbeddingMetadata(provider, chunks.length, {
    trustLevel,
    migratedAt: new Date().toISOString(),
    migratedFrom: docSource.embeddingMetadata?.version || 'unknown',
  });
  docSource.lastSyncedAt = new Date();
  await docSource.save();

  logger.info('Document migrated successfully', {
    service: 'migration',
    workspaceId,
    sourceId,
    chunkCount: chunks.length,
    newVersion: EMBEDDING_VERSION.current,
    durationMs: Date.now() - startTime,
  });

  return {
    migrated: true,
    chunkCount: chunks.length,
    newVersion: EMBEDDING_VERSION.current,
  };
}

/**
 * Cancel ongoing migration
 */
export async function cancelMigration() {
  if (!migrationStatus.inProgress) {
    return { status: 'no_migration_running' };
  }

  const queue = getMigrationQueue();
  await queue.drain();

  updateMigrationStatus({
    inProgress: false,
    lastError: 'Migration cancelled by user',
  });

  logger.info('Migration cancelled', {
    service: 'migration',
    processedDocuments: migrationStatus.processedDocuments,
  });

  return {
    status: 'cancelled',
    processedDocuments: migrationStatus.processedDocuments,
    remainingDocuments: migrationStatus.totalDocuments - migrationStatus.processedDocuments,
  };
}

// =============================================================================
// MIGRATION WORKER
// =============================================================================

/**
 * Initialize migration worker
 */
export async function initializeMigrationWorker() {
  await connectDB();

  if (!migrationWorker) {
    migrationWorker = new Worker(MIGRATION_QUEUE_NAME, processMigrationBatch, {
      connection: redisConnection,
      concurrency: 2, // Low concurrency to avoid overwhelming embeddings
      lockDuration: 600000, // 10 min
    });

    migrationWorker.on('completed', (job, result) => {
      logger.debug('Migration batch completed', {
        service: 'migration',
        jobId: job.id,
        processed: result?.processed,
        failed: result?.failed,
      });
    });

    migrationWorker.on('failed', (job, err) => {
      logger.error('Migration batch failed', {
        service: 'migration',
        jobId: job?.id,
        error: err.message,
      });
    });

    migrationWorker.on('error', (err) => {
      logger.error('Migration worker error', {
        service: 'migration',
        error: err.message,
      });
    });

    logger.info('Migration worker initialized', { service: 'migration' });
  }

  return migrationWorker;
}

/**
 * Stop migration worker
 */
export async function stopMigrationWorker() {
  if (migrationWorker) {
    await migrationWorker.close();
    migrationWorker = null;
    logger.info('Migration worker stopped', { service: 'migration' });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getMigrationStatus,
  getDocumentsNeedingMigration,
  startMigration,
  cancelMigration,
  initializeMigrationWorker,
  stopMigrationWorker,
  EMBEDDING_VERSION,
};
