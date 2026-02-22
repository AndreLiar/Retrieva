---
sidebar_position: 3
---

# Background Workers

The platform uses BullMQ for background job processing. Workers handle long-running tasks like syncing data sources and document indexing.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Queue System                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────┐  ┌─────────────────┐        ┌─────────────────┐        │
│  │  notionSync     │  │    mcpSync      │        │  documentIndex  │        │
│  │     Queue       │  │     Queue       │        │     Queue       │        │
│  └────────┬────────┘  └────────┬────────┘        └────────┬────────┘        │
│           │                    │                           │                  │
│           ▼                    ▼                           ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐       ┌─────────────────┐         │
│  │ Notion Sync     │  │   MCP Sync      │──────▶│ Document Index  │         │
│  │    Worker       │──┤    Worker       │       │    Worker       │         │
│  └─────────────────┘  └─────────────────┘       └─────────────────┘         │
│           │                    │                           │                  │
│           ▼                    ▼                           ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐       ┌─────────────────┐         │
│  │  Notion API     │  │  MCP Server(s)  │       │     Qdrant      │         │
│  └─────────────────┘  │ (Confluence,    │       └─────────────────┘         │
│                        │  GitHub, …)     │                                   │
│                        └─────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Queue Configuration

Four queues are defined in `config/queue.js`:

| Queue | Purpose | Retries | Initial backoff |
|-------|---------|---------|-----------------|
| `notionSync` | Notion workspace sync jobs | 3 | 60 s exponential |
| `mcpSync` | MCP data source sync jobs | 3 | 60 s exponential |
| `dataSourceSync` | File / URL / Confluence sync jobs | 3 | 60 s exponential |
| `documentIndex` | Per-document embedding + Qdrant indexing | 3 | 30 s exponential |

```javascript
// config/queue.js

export const notionSyncQueue  = new Queue('notionSync',  { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 } } });
export const mcpSyncQueue     = new Queue('mcpSync',     { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 60000 } } });
export const documentIndexQueue = new Queue('documentIndex', { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30000 } } });
```

## Notion Sync Worker

### Purpose

Synchronizes Notion workspace content with the vector store.

### Job Data

```javascript
{
  workspaceId: 'ws-123',
  syncType: 'full' | 'incremental',
  triggeredBy: 'manual' | 'scheduled' | 'auto',
  options: {
    pageFilter: string[],      // Optional: specific pages
    recoveryAttempt: number,   // For retry jobs
  }
}
```

### Worker Implementation

```javascript
// workers/notionSyncWorker.js

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';

async function processSyncJob(job) {
  const { workspaceId, syncType, triggeredBy } = job.data;

  // 1. Check for concurrent sync
  const existingJobs = await SyncJob.find({
    workspaceId,
    status: 'processing',
    jobId: { $ne: job.id },
  });

  if (existingJobs.length > 0) {
    return { aborted: true, reason: 'concurrent_sync_detected' };
  }

  // 2. Update workspace status
  await workspace.updateSyncStatus('syncing', job.id);

  // 3. Fetch documents from Notion
  const adapter = new NotionAdapter();
  await adapter.authenticate(workspace.getDecryptedToken());
  const notionDocuments = await adapter.listDocuments();

  // 4. Determine what needs syncing
  const documentsToSync = await determineDocumentsToSync(
    notionDocuments,
    workspace,
    syncType
  );

  // 5. Process in batches
  const BATCH_SIZE = 30;
  for (let i = 0; i < documentsToSync.length; i += BATCH_SIZE) {
    const batch = documentsToSync.slice(i, i + BATCH_SIZE);

    for (const doc of batch) {
      try {
        const content = await adapter.getDocumentContent(doc.id);

        // Queue for indexing
        await documentIndexQueue.add('indexDocument', {
          workspaceId,
          sourceId: doc.id,
          documentContent: content,
          operation: existingDoc ? 'update' : 'add',
        });
      } catch (error) {
        recordError(doc.id, error);
      }
    }
  }

  // 6. Handle deletions (full sync only)
  if (syncType === 'full') {
    const deletedDocs = await detectDeletedDocuments(workspace, notionDocuments);
    for (const doc of deletedDocs) {
      await documentIndexQueue.add('indexDocument', {
        workspaceId,
        sourceId: doc.sourceId,
        operation: 'delete',
      });
    }
  }

  // 7. Update stats and complete
  await workspace.updateStats({
    totalDocuments: notionDocuments.length,
    lastSyncDuration: Date.now() - startTime,
  });

  return results;
}

export const notionSyncWorker = new Worker('notionSync', processSyncJob, {
  connection: redisConnection,
  concurrency: 2,
  lockDuration: 600000,      // 10 minutes
  lockRenewTime: 240000,     // Renew every 4 minutes
  maxStalledCount: 3,
  stalledInterval: 300000,   // Check every 5 minutes
});
```

