import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { SyncJob } from '../models/SyncJob.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { NotionAdapter } from '../adapters/NotionAdapter.js';
import { documentIndexQueue, notionSyncQueue } from '../config/queue.js';
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
import {
  initSyncMetrics,
  setTotalDocuments,
  recordDocumentProcessed,
  completeSyncMetrics,
  clearSyncMetrics,
} from '../services/metrics/syncMetrics.js';

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

// Dead Letter Queue for failed jobs
import { setupDLQListener } from '../services/deadLetterQueue.js';

/**
 * Rebuild vocabulary asynchronously after full sync
 * Fetches documents from Qdrant and rebuilds vocabulary + sparse vectors
 */
async function rebuildVocabularyAsync(workspaceId) {
  try {
    // Use the new method that fetches documents from Qdrant
    // This properly builds vocabulary and re-indexes sparse vectors
    const result = await sparseVectorManager.rebuildVocabularyFromQdrant(workspaceId);
    logger.info('Vocabulary rebuilt after full sync', {
      service: 'notion-sync',
      workspaceId,
      vocabularySize: result.vocabularySize,
      documentsIndexed: result.totalDocuments,
    });
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

  // CRITICAL: Check for already running sync to prevent concurrent syncs
  const existingActiveJobs = await SyncJob.find({
    workspaceId,
    status: 'processing',
    jobId: { $ne: job.id }, // Exclude current job
  });

  if (existingActiveJobs.length > 0) {
    const existingJob = existingActiveJobs[0];
    logger.warn(`Aborting job ${job.id} - another sync already processing for workspace`, {
      service: 'notion-sync',
      workspaceId,
      currentJobId: job.id,
      existingJobId: existingJob.jobId,
      existingJobStartedAt: existingJob.startedAt,
    });

    // Don't throw - just return to mark job as complete (prevents retries)
    return {
      aborted: true,
      reason: 'concurrent_sync_detected',
      existingJobId: existingJob.jobId,
    };
  }

  // Phase 4: Initialize sync metrics
  initSyncMetrics(workspaceId, job.id);

  emitSyncStart(workspaceId, triggeredBy, { jobId: job.id, syncType });

  const syncJob = await SyncJob.findOneAndUpdate(
    { jobId: job.id, workspaceId }, // Include workspaceId to avoid cross-workspace collisions
    {
      jobId: job.id,
      workspaceId,
      jobType: syncType === 'full' ? 'full_sync' : 'incremental_sync',
      status: 'processing',
      triggeredBy,
      startedAt: new Date(),
      createdAt: new Date(), // Always update createdAt so job appears in recent history
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

    // Phase 4: Set total documents for metrics
    setTotalDocuments(workspaceId, notionDocuments.length);

    const filteredDocuments = filterDocuments(notionDocuments, workspace, options);
    logger.info(`Processing ${filteredDocuments.length} documents after filtering`);

    const results = buildSyncResults();

    const documentsToSync = await determineDocumentsToSync(filteredDocuments, workspace, syncType);
    logger.info(`${documentsToSync.length} documents need syncing`);

    const BATCH_SIZE = parseInt(process.env.BATCH_SIZE) || 30; // Increased for faster sync
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

          const existingDoc = await DocumentSource.findOne({
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
            skipM3: true, // Skip M3 processing during sync for speed
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
            await DocumentSource.findOneAndUpdate(
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

          // Phase 4: Record document success
          recordDocumentProcessed(workspaceId, {
            success: true,
            documentTitle: documentContent.title,
            chunksCreated: 1, // Actual chunk count recorded by index worker
          });

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

          // Phase 4: Record document error
          recordDocumentProcessed(workspaceId, {
            success: false,
            documentTitle: doc.id,
            error: { code: error.code || 'UnknownError', name: error.name, message: error.message },
          });

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

    // Phase 4: Complete sync metrics and log final stats
    const finalMetrics = completeSyncMetrics(workspaceId);
    if (finalMetrics) {
      logger.info(`Sync metrics for workspace ${workspaceId}:`, {
        service: 'sync-metrics',
        docsPerMinute: finalMetrics.docsPerMinute,
        successRate: finalMetrics.successRate,
        syncMode: finalMetrics.syncMode,
        estimatedCost: finalMetrics.estimatedCost,
      });
    }

    logger.info(`Sync completed for workspace ${workspaceId}:`, results);
    return results;
  } catch (error) {
    logger.error(`Sync failed for workspace ${workspaceId}:`, error);

    // Phase 4: Clear sync metrics on error
    clearSyncMetrics(workspaceId);

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
  lockDuration: 600000,      // 10 minutes - max time for a single operation
  lockRenewTime: 240000,     // 4 minutes - renew lock every 4 min
  maxStalledCount: 3,        // Allow 3 stall detections before failing
  stalledInterval: 300000,   // Check for stalled jobs every 5 minutes
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

// Setup Dead Letter Queue listener for final failures
setupDLQListener(notionSyncWorker, 'notionSync');

// ISSUE #16 FIX: Improved stale job timeout with automatic recovery
const STALE_JOB_TIMEOUT_HOURS = parseInt(process.env.STALE_JOB_TIMEOUT_HOURS) || 2; // Reduced from 12 to 2 hours
const MAX_RECOVERY_ATTEMPTS = parseInt(process.env.MAX_SYNC_RECOVERY_ATTEMPTS) || 2;

/**
 * Clean up stale sync jobs that have been processing for too long
 * ISSUE #16 FIX: Improved detection with automatic recovery
 *
 * Features:
 * - Shorter default timeout (2 hours vs 12)
 * - Automatic re-queue for recoverable jobs
 * - Workspace notification on recovery/failure
 * - Progress-based staleness detection
 */
async function cleanupStaleJobs() {
  try {
    const timeoutMs = STALE_JOB_TIMEOUT_HOURS * 60 * 60 * 1000;
    const cutoffTime = new Date(Date.now() - timeoutMs);

    // Find stale jobs (processing for too long)
    const staleJobs = await SyncJob.find({
      status: 'processing',
      startedAt: { $lt: cutoffTime },
    });

    if (staleJobs.length === 0) {
      return;
    }

    logger.warn(`Found ${staleJobs.length} stale sync jobs`, {
      service: 'notion-sync',
      timeoutHours: STALE_JOB_TIMEOUT_HOURS,
    });

    for (const staleJob of staleJobs) {
      try {
        await recoverStaleJob(staleJob);
      } catch (err) {
        logger.error(`Failed to recover stale job ${staleJob.jobId}:`, {
          service: 'notion-sync',
          error: err.message,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup stale jobs:', { error: error.message });
  }
}

/**
 * Attempt to recover a stale sync job
 * Re-queues if under retry limit, otherwise marks as failed
 */
async function recoverStaleJob(staleJob) {
  const { workspaceId, jobId, jobType, retryCount = 0, progress } = staleJob;

  // Check if we can recover (under retry limit)
  const canRecover = retryCount < MAX_RECOVERY_ATTEMPTS;

  // Calculate how much progress was made
  const progressPercent = progress?.totalDocuments > 0
    ? Math.round((progress.processedDocuments / progress.totalDocuments) * 100)
    : 0;

  logger.warn(`Processing stale job for recovery`, {
    service: 'notion-sync',
    jobId,
    workspaceId,
    retryCount,
    maxRetries: MAX_RECOVERY_ATTEMPTS,
    canRecover,
    progressPercent,
    processedDocs: progress?.processedDocuments || 0,
    totalDocs: progress?.totalDocuments || 0,
  });

  // Update the stale job status
  staleJob.status = canRecover ? 'queued' : 'failed';
  staleJob.completedAt = new Date();
  staleJob.duration = staleJob.completedAt - staleJob.startedAt;
  staleJob.error = {
    message: canRecover
      ? `Job stalled after ${STALE_JOB_TIMEOUT_HOURS} hours at ${progressPercent}% - recovering (attempt ${retryCount + 1}/${MAX_RECOVERY_ATTEMPTS})`
      : `Job timed out after ${STALE_JOB_TIMEOUT_HOURS} hours with ${retryCount} recovery attempts - max retries exceeded`,
    timestamp: new Date(),
  };
  staleJob.retryCount = retryCount + 1;
  await staleJob.save();

  // Update workspace status
  const workspace = await NotionWorkspace.findOne({ workspaceId });

  if (canRecover) {
    // Re-queue the sync job
    const syncType = jobType === 'full_sync' ? 'full' : 'incremental';

    await notionSyncQueue.add(
      'sync',
      {
        workspaceId,
        syncType,
        triggeredBy: 'auto',
        options: {
          recoveryAttempt: retryCount + 1,
          previousJobId: jobId,
          resumeFrom: progress?.processedDocuments || 0,
        },
      },
      {
        jobId: `recovery-${jobId}-${retryCount + 1}`,
        delay: 30000, // Wait 30 seconds before retry
      }
    );

    logger.info(`Stale job ${jobId} re-queued for recovery`, {
      service: 'notion-sync',
      workspaceId,
      newAttempt: retryCount + 1,
      syncType,
    });

    // Update workspace - sync is being recovered
    if (workspace) {
      await workspace.updateSyncStatus('syncing');
    }

    // Emit recovery event for real-time notification
    emitSyncError(workspaceId, new Error('Sync job stalled - automatic recovery in progress'), {
      jobId,
      phase: 'recovery',
      recoverable: true,
      recoveryAttempt: retryCount + 1,
    });
  } else {
    // Max retries exceeded - mark as permanently failed
    logger.error(`Stale job ${jobId} exceeded max recovery attempts`, {
      service: 'notion-sync',
      workspaceId,
      totalAttempts: retryCount + 1,
    });

    if (workspace) {
      await workspace.updateSyncStatus('error');
      workspace.stats.errorCount = (workspace.stats.errorCount || 0) + 1;
      await workspace.save();
    }

    // Emit permanent failure event
    emitSyncError(workspaceId, new Error('Sync job failed after multiple recovery attempts'), {
      jobId,
      phase: 'sync',
      recoverable: false,
      totalAttempts: retryCount + 1,
    });

    // Send error alert for operations visibility
    await sendErrorAlerts(workspaceId, new Error(`Sync job timed out after ${retryCount + 1} attempts`), staleJob);
  }
}

/**
 * Check for progress staleness (no progress for extended period)
 * This catches jobs that are running but not making progress
 */
async function checkProgressStaleness() {
  try {
    const progressTimeoutMinutes = parseInt(process.env.SYNC_PROGRESS_TIMEOUT_MINUTES) || 30;
    const cutoffTime = new Date(Date.now() - progressTimeoutMinutes * 60 * 1000);

    // Find jobs that haven't updated progress recently
    const stalledJobs = await SyncJob.find({
      status: 'processing',
      updatedAt: { $lt: cutoffTime },
      // Only check jobs that have started processing documents
      'progress.totalDocuments': { $gt: 0 },
    });

    for (const job of stalledJobs) {
      logger.warn(`Job ${job.jobId} has not made progress in ${progressTimeoutMinutes} minutes`, {
        service: 'notion-sync',
        workspaceId: job.workspaceId,
        lastUpdate: job.updatedAt,
        progress: job.progress,
      });

      // Mark for recovery in next cleanup cycle
      job.startedAt = new Date(Date.now() - (STALE_JOB_TIMEOUT_HOURS + 1) * 60 * 60 * 1000);
      await job.save();
    }
  } catch (error) {
    logger.error('Failed to check progress staleness:', { error: error.message });
  }
}

(async () => {
  await connectDB();

  // ISSUE #16 FIX: Clean up any stale jobs on startup
  await cleanupStaleJobs();

  // Schedule periodic cleanup every 15 minutes (reduced from 30)
  setInterval(cleanupStaleJobs, 15 * 60 * 1000);

  // Check for progress staleness every 10 minutes
  setInterval(checkProgressStaleness, 10 * 60 * 1000);

  logger.info('Notion sync worker started', {
    service: 'notion-sync',
    staleJobTimeoutHours: STALE_JOB_TIMEOUT_HOURS,
    maxRecoveryAttempts: MAX_RECOVERY_ATTEMPTS,
  });
})();

export default notionSyncWorker;
