/**
 * MCP Sync Worker
 *
 * Mirrors the pattern of notionSyncWorker.js but operates on any data source
 * connected via the Model Context Protocol (MCP).
 *
 * Job shape:
 *   {
 *     mcpDataSourceId: string,   // MCPDataSource._id
 *     workspaceId:     string,
 *     syncType:        'full' | 'incremental',
 *     triggeredBy:     'auto' | 'manual',
 *   }
 *
 * Pipeline:
 *   1. Load MCPDataSource record (connection config + decrypted token)
 *   2. Connect MCPDataSourceAdapter to the remote MCP server
 *   3. Determine which documents to sync (full vs incremental)
 *   4. For each document: fetch content, check hash, enqueue to documentIndexQueue
 *   5. Detect and soft-delete removed documents
 *   6. Update MCPDataSource with stats
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { documentIndexQueue } from '../config/queue.js';
import { MCPDataSource } from '../models/MCPDataSource.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { MCPDataSourceAdapter } from '../adapters/MCPDataSourceAdapter.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';
import { setupDLQListener } from '../services/deadLetterQueue.js';
import {
  emitSyncStart,
  emitSyncProgress,
  emitSyncPageFetched,
  emitSyncComplete,
  emitSyncError,
} from '../services/realtimeEvents.js';

const BATCH_SIZE = parseInt(process.env.MCP_SYNC_BATCH_SIZE) || 20;
const MCP_WORKER_CONCURRENCY = parseInt(process.env.MCP_WORKER_CONCURRENCY) || 2;

// ---------------------------------------------------------------------------
// Main job processor
// ---------------------------------------------------------------------------

async function processMCPSyncJob(job) {
  const { mcpDataSourceId, workspaceId, syncType = 'full', triggeredBy = 'auto' } = job.data;

  const startTime = Date.now();

  logger.info('MCP sync job started', {
    service: 'mcp-sync',
    jobId: job.id,
    mcpDataSourceId,
    workspaceId,
    syncType,
    triggeredBy,
  });

  // ── 1. Load connection config ──────────────────────────────────────────────
  const mcpSource = await MCPDataSource.findById(mcpDataSourceId);
  if (!mcpSource) {
    throw new Error(`MCPDataSource not found: ${mcpDataSourceId}`);
  }
  if (mcpSource.workspaceId !== workspaceId) {
    throw new Error('MCPDataSource workspace mismatch');
  }
  if (mcpSource.syncStatus === 'syncing') {
    logger.warn('MCP sync already in progress, skipping', {
      service: 'mcp-sync',
      mcpDataSourceId,
    });
    return { aborted: true, reason: 'already_syncing' };
  }

  await mcpSource.markSyncing(job.id);
  emitSyncStart(workspaceId, triggeredBy, {
    jobId: job.id,
    syncType,
    sourceName: mcpSource.name,
  });

  // ── 2. Connect adapter ─────────────────────────────────────────────────────
  // Decrypt the authToken — fieldEncryption plugin stores the decrypted value
  // on the plain model instance via the virtual getter pattern.
  const plainToken = mcpSource.get('authToken');
  const adapter = new MCPDataSourceAdapter(mcpSource.serverUrl, plainToken, mcpSource.sourceType);

  try {
    await adapter.authenticate();
  } catch (connErr) {
    await mcpSource.addError(connErr);
    emitSyncError(workspaceId, { error: connErr.message, sourceName: mcpSource.name });
    throw connErr;
  }

  const stats = {
    total: 0,
    indexed: 0,
    skipped: 0,
    errored: 0,
    deleted: 0,
  };

  try {
    // ── 3. Determine documents to sync ───────────────────────────────────────
    let docsToSync;

    if (syncType === 'incremental' && mcpSource.lastSyncedAt) {
      const changes = await adapter.detectChanges(mcpSource.lastSyncedAt);
      const toDelete = changes.filter((c) => c.changeType === 'deleted').map((c) => c.id);
      const toSync = changes.filter((c) => c.changeType !== 'deleted').map((c) => ({ id: c.id }));

      docsToSync = toSync;

      // Soft-delete removed documents
      if (toDelete.length > 0) {
        await _handleDeletedDocuments(workspaceId, mcpSource.sourceType, toDelete);
        stats.deleted = toDelete.length;
      }
    } else {
      // Full sync: list everything
      const allDocs = await adapter.listDocuments();
      docsToSync = allDocs;

      // Detect documents that exist in DB but are gone from the source
      const sourceIds = allDocs.map((d) => d.id);
      await _detectAndSoftDeleteRemovedDocs(workspaceId, mcpSource.sourceType, sourceIds);
    }

    stats.total = docsToSync.length;
    await setJobProgress(job, { phase: 'fetching', total: stats.total, synced: 0 });
    emitSyncProgress(workspaceId, {
      jobId: job.id,
      totalDocuments: stats.total,
      syncedDocuments: 0,
      sourceName: mcpSource.name,
    });

    // ── 4. Process in batches ─────────────────────────────────────────────────
    for (let i = 0; i < docsToSync.length; i += BATCH_SIZE) {
      const batch = docsToSync.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (docMeta) => {
          try {
            await _processDocument(adapter, workspaceId, mcpSource, docMeta, stats);
          } catch (docErr) {
            stats.errored++;
            logger.error('MCP document processing failed', {
              service: 'mcp-sync',
              docId: docMeta.id,
              workspaceId,
              error: docErr.message,
            });
          }
        })
      );

      await setJobProgress(job, {
        phase: 'fetching',
        total: stats.total,
        synced: stats.indexed + stats.skipped,
      });
      emitSyncProgress(workspaceId, {
        jobId: job.id,
        totalDocuments: stats.total,
        syncedDocuments: stats.indexed + stats.skipped,
        sourceName: mcpSource.name,
      });
    }

    // ── 5. Finalise ──────────────────────────────────────────────────────────
    const durationMs = Date.now() - startTime;
    await mcpSource.markSynced({
      totalDocuments: stats.total,
      documentsIndexed: stats.indexed,
      documentsSkipped: stats.skipped,
      documentsErrored: stats.errored,
      durationMs,
    });

    emitSyncComplete(workspaceId, {
      jobId: job.id,
      syncType,
      sourceName: mcpSource.name,
      stats,
      durationMs,
    });

    logger.info('MCP sync job completed', {
      service: 'mcp-sync',
      jobId: job.id,
      mcpDataSourceId,
      workspaceId,
      ...stats,
      durationMs,
    });

    return { success: true, stats, durationMs };
  } catch (error) {
    await mcpSource.addError(error).catch(() => {});
    emitSyncError(workspaceId, { error: error.message, sourceName: mcpSource.name });
    throw error;
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a single document from the MCP server, check its content hash,
 * and enqueue to documentIndexQueue only if it has changed.
 */