### Real-Time Events

The worker emits real-time events for UI updates:

```javascript
import { emitSyncStart, emitSyncProgress, emitSyncComplete } from '../services/realtimeEvents.js';

// Start
emitSyncStart(workspaceId, triggeredBy, { jobId, syncType });

// Progress
emitSyncProgress(workspaceId, {
  phase: 'processing',
  current: 50,
  total: 100,
  message: 'Processing batch 2/4',
});

// Complete
emitSyncComplete(workspaceId, {
  totalPages: 100,
  successCount: 95,
  errorCount: 5,
  duration: 120000,
});
```

### Stale Job Recovery

```javascript
async function cleanupStaleJobs() {
  const timeoutMs = STALE_JOB_TIMEOUT_HOURS * 60 * 60 * 1000;
  const cutoffTime = new Date(Date.now() - timeoutMs);

  const staleJobs = await SyncJob.find({
    status: 'processing',
    startedAt: { $lt: cutoffTime },
  });

  for (const job of staleJobs) {
    if (job.retryCount < MAX_RECOVERY_ATTEMPTS) {
      // Re-queue the job
      await notionSyncQueue.add('sync', {
        workspaceId: job.workspaceId,
        syncType: job.jobType,
        options: { recoveryAttempt: job.retryCount + 1 },
      });
    } else {
      // Mark as failed
      job.status = 'failed';
      await job.save();
    }
  }
}

// Run cleanup every 15 minutes
setInterval(cleanupStaleJobs, 15 * 60 * 1000);
```

## Document Index Worker

### Purpose

Indexes documents into the Qdrant vector store.

### Job Data

```javascript
{
  workspaceId: 'ws-123',
  sourceId: 'page-456',
  documentContent: {
    title: 'Document Title',
    content: 'Document content...',
    blocks: [...],  // Notion blocks for semantic chunking
    contentHash: 'sha256...',
    url: 'https://notion.so/...',
    lastModified: '2024-01-01T00:00:00Z',
  },
  operation: 'add' | 'update' | 'delete'
}
```

### Worker Implementation

```javascript
// workers/documentIndexWorker.js

import { Worker } from 'bullmq';
import { prepareNotionDocumentForIndexing } from '../loaders/notionDocumentLoader.js';

async function processIndexJob(job) {
  const { workspaceId, sourceId, documentContent, operation } = job.data;

  if (operation === 'delete') {
    // Remove from vector store
    await vectorStore.delete({
      filter: {
        must: [
          { key: 'metadata.workspaceId', match: { value: workspaceId } },
          { key: 'metadata.sourceId', match: { value: sourceId } },
        ],
      },
    });

    // Update MongoDB
    await DocumentSource.findOneAndUpdate(
      { workspaceId, sourceId },
      { syncStatus: 'deleted' }
    );

    return { deleted: true };
  }

  // Chunk the document
  const chunks = await prepareNotionDocumentForIndexing(
    documentContent,
    workspaceId,
    documentContent.blocks  // Use blocks for semantic chunking
  );

  // Delete existing vectors for this document
  await vectorStore.delete({
    filter: {
      must: [
        { key: 'metadata.workspaceId', match: { value: workspaceId } },
        { key: 'metadata.sourceId', match: { value: sourceId } },
      ],
    },
  });

  // Add new vectors
  const ids = await vectorStore.addDocuments(chunks);

  // Update document source
  await DocumentSource.findOneAndUpdate(
    { workspaceId, sourceId },
    {
      syncStatus: 'indexed',
      chunkCount: chunks.length,
      vectorStoreIds: ids,
      lastIndexedAt: new Date(),
    }
  );

  // Update sparse index
  await sparseVectorManager.indexDocuments(chunks, workspaceId);

  return {
    chunksCreated: chunks.length,
    vectorIds: ids,
  };
}

export const documentIndexWorker = new Worker('documentIndex', processIndexJob, {
  connection: redisConnection,
  concurrency: 20,  // High concurrency for indexing
  limiter: {
    max: 50,        // Max 50 jobs per second
    duration: 1000,
  },
});
```

## MCP Sync Worker

### Purpose

