import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { SyncJob } from '../models/SyncJob.js';
import { NotionAdapter } from '../adapters/NotionAdapter.js';
import { documentIndexQueue } from '../config/queue.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';
import { documentRetryTracker } from '../utils/rag/documentRetryTracker.js';
import { notionCircuitBreaker } from '../utils/core/circuitBreaker.js';
import { sparseVectorManager } from '../services/search/sparseVector.js';
import {
  emitSyncStart,
  emitSyncProgress,
  emitSyncPageFetched,
  emitSyncComplete,
  emitSyncError,
} from '../services/realtimeEvents.js';

// Extracted helpers and notifications
import {
  filterDocuments,
  determineDocumentsToSync,
  detectDeletedDocuments,
  buildSyncResults,
} from './notionSyncHelpers.js';
import {
  sendErrorAlerts,
  sendRateLimitWarning,
  sendCompletionNotification,
  logSyncActivity,
} from './notionSyncNotifications.js';

/**
 * Rebuild vocabulary asynchronously after full sync
 */
async function rebuildVocabularyAsync(workspaceId) {
  try {
    await sparseVectorManager.buildVocabulary(workspaceId);
    logger.info('Vocabulary rebuilt after full sync', { service: 'notion-sync', workspaceId });
  } catch (err) {
    logger.warn('Vocabulary rebuild failed (non-critical)', {
      service: 'notion-sync',
      workspaceId,
      error: err.message,
    });
  }
}

/**
 * Process Notion workspace synchronization job
 */