async function _processDocument(adapter, workspaceId, mcpSource, docMeta, stats) {
  const docId = docMeta.id;

  // Fetch full document content from MCP server
  const documentContent = await adapter.getDocumentContent(docId);

  if (!documentContent.content || documentContent.content.trim().length < 50) {
    logger.debug('MCP document skipped: content too short', {
      service: 'mcp-sync',
      docId,
    });
    stats.skipped++;
    return;
  }

  // Check if content changed since last sync
  const existing = await DocumentSource.findOne({
    workspaceId,
    sourceId: docId,
    sourceType: mcpSource.sourceType,
  });

  if (existing?.contentHash === documentContent.contentHash && existing.syncStatus === 'synced') {
    stats.skipped++;
    emitSyncPageFetched(workspaceId, {
      pageId: docId,
      title: documentContent.title,
      status: 'skipped',
    });
    return;
  }

  const operation = existing ? 'update' : 'add';

  // Upsert DocumentSource registry record
  await DocumentSource.findOneAndUpdate(
    { workspaceId, sourceId: docId },
    {
      workspaceId,
      sourceId: docId,
      sourceType: mcpSource.sourceType,
      documentType: 'page',
      title: documentContent.title,
      url: documentContent.url,
      parentId: documentContent.parentId,
      contentHash: documentContent.contentHash,
      lastModifiedInSource: documentContent.lastModified
        ? new Date(documentContent.lastModified)
        : new Date(),
      syncStatus: 'pending',
      metadata: {
        author: documentContent.author,
        createdAt: documentContent.createdAt ? new Date(documentContent.createdAt) : new Date(),
        properties: documentContent.properties,
      },
    },
    { upsert: true, new: true }
  );

  // Enqueue for embedding + vector indexing
  await documentIndexQueue.add(
    'indexDocument',
    {
      workspaceId,
      sourceId: docId,
      sourceType: mcpSource.sourceType,
      documentContent,
      operation,
      skipM3: true, // Run M3 enrichment separately after bulk sync
    },
    { priority: 10 }
  );

  stats.indexed++;
  emitSyncPageFetched(workspaceId, {
    pageId: docId,
    title: documentContent.title,
    status: 'queued',
  });
}

