/**
 * DataSource Sync Worker
 *
 * Processes sync jobs for file, URL, and Confluence data sources.
 * Mirrors the pattern of mcpSyncWorker.js.
 *
 * Job shape:
 *   {
 *     dataSourceId: string,   // DataSource._id
 *     workspaceId:  string,
 *     sourceType:   'file' | 'url' | 'confluence',
 *   }
 *
 * Pipeline:
 *   1. Load DataSource record
 *   2. markSyncing(job.id)
 *   3. Dispatch to correct adapter:
 *        file:        FileAdapter.getChunks() → documentIndexQueue, then clearParsedText()
 *        url:         UrlCrawlerAdapter.fetchText() → getChunks() → documentIndexQueue
 *        confluence:  ConfluenceAdapter.listPages() → fetchPageText → getChunks → documentIndexQueue
 *   4. markSynced(stats)
 *   5. Emit realtime events
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { documentIndexQueue, dataSourceSyncQueue } from '../config/queue.js';
import { DataSource } from '../models/DataSource.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { FileAdapter } from '../adapters/FileAdapter.js';
import { UrlCrawlerAdapter } from '../adapters/UrlCrawlerAdapter.js';
import { ConfluenceAdapter } from '../adapters/ConfluenceAdapter.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';
import {
  emitSyncStart,
  emitSyncProgress,
  emitSyncComplete,
  emitSyncError,
} from '../services/realtimeEvents.js';
import { randomUUID } from 'crypto';
import crypto from 'crypto';

const DS_WORKER_CONCURRENCY = parseInt(process.env.DS_WORKER_CONCURRENCY) || 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

async function enqueueChunks(chunks, workspaceId, dataSourceId, sourceType, stats) {
  for (const chunk of chunks) {
    if (!chunk.content || chunk.content.trim().length < 10) {
      stats.skipped++;
      continue;
    }

    const hash = contentHash(chunk.content);
    const sourceId = `${dataSourceId}-chunk-${randomUUID()}`;

    // Upsert a DocumentSource registry record
    await DocumentSource.findOneAndUpdate(
      { workspaceId, sourceId },
      {
        workspaceId,
        sourceId,
        sourceType,
        documentType: 'file',
        title: chunk.metadata?.fileName || chunk.metadata?.title || chunk.metadata?.url || sourceId,
        url: chunk.metadata?.url,
        contentHash: hash,
        lastModifiedInSource: new Date(),
        syncStatus: 'pending',
        metadata: {
          properties: chunk.metadata,
        },
      },
      { upsert: true, new: true }
    );

    await documentIndexQueue.add(
      'indexDocument',
      {
        workspaceId,
        sourceId,
        sourceType,
        documentContent: {
          content: chunk.content,
          contentHash: hash,
          title:
            chunk.metadata?.fileName || chunk.metadata?.title || chunk.metadata?.url || sourceId,
          url: chunk.metadata?.url,
          metadata: chunk.metadata,
        },
        operation: 'add',
      },
      { priority: 10 }
    );

    stats.indexed++;
  }
}

// ---------------------------------------------------------------------------
// Source-type handlers
// ---------------------------------------------------------------------------

async function processFile(dataSource, workspaceId, stats) {
  const adapter = new FileAdapter(dataSource);
  const chunks = await adapter.getChunks();

  stats.total = chunks.length;
  await enqueueChunks(chunks, workspaceId, dataSource._id.toString(), 'file', stats);
  await adapter.clearParsedText();
}

async function processUrl(dataSource, workspaceId, stats) {
  const adapter = new UrlCrawlerAdapter(dataSource);
  const text = await adapter.fetchText();
  const chunks = adapter.getChunks(text);

  stats.total = chunks.length;
  await enqueueChunks(chunks, workspaceId, dataSource._id.toString(), 'url', stats);
}

async function processConfluence(dataSource, workspaceId, stats, job) {
  const adapter = new ConfluenceAdapter(dataSource);
  const pages = await adapter.listPages();

  stats.total = pages.length;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    try {
      const pageText = await adapter.fetchPageText(page.id);

      if (!pageText || pageText.trim().length < 10) {
        stats.skipped++;
        continue;
      }

      const chunks = adapter.getChunks(pageText, page);
      await enqueueChunks(chunks, workspaceId, dataSource._id.toString(), 'confluence', stats);

      // Update job progress every 5 pages
      if (i % 5 === 0) {
        try {
          await job.updateProgress({ phase: 'fetching', total: stats.total, synced: i + 1 });
        } catch (_) {
          // non-critical
        }
        emitSyncProgress(workspaceId, {
          phase: 'fetching',
          total: stats.total,
          current: i + 1,
          message: `Syncing page: ${page.title}`,
        });
      }
    } catch (pageErr) {
      stats.errored++;
      logger.error('Confluence page fetch failed', {
        service: 'datasource-sync',
        pageId: page.id,
        title: page.title,
        error: pageErr.message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Main job processor
// ---------------------------------------------------------------------------

async function processDataSourceSyncJob(job) {
  const { dataSourceId, workspaceId, sourceType } = job.data;
  const startTime = Date.now();

  logger.info('DataSource sync job started', {
    service: 'datasource-sync',
    jobId: job.id,
    dataSourceId,
    workspaceId,
    sourceType,
  });

  // 1. Load the DataSource
  const dataSource = await DataSource.findById(dataSourceId);
  if (!dataSource) {
    throw new Error(`DataSource not found: ${dataSourceId}`);
  }
  if (dataSource.workspaceId !== workspaceId) {
    throw new Error('DataSource workspace mismatch');
  }
  if (dataSource.status === 'syncing') {
    logger.warn('DataSource sync already in progress, skipping', {
      service: 'datasource-sync',
      dataSourceId,
    });
    return { aborted: true, reason: 'already_syncing' };
  }

  // 2. Mark as syncing
  await dataSource.markSyncing(job.id);
  emitSyncStart(workspaceId, 'manual', {
    jobId: job.id,
    syncType: 'full',
    sourceName: dataSource.name,
  });

  const stats = { total: 0, indexed: 0, skipped: 0, errored: 0 };

  try {
    // 3. Dispatch to correct adapter
    switch (sourceType) {
      case 'file':
        await processFile(dataSource, workspaceId, stats);
        break;
      case 'url':
        await processUrl(dataSource, workspaceId, stats);
        break;
      case 'confluence':
        await processConfluence(dataSource, workspaceId, stats, job);
        break;
      default:
        throw new Error(`Unknown sourceType: ${sourceType}`);
    }

    // 4. Mark synced
    const durationMs = Date.now() - startTime;
    await dataSource.markSynced({
      totalDocuments: stats.total,
      documentsIndexed: stats.indexed,
      documentsSkipped: stats.skipped,
      documentsErrored: stats.errored,
    });

    emitSyncComplete(workspaceId, {
      jobId: job.id,
      sourceName: dataSource.name,
      totalPages: stats.total,
      successCount: stats.indexed,
      errorCount: stats.errored,
      skippedCount: stats.skipped,
      duration: durationMs,
    });

    logger.info('DataSource sync job completed', {
      service: 'datasource-sync',
      jobId: job.id,
      dataSourceId,
      ...stats,
      durationMs,
    });

    return { success: true, stats, durationMs };
  } catch (error) {
    await dataSource.addError(error).catch(() => {});
    emitSyncError(workspaceId, error, { jobId: job.id });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Worker registration
// ---------------------------------------------------------------------------

export const dataSourceSyncWorker = new Worker('dataSourceSync', processDataSourceSyncJob, {
  connection: redisConnection,
  concurrency: DS_WORKER_CONCURRENCY,
  lockDuration: 600000,
  lockRenewTime: 240000,
  maxStalledCount: 3,
  stalledInterval: 300000,
});

dataSourceSyncWorker.on('completed', (job, result) => {
  logger.info(`DataSource sync job ${job.id} completed`, { result });
});

dataSourceSyncWorker.on('failed', (job, err) => {
  logger.error(`DataSource sync job ${job.id} failed:`, err);
});

dataSourceSyncWorker.on('error', (err) => {
  logger.error('DataSource sync worker error:', err);
});

(async () => {
  await connectDB();
  logger.info('DataSource sync worker started', { concurrency: DS_WORKER_CONCURRENCY });
})();

export async function gracefulShutdown() {
  logger.info('DataSource sync worker shutting down...');
  try {
    await dataSourceSyncWorker.close();
    logger.info('DataSource sync worker shutdown complete');
  } catch (err) {
    logger.error('Error during DataSource sync worker shutdown', { error: err.message });
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default dataSourceSyncWorker;
