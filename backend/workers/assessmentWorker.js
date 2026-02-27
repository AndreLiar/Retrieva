/**
 * Assessment Worker
 *
 * BullMQ worker that processes two job types:
 *  - fileIndex   : Parse, chunk, embed an uploaded vendor document into Qdrant
 *  - gapAnalysis : Run the DORA gap analysis agent (implemented in Phase 3)
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { Assessment } from '../models/Assessment.js';
import { ingestFile } from '../services/fileIngestionService.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';

// Ensure DB is connected when worker runs
connectDB().catch((err) =>
  logger.error('Assessment worker: DB connection failed', { error: err.message })
);

const CONCURRENCY = parseInt(process.env.ASSESSMENT_WORKER_CONCURRENCY) || 2;

// ---------------------------------------------------------------------------
// Job: fileIndex
// ---------------------------------------------------------------------------

async function processFileIndex(job) {
  const {
    assessmentId,
    documentIndex,
    buffer,
    fileName,
    fileType,
    vendorName,
    userId: _userId,
  } = job.data;

  // `buffer` arrives as a plain object from JSON serialization — convert back to Buffer
  const fileBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer.data || buffer);

  logger.info('Assessment file index job started', {
    service: 'assessment-worker',
    assessmentId,
    fileName,
    jobId: job.id,
  });

  // Mark document as indexing
  await Assessment.findByIdAndUpdate(assessmentId, {
    status: 'indexing',
    statusMessage: `Indexing ${fileName}…`,
    [`documents.${documentIndex}.status`]: 'uploading',
  });

  try {
    await job.updateProgress(10);

    const { chunkCount, collectionName } = await ingestFile({
      buffer: fileBuffer,
      fileType,
      fileName,
      assessmentId,
      vendorName,
      onProgress: async ({ indexed, total }) => {
        const pct = Math.round(10 + (indexed / total) * 70);
        await job.updateProgress(pct);
      },
    });

    // Mark document as indexed
    await Assessment.findByIdAndUpdate(assessmentId, {
      [`documents.${documentIndex}.status`]: 'indexed',
      [`documents.${documentIndex}.qdrantCollectionId`]: collectionName,
    });

    await job.updateProgress(100);

    logger.info('Assessment file indexed', {
      service: 'assessment-worker',
      assessmentId,
      fileName,
      chunkCount,
    });

    return { chunkCount, collectionName };
  } catch (err) {
    logger.error('Assessment file index failed', {
      service: 'assessment-worker',
      assessmentId,
      fileName,
      error: err.message,
    });

    await Assessment.findByIdAndUpdate(assessmentId, {
      [`documents.${documentIndex}.status`]: 'failed',
      status: 'failed',
      statusMessage: `Failed to index ${fileName}: ${err.message}`,
    });

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Job: gapAnalysis (stub — full implementation in Phase 3)
// ---------------------------------------------------------------------------

async function processGapAnalysis(job) {
  const { assessmentId, userId } = job.data;

  logger.info('Gap analysis job started', {
    service: 'assessment-worker',
    assessmentId,
    jobId: job.id,
  });

  await Assessment.findByIdAndUpdate(assessmentId, {
    status: 'analyzing',
    statusMessage: 'Running compliance gap analysis…',
  });

  // Full gap analysis logic injected in Phase 3
  const { runGapAnalysis } = await import('../services/gapAnalysisAgent.js');
  return runGapAnalysis({ assessmentId, userId, job });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker(
  'assessmentJobs',
  async (job) => {
    switch (job.name) {
      case 'fileIndex':
        return processFileIndex(job);
      case 'gapAnalysis':
        return processGapAnalysis(job);
      default:
        logger.warn('Unknown assessment job type', { jobName: job.name, jobId: job.id });
    }
  },
  {
    connection: redisConnection,
    concurrency: CONCURRENCY,
    lockDuration: 10 * 60 * 1000, // 10 minutes
    lockRenewTime: 4 * 60 * 1000, // Renew every 4 minutes
  }
);

worker.on('completed', (job) => {
  logger.info('Assessment job completed', {
    service: 'assessment-worker',
    jobName: job.name,
    jobId: job.id,
  });
});

worker.on('failed', (job, err) => {
  logger.error('Assessment job failed', {
    service: 'assessment-worker',
    jobName: job?.name,
    jobId: job?.id,
    error: err.message,
  });
});

worker.on('error', (err) => {
  logger.error('Assessment worker error', {
    service: 'assessment-worker',
    error: err.message,
  });
});

export async function closeAssessmentWorker() {
  await worker.close();
}

export default worker;
