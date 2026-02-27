/**
 * Questionnaire Worker
 *
 * BullMQ worker that processes LLM scoring jobs for vendor questionnaires.
 *  - scoreQuestionnaire: score all answered questions + generate executive summary
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { VendorQuestionnaire } from '../models/VendorQuestionnaire.js';
import { runScoring } from '../services/questionnaireScorer.js';
import logger from '../config/logger.js';
import { connectDB } from '../config/database.js';

connectDB().catch((err) =>
  logger.error('Questionnaire worker: DB connection failed', { error: err.message })
);

const CONCURRENCY = parseInt(process.env.QUESTIONNAIRE_WORKER_CONCURRENCY) || 2;

async function processScoreQuestionnaire(job) {
  const { questionnaireId } = job.data;

  logger.info('Questionnaire scoring job started', {
    service: 'questionnaire-worker',
    questionnaireId,
    jobId: job.id,
  });

  await job.updateProgress(5);
  await runScoring(questionnaireId, job);
  await job.updateProgress(100);

  logger.info('Questionnaire scoring job completed', {
    service: 'questionnaire-worker',
    questionnaireId,
    jobId: job.id,
  });

  return { questionnaireId, scored: true };
}

const worker = new Worker(
  'questionnaireJobs',
  async (job) => {
    switch (job.name) {
      case 'scoreQuestionnaire':
        return processScoreQuestionnaire(job);
      default:
        logger.warn('Unknown questionnaire job type', { jobName: job.name, jobId: job.id });
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
  logger.info('Questionnaire job completed', {
    service: 'questionnaire-worker',
    jobName: job.name,
    jobId: job.id,
  });
});

worker.on('failed', async (job, err) => {
  logger.error('Questionnaire job failed', {
    service: 'questionnaire-worker',
    jobName: job?.name,
    jobId: job?.id,
    error: err.message,
  });

  if (job?.data?.questionnaireId) {
    try {
      await VendorQuestionnaire.findByIdAndUpdate(job.data.questionnaireId, {
        status: 'failed',
        statusMessage: err.message,
      });
    } catch (updateErr) {
      logger.error('Failed to update questionnaire status on job failure', {
        service: 'questionnaire-worker',
        questionnaireId: job.data.questionnaireId,
        error: updateErr.message,
      });
    }
  }
});

worker.on('error', (err) => {
  logger.error('Questionnaire worker error', {
    service: 'questionnaire-worker',
    error: err.message,
  });
});

export async function closeQuestionnaireWorker() {
  await worker.close();
}

export default worker;