async function processSyncJob(job) {
  const { workspaceId, syncType, triggeredBy = 'auto', options = {} } = job.data;

  logger.info(`Starting ${syncType} sync for workspace ${workspaceId}, job ${job.id}`);

  emitSyncStart(workspaceId, triggeredBy, { jobId: job.id, syncType });

  const syncJob = await SyncJob.findOneAndUpdate(
    { jobId: job.id },
    {
      jobId: job.id,
      workspaceId,
      jobType: syncType === 'full' ? 'full_sync' : 'incremental_sync',
      status: 'processing',
      triggeredBy,
      startedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  try {
    const workspace = await NotionWorkspace.findOne({ workspaceId });
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    await workspace.updateSyncStatus('syncing', job.id);

    const { activityUserId, workspaceOwner } = await logSyncActivity(
      workspace,
      'sync_started',
      { syncType, jobId: job.id },
      triggeredBy
    );

    const adapter = new NotionAdapter();
    const accessToken = workspace.getDecryptedToken();
    await adapter.authenticate(accessToken);

    logger.info(`Fetching documents from Notion workspace ${workspaceId}`);
    emitSyncProgress(workspaceId, {
      phase: 'fetching',
      current: 0,
      total: 0,
      message: 'Fetching document list from Notion...',
    });

    const notionDocuments = await adapter.listDocuments();

    emitSyncProgress(workspaceId, {
      phase: 'fetching',
      current: notionDocuments.length,
      total: notionDocuments.length,
      message: `Found ${notionDocuments.length} documents in Notion`,
    });

    await syncJob.updateProgress({
      totalDocuments: notionDocuments.length,
      currentDocument: 'Analyzing documents...',
    });

    const filteredDocuments = filterDocuments(notionDocuments, workspace, options);
    logger.info(`Processing ${filteredDocuments.length} documents after filtering`);

    const results = buildSyncResults();

    const documentsToSync = await determineDocumentsToSync(filteredDocuments, workspace, syncType);
    logger.info(`${documentsToSync.length} documents need syncing`);

    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 10;
    logger.info(`Processing in batches of ${BATCH_SIZE} documents`);

    for (let i = 0; i < documentsToSync.length; i += BATCH_SIZE) {
      const batch = documentsToSync.slice(i, Math.min(i + BATCH_SIZE, documentsToSync.length));
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(documentsToSync.length / BATCH_SIZE);

      logger.info(
        `Processing batch ${batchNum}/${totalBatches} (documents ${i + 1}-${i + batch.length})`
      );
      emitSyncProgress(workspaceId, {
        phase: 'processing',
        current: i,
        total: documentsToSync.length,
        message: `Processing batch ${batchNum}/${totalBatches}`,
      });

      let batchSuccessCount = 0;
      let batchSkippedCount = 0;
      let batchErrorCount = 0;

      for (const doc of batch) {
        try {
          if (documentRetryTracker.shouldSkip(doc.id)) {
            logger.warn(`Skipping document ${doc.id} due to repeated failures`, {
              service: 'notion-sync',
              documentId: doc.id,
              failureInfo: documentRetryTracker.getFailureInfo(doc.id),
            });
            batchSkippedCount++;
            continue;
          }

          const existingDoc = await require('../models/DocumentSource.js').DocumentSource.findOne({
            workspaceId,
            sourceId: doc.id,
          });

          logger.debug(`Fetching content for document ${doc.id}`);
          const documentContent = await adapter.getDocumentContent(doc.id);
          documentRetryTracker.resetFailures(doc.id);

          if (!documentContent.content || documentContent.content.trim().length < 50) {
            logger.debug(`Document ${doc.id} has minimal content, skipping`);
            batchSkippedCount++;
            continue;
          }

          const contentChanged =
            !existingDoc || existingDoc.contentHash !== documentContent.contentHash;
          if (!contentChanged && syncType === 'incremental') {
            logger.debug(`Document ${doc.id} unchanged, skipping`);
            batchSkippedCount++;
            continue;
          }

          await documentIndexQueue.add('indexDocument', {
            workspaceId,
            sourceId: doc.id,
            documentContent,
            operation: existingDoc ? 'update' : 'add',
          });

          if (existingDoc) {
            existingDoc.title = documentContent.title;
            existingDoc.url = documentContent.url;
            existingDoc.contentHash = documentContent.contentHash;
            existingDoc.lastModifiedInSource = new Date(documentContent.lastModified);
            existingDoc.syncStatus = 'pending';
            existingDoc.metadata = {
              ...existingDoc.metadata,
              author: documentContent.author,
              properties: documentContent.properties,
            };
            await existingDoc.save();
            results.documentsUpdated++;
          } else {
            await require('../models/DocumentSource.js').DocumentSource.findOneAndUpdate(
              { workspaceId, sourceId: doc.id },
              {
                workspaceId,
                sourceType: 'notion',
                sourceId: doc.id,
                documentType: doc.object === 'database' ? 'database' : 'page',
                title: documentContent.title,
                url: documentContent.url,
                contentHash: documentContent.contentHash,
                lastModifiedInSource: new Date(documentContent.lastModified),
                syncStatus: 'pending',
                metadata: {
                  author: documentContent.author,
                  createdAt: new Date(documentContent.createdAt),
                  properties: documentContent.properties,
                },
              },
              { upsert: true, new: true }
            );
            results.documentsAdded++;
          }

          batchSuccessCount++;
          emitSyncPageFetched(workspaceId, {
            pageId: doc.id,
            title: documentContent.title,
            status: 'success',
          });
        } catch (error) {
          if (error.circuitBreakerOpen) {
            logger.warn(`Circuit breaker blocked document ${doc.id}`, {
              service: 'notion-sync',
              documentId: doc.id,
            });
            batchSkippedCount++;
            logger.info('Circuit breaker is open - pausing for 60 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 60000));
            continue;
          }

          const shouldSkip = documentRetryTracker.recordFailure(doc.id, error);
          const isRetryable = documentRetryTracker.isRetryableError(error);

          logger.error(`Error processing document ${doc.id}:`, {
            service: 'notion-sync',
            error: error.message,
            isRetryable,
            willSkipInFuture: shouldSkip,
            failureCount: documentRetryTracker.getFailureInfo(doc.id)?.count || 1,
          });

          batchErrorCount++;
          results.errors.push({
            documentId: doc.id,
            error: error.message,
            timestamp: new Date(),
            isRetryable,
            shouldSkip,
          });
          emitSyncPageFetched(workspaceId, {
            pageId: doc.id,
            title: doc.id,
            status: 'error',
            error: error.message,
          });

          if (error.message?.includes('rate_limited')) {
            logger.warn('Rate limit detected, pausing for 5 seconds...');
            await sendRateLimitWarning(workspaceId, i, documentsToSync.length);
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }

          if (error.message?.toLowerCase().includes('timeout')) {
            logger.warn('Timeout detected, pausing for 2 seconds...');
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      await syncJob.updateProgress({
        processedDocuments: i + batch.length,
        successCount: (syncJob.progress.successCount || 0) + batchSuccessCount,
        skippedCount: (syncJob.progress.skippedCount || 0) + batchSkippedCount,
        errorCount: (syncJob.progress.errorCount || 0) + batchErrorCount,
        currentDocument: adapter.extractTitle(batch[batch.length - 1]),
      });

      logger.info(
        `Batch ${batchNum}/${totalBatches} complete: ${batchSuccessCount} successful, ${batchSkippedCount} skipped, ${batchErrorCount} errors`
      );
    }

    if (syncType === 'full') {
      const deletedDocs = await detectDeletedDocuments(workspace, filteredDocuments);
      logger.info(`Found ${deletedDocs.length} deleted documents`);

      for (const deletedDoc of deletedDocs) {
        try {
          await documentIndexQueue.add('indexDocument', {
            workspaceId,
            sourceId: deletedDoc.sourceId,
            operation: 'delete',
            vectorStoreIds: deletedDoc.vectorStoreIds,
          });
          await deletedDoc.markAsDeleted();
          results.documentsDeleted++;
        } catch (error) {
          logger.error(`Error deleting document ${deletedDoc.sourceId}:`, error);
        }
      }
    }

    const skippedDocuments = documentRetryTracker.getSkippedDocuments();
    if (skippedDocuments.length > 0) {
      logger.warn(`Sync completed with ${skippedDocuments.length} permanently skipped documents`, {
        service: 'notion-sync',
        workspaceId,
        skippedDocuments: skippedDocuments.map((d) => ({
          id: d.documentId,
          failureCount: d.failureCount,
          lastError: d.lastError,
        })),
      });
      results.documentsSkipped = skippedDocuments.length;
      results.skippedDocuments = skippedDocuments;
    }

    await workspace.updateStats({
      totalPages: notionDocuments.filter((d) => d.object === 'page').length,
      totalDatabases: notionDocuments.filter((d) => d.object === 'database').length,
      totalDocuments: notionDocuments.length,
      lastSyncDuration: Date.now() - syncJob.startedAt.getTime(),
    });

    await workspace.updateSyncStatus('active');
    workspace.lastSuccessfulSyncAt = new Date();
    await workspace.save();

    await syncJob.complete(results);

    if (syncType === 'full') {
      rebuildVocabularyAsync(workspaceId);
    }

    const syncDuration = Date.now() - syncJob.startedAt.getTime();
    emitSyncComplete(workspaceId, {
      jobId: job.id,
      totalPages: notionDocuments.length,
      successCount: results.documentsAdded + results.documentsUpdated,
      errorCount: results.errors.length,
      skippedCount: results.documentsSkipped || 0,
      duration: syncDuration,
    });

    await logSyncActivity(
      workspace,
      'sync_completed',
      {
        syncType,
        jobId: job.id,
        totalPages: notionDocuments.length,
        pagesIndexed: results.documentsAdded + results.documentsUpdated,
        errorCount: results.errors.length,
        duration: syncDuration,
      },
      triggeredBy
    );

    await sendCompletionNotification(workspace, results, syncDuration, notionDocuments.length);

    logger.info(`Sync completed for workspace ${workspaceId}:`, results);
    return results;
  } catch (error) {
    logger.error(`Sync failed for workspace ${workspaceId}:`, error);

    emitSyncError(workspaceId, error, { jobId: job.id, phase: 'sync', recoverable: true });

    const workspace = await NotionWorkspace.findOne({ workspaceId });
    if (workspace) {
      await workspace.updateSyncStatus('error');
      workspace.stats.errorCount = (workspace.stats.errorCount || 0) + 1;
      await workspace.save();
      await sendErrorAlerts(workspaceId, error, syncJob);
    }

    await syncJob.fail(error);
    throw error;
  }
}

export const notionSyncWorker = new Worker('notionSync', processSyncJob, {
  connection: redisConnection,
  concurrency: 2,
  lockDuration: 600000,
  lockRenewTime: 240000,
});

notionSyncWorker.on('completed', (job) => {
  logger.info(`Sync job ${job.id} completed`);
});

notionSyncWorker.on('failed', (job, err) => {
  logger.error(`Sync job ${job.id} failed:`, err);
});

notionSyncWorker.on('error', (err) => {
  logger.error('Worker error:', err);
});

(async () => {
  await connectDB();
  logger.info('Notion sync worker started');
})();

export default notionSyncWorker;