Synchronizes content from any external data source connected via the [Model Context Protocol](../architecture/data-source-connectors) — Confluence, GitHub, Jira, Google Drive, and others. Mirrors the Notion Sync Worker pattern but is source-agnostic.

### Job Data

```javascript
{
  mcpDataSourceId: 'mcp-source-id',   // MCPDataSource._id
  workspaceId:     'ws-123',
  syncType:        'full' | 'incremental',
  triggeredBy:     'manual' | 'auto',
}
```

### Worker Implementation

```javascript
// workers/mcpSyncWorker.js

async function processMCPSyncJob(job) {
  const { mcpDataSourceId, workspaceId, syncType } = job.data;

  // 1. Load MCPDataSource connection config
  const mcpSource = await MCPDataSource.findById(mcpDataSourceId);
  await mcpSource.markSyncing(job.id);

  // 2. Connect MCPDataSourceAdapter to the remote MCP server
  const adapter = new MCPDataSourceAdapter(
    mcpSource.serverUrl,
    mcpSource.get('authToken'),  // decrypted
    mcpSource.sourceType
  );
  await adapter.authenticate();

  // 3. Determine documents to sync
  let docsToSync;
  if (syncType === 'incremental' && mcpSource.lastSyncedAt) {
    const changes = await adapter.detectChanges(mcpSource.lastSyncedAt);
    docsToSync = changes.filter(c => c.changeType !== 'deleted');
    // soft-delete removed docs
  } else {
    docsToSync = await adapter.listDocuments();
  }

  // 4. Process in batches — fetch + enqueue to documentIndexQueue
  for (const doc of docsToSync) {
    const documentContent = await adapter.getDocumentContent(doc.id);
    await documentIndexQueue.add('indexDocument', {
      workspaceId,
      sourceId:        doc.id,
      sourceType:      mcpSource.sourceType,  // e.g. 'confluence'
      documentContent,
      operation:       existingDoc ? 'update' : 'add',
      skipM3:          true,
    });
  }

  // 5. Update stats
  await mcpSource.markSynced({ totalDocuments, documentsIndexed, ... });
}

export const mcpSyncWorker = new Worker('mcpSync', processMCPSyncJob, {
  concurrency:      2,
  lockDuration:     600000,   // 10 minutes
  lockRenewTime:    240000,
  maxStalledCount:  3,
});
```

### Source Type in Qdrant Metadata

When the `mcpSyncWorker` enqueues a document it passes `sourceType` (e.g. `'confluence'`) to `documentIndexWorker`. That value flows through `prepareNotionDocumentForIndexing` into every chunk's Qdrant metadata, so citations and filters correctly identify the origin source.

### Environment Variables

```bash
MCP_WORKER_CONCURRENCY=2      # Parallel sync jobs (default: 2)
MCP_SYNC_BATCH_SIZE=20        # Documents per batch (default: 20)
MCP_CONNECT_TIMEOUT_MS=15000  # MCP server connect timeout
MCP_TOOL_TIMEOUT_MS=30000     # Per-tool call timeout
```

## DataSource Sync Worker

### Purpose

Orchestrates ingestion for the three "bring your own content" source types: uploaded files, public URLs, and Confluence Cloud spaces. Mirrors the MCP Sync Worker pattern but requires no external MCP server.

### Job Data

```javascript
{
  dataSourceId: 'ds-abc123',   // DataSource._id
  workspaceId:  'ws-123',
  sourceType:   'file' | 'url' | 'confluence',
}
```

### Worker Implementation

```javascript
// workers/dataSourceSyncWorker.js

async function processDataSourceJob(job) {
  const { dataSourceId, workspaceId, sourceType } = job.data;
  const dataSource = await DataSource.findById(dataSourceId);

  await dataSource.markSyncing(job.id);
  emitSyncStart(workspaceId, 'datasource', { dataSourceId });

  switch (sourceType) {
    case 'file':
      // FileAdapter reads config.parsedText (pre-parsed at upload),
      // chunks via chunkText(), enqueues to documentIndexQueue,
      // then clears parsedText from the DB.
      await processFile(dataSource, workspaceId);
      break;
    case 'url':
      // UrlCrawlerAdapter fetches the URL (axios, 10 s timeout),
      // strips HTML, chunks, enqueues to documentIndexQueue.
      await processUrl(dataSource, workspaceId);
      break;
    case 'confluence':
      // ConfluenceAdapter paginates pages in the space via Confluence
      // REST API v1, strips storage XML, chunks each page body.
      await processConfluence(dataSource, workspaceId);
      break;
  }

  await dataSource.markSynced(stats);
  emitSyncComplete(workspaceId, { dataSourceId, ...stats });
}

export const dataSourceSyncWorker = new Worker('dataSourceSync', processDataSourceJob, {
  concurrency: 2,
  lockDuration: 600000,
});
```

