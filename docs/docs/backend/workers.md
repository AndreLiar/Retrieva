---
sidebar_position: 3
---

# Background Workers

The platform uses [BullMQ](https://docs.bullmq.io/) backed by Redis for background job processing.

## Active Workers

| Worker | Queue | Concurrency | Purpose |
|--------|-------|-------------|---------|
| `assessmentWorker.js` | `assessmentJobs` | 2 | Orchestrate file indexing + DORA gap analysis |
| `documentIndexWorker.js` | `documentIndex` | configured by `INDEX_WORKER_CONCURRENCY` | Embed document chunks and upsert to Qdrant |
| `questionnaireWorker.js` | `questionnaireJobs` | configured by `QUESTIONNAIRE_WORKER_CONCURRENCY` | LLM scoring for vendor questionnaire responses |
| `monitoringWorker.js` | `monitoringJobs` | 1 | Run compliance monitoring alert checks every 24 h |

All workers are started automatically when the backend process starts (imported by `backend/index.js`).

## Assessment Worker (`workers/assessmentWorker.js`)

Handles two job types on the `assessmentJobs` queue:

### `fileIndex` job

Triggered when a user uploads a file for an assessment.

1. Parses the file buffer (PDF, DOCX, XLSX) via `fileIngestionService`
2. Splits text into semantic chunks
3. Embeds each chunk via Azure OpenAI (`text-embedding-3-small`)
4. Upserts chunk vectors to Qdrant collection (`assessment_{id}`)
5. Updates `Assessment.documents[].status` → `indexed` | `failed`

### `gapAnalysis` job

Triggered once all files for an assessment have been indexed.

1. Polls (up to 2 minutes) until all `fileIndex` jobs complete
2. For each DORA article, retrieves relevant chunks from Qdrant
3. Calls LLM (`gpt-4o-mini`) to classify coverage: `covered` | `partial` | `missing`
4. Stores gap results in `Assessment.results`
5. Updates Assessment status: `analyzing` → `complete` | `failed`

### DORA Knowledge Base

Before running assessments in a new environment, seed the compliance knowledge base:

```bash
npm run seed:compliance         # Upsert DORA articles into compliance_kb collection
npm run seed:compliance:reset   # Wipe and re-seed
```

The seed script is idempotent.

## Document Index Worker (`workers/documentIndexWorker.js`)

Processes individual document chunks and stores them in Qdrant.

### Job Data

```javascript
{
  workspaceId: 'ws-123',
  sourceId: 'doc-456',
  chunks: [...],      // pre-chunked text segments
  operation: 'add' | 'update' | 'delete',
}
```

### Flow

1. For `delete`: removes existing vectors from Qdrant filtered by `workspaceId` + `sourceId`
2. For `add`/`update`:
   - Embeds chunks concurrently (up to `EMBEDDING_MAX_CONCURRENCY` parallel calls)
   - Upserts vectors to Qdrant with workspace + source metadata
   - Updates `DocumentSource` in MongoDB

### Configuration

```bash
INDEX_WORKER_CONCURRENCY=3     # Parallel document jobs (default: 3)
EMBEDDING_MAX_CONCURRENCY=10   # Parallel embedding API calls
BATCH_SIZE=10                  # Documents per batch
```

## Monitoring Worker (`workers/monitoringWorker.js`)

Runs compliance monitoring checks on a 24-hour schedule. Triggered by a BullMQ repeatable job set up at server startup via `scheduleMonitoringJob()`.

### Job type: `run-monitoring-alerts`

Calls `runMonitoringAlerts()` from `alertMonitorService.js`, which runs 4 checks in parallel:

| Check | Condition | Alert key |
|-------|-----------|-----------|
| Certification expiry | `validUntil` within 90 days | `cert-expiry-90-<certType>` |
| Certification expiry | `validUntil` within 30 days | `cert-expiry-30-<certType>` |
| Certification expiry | `validUntil` within 7 days | `cert-expiry-7-<certType>` |
| Contract renewal | `contractEnd` within 60 days | `contract-renewal-60` |
| Annual review overdue | `nextReviewDate` is in the past | `annual-review-overdue` |
| Assessment overdue | No complete assessment in 12 months | `assessment-overdue-12mo` |

### Deduplication

Alert state is persisted in `Workspace.alertsSentAt` (a `Map<String, Date>`). Each check skips sending if the alert key was already sent within the last 20 hours. This gives the daily cron 4 hours of drift tolerance.

### Email delivery

Alerts are sent to all **active owners** of the workspace via `emailService.sendMonitoringAlert()`, subject to the owner's `notificationPreferences.email.system_alert` setting.

### Configuration

```bash
MONITORING_INTERVAL_HOURS=24   # How often the job runs (default: 24)
```

## Queue Configuration (`config/queue.js`)

```javascript
export const assessmentQueue    = new Queue('assessmentJobs',    { ... });
export const documentIndexQueue = new Queue('documentIndex',     { ... });
export const questionnaireQueue = new Queue('questionnaireJobs', { ... });
export const monitoringQueue    = new Queue('monitoringJobs',    { ... });
```

All queues use exponential backoff and Redis for persistence. `scheduleMonitoringJob()` registers the 24-hour repeatable job on startup (mirrors `scheduleMemoryDecayJob()`).

## Dead Letter Queue

Failed jobs that exhaust all retries are recorded in `DeadLetterJob` (MongoDB) via `services/deadLetterQueue.js`. The DLQ listener is set up in `documentIndexWorker.js`:

```javascript
import { setupDLQListener } from '../services/deadLetterQueue.js';
setupDLQListener(documentIndexWorker, 'documentIndex');
```

## Graceful Shutdown

`workers/index.js` handles `SIGTERM` and `SIGINT`:

1. `closeQueues()` — stops accepting new jobs, waits for active jobs
2. `disconnectRedis()` — closes Redis connections
3. `disconnectDB()` — closes MongoDB connection

## Running Workers

Workers start automatically when the backend process starts (imported by `backend/index.js`).

```bash
# Start backend + workers together
npm run dev
```