/** Soft-delete documents that are explicitly flagged as deleted by the MCP server */
async function _handleDeletedDocuments(workspaceId, sourceType, deletedIds) {
  for (const sourceId of deletedIds) {
    const doc = await DocumentSource.findOne({ workspaceId, sourceId, sourceType });
    if (doc) {
      await documentIndexQueue.add('indexDocument', {
        workspaceId,
        sourceId,
        sourceType,
        operation: 'delete',
        vectorStoreIds: doc.vectorStoreIds ?? [],
      });
    }
  }
}

/** Compare current source document list against DB to find orphans */
async function _detectAndSoftDeleteRemovedDocs(workspaceId, sourceType, liveIds) {
  const liveSet = new Set(liveIds);
  const dbDocs = await DocumentSource.find({
    workspaceId,
    sourceType,
    syncStatus: { $ne: 'deleted' },
  }).select('sourceId vectorStoreIds');

  const removedIds = dbDocs.filter((d) => !liveSet.has(d.sourceId)).map((d) => d.sourceId);

  if (removedIds.length > 0) {
    await _handleDeletedDocuments(workspaceId, sourceType, removedIds);
    logger.info('MCP sync: queued deletion of removed documents', {
      service: 'mcp-sync',
      workspaceId,
      count: removedIds.length,
    });
  }
}

async function setJobProgress(job, data) {
  try {
    await job.updateProgress(data);
  } catch (_err) {
    // non-critical
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export const mcpSyncWorker = new Worker('mcpSync', processMCPSyncJob, {
  connection: redisConnection,
  concurrency: MCP_WORKER_CONCURRENCY,
  lockDuration: 600000, // 10 minutes
  lockRenewTime: 240000, // Renew every 4 minutes
  maxStalledCount: 3,
  stalledInterval: 300000,
});

mcpSyncWorker.on('completed', (job, result) => {
  logger.info(`MCP sync job ${job.id} completed`, { result });
});

mcpSyncWorker.on('failed', (job, err) => {
  logger.error(`MCP sync job ${job.id} failed:`, err);
});

mcpSyncWorker.on('error', (err) => {
  logger.error('MCP sync worker error:', err);
});

setupDLQListener(mcpSyncWorker, 'mcpSync');

(async () => {
  await connectDB();
  logger.info('MCP sync worker started', {
    concurrency: MCP_WORKER_CONCURRENCY,
    batchSize: BATCH_SIZE,
  });
})();

export async function gracefulShutdown() {
  logger.info('MCP sync worker shutting down...');
  try {
    await mcpSyncWorker.close();
    logger.info('MCP sync worker shutdown complete');
  } catch (err) {
    logger.error('Error during MCP sync worker shutdown', { error: err.message });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default mcpSyncWorker;
