/**
 * Monitoring Worker
 *
 * BullMQ worker that processes scheduled compliance monitoring alert jobs.
 * Runs every 24 hours (configurable via MONITORING_INTERVAL_HOURS).
 */

import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { runMonitoringAlerts } from '../services/alertMonitorService.js';
import logger from '../config/logger.js';

const worker = new Worker(
  'monitoringJobs',
  async (job) => {
    if (job.name === 'run-monitoring-alerts') {
      logger.info('Running monitoring alerts', { service: 'monitoringWorker', jobId: job.id });
      await runMonitoringAlerts();
      return { ran: true, timestamp: new Date().toISOString() };
    }
    logger.warn('Unknown monitoring job type', { jobName: job.name, jobId: job.id });
  },
  {
    connection: redisConnection,
    concurrency: 1,
    lockDuration: 5 * 60 * 1000, // 5 minutes
    lockRenewTime: 2 * 60 * 1000, // Renew every 2 minutes
  }
);

worker.on('completed', (job) => {
  logger.info('Monitoring job completed', {
    service: 'monitoringWorker',
    jobId: job.id,
  });
});

worker.on('failed', (job, err) => {
  logger.error('Monitoring job failed', {
    service: 'monitoringWorker',
    jobId: job?.id,
    error: err.message,
  });
});

worker.on('error', (err) => {
  logger.error('Monitoring worker error', {
    service: 'monitoringWorker',
    error: err.message,
  });
});

export async function closeMonitoringWorker() {
  await worker.close();
}

export default worker;