### Adapters

| Adapter | File | Key dependency |
|---------|------|----------------|
| `FileAdapter` | `backend/adapters/FileAdapter.js` | `fileIngestionService.chunkText()` |
| `UrlCrawlerAdapter` | `backend/adapters/UrlCrawlerAdapter.js` | `axios` (bundled) |
| `ConfluenceAdapter` | `backend/adapters/ConfluenceAdapter.js` | Confluence Cloud REST API v1 |

All adapters produce an array of `{ content, metadata }` chunks that are forwarded to `documentIndexQueue` for embedding + Qdrant upsert.

---

## Dead Letter Queue

Failed jobs are sent to a DLQ for manual inspection:

```javascript
// services/deadLetterQueue.js

export function setupDLQListener(worker, queueName) {
  worker.on('failed', async (job, error) => {
    if (job.attemptsMade >= job.opts.attempts) {
      // Move to DLQ
      await dlqQueue.add('failed-job', {
        originalQueue: queueName,
        jobId: job.id,
        data: job.data,
        error: {
          message: error.message,
          stack: error.stack,
        },
        failedAt: new Date(),
      });

      logger.error('Job moved to DLQ', {
        service: queueName,
        jobId: job.id,
        error: error.message,
      });
    }
  });
}
```

## Worker Events

```javascript
// Event handlers
notionSyncWorker.on('completed', (job) => {
  logger.info(`Sync job ${job.id} completed`);
});

notionSyncWorker.on('failed', (job, err) => {
  logger.error(`Sync job ${job.id} failed:`, err);
});

notionSyncWorker.on('error', (err) => {
  logger.error('Worker error:', err);
});

notionSyncWorker.on('stalled', (jobId) => {
  logger.warn(`Job ${jobId} stalled`);
});
```

## Monitoring

### Queue Metrics

```javascript
const queueStatus = await notionSyncQueue.getJobCounts();
// { waiting: 5, active: 2, completed: 100, failed: 3 }

const activeJobs = await notionSyncQueue.getActive();
const failedJobs = await notionSyncQueue.getFailed();
```

### Job Progress

```javascript
// Update progress from within job
await job.updateProgress({
  processedDocuments: 50,
  totalDocuments: 100,
  currentDocument: 'Page Title',
});

// Read progress
const progress = job.progress;
```

## Configuration

```bash
# Worker settings
BATCH_SIZE=30
STALE_JOB_TIMEOUT_HOURS=2
MAX_SYNC_RECOVERY_ATTEMPTS=2
SYNC_PROGRESS_TIMEOUT_MINUTES=30

# Index worker
INDEX_CONCURRENCY=20
INDEX_RATE_LIMIT=50
```

## Running Workers

```bash
# With API server (default)
npm run dev

# Workers only
npm run workers
npm run workers:dev  # With auto-reload
```

---

## Assessment Worker (`workers/assessmentWorker.js`)

BullMQ Worker on the `assessmentJobs` queue (concurrency: 2). Handles two job types:

### `fileIndex` job

- Deserialises the file buffer from JSON (`Buffer.from(buffer.data)`)
- Calls `fileIngestionService.ingestFile()` to parse, chunk, embed, and upsert into the `assessment_{id}` Qdrant collection
- Updates the document status in MongoDB (`uploading` → `indexed` | `failed`)
- Emits `assessment:update` via Socket.io on completion

### `gapAnalysis` job

- Polls (12 × 10 s = 2 min max) until all `fileIndex` jobs are complete
- Calls `gapAnalysisAgent.runGapAnalysis(assessmentId)`
- Updates Assessment status to `analyzing` → `complete` | `failed`
- Emits `assessment:update` with final status

### Queue

`assessmentJobs` queue is defined in `config/queue.js` alongside `notionSync`, `mcpSync`, and `documentIndex`. The worker is imported at startup in `index.js`.

### DORA Knowledge Base Seed

Before running assessments in a new environment, seed the compliance knowledge base:

```bash
npm run seed:compliance         # Upsert DORA articles into compliance_kb
npm run seed:compliance:reset   # Wipe and re-seed
```

The seed script is idempotent — it checks if `compliance_kb` already exists before creating it.
