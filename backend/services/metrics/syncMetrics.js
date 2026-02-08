/**
 * Phase 4: Sync Metrics Service
 *
 * Tracks detailed metrics for document synchronization:
 * - Throughput (docs/min, chunks/sec)
 * - Latency percentiles per stage
 * - Reliability (success rate, errors by type, retries)
 * - Cost tracking for cloud embeddings
 */

import logger from '../../config/logger.js';

// =============================================================================
// METRICS STORAGE
// =============================================================================

// Per-workspace metrics (cleared on sync completion)
const workspaceMetrics = new Map();

// Global aggregated metrics
const globalMetrics = {
  totalSyncs: 0,
  totalDocuments: 0,
  totalChunks: 0,
  totalErrors: 0,
  totalRetries: 0,
};

/**
 * Initialize metrics for a workspace sync
 */
export function initSyncMetrics(workspaceId, jobId) {
  const metrics = {
    workspaceId,
    jobId,
    startTime: Date.now(),
    lastUpdateTime: Date.now(),

    // Document counts
    totalDocuments: 0,
    processedDocuments: 0,
    successCount: 0,
    skippedCount: 0,
    errorCount: 0,

    // Chunk counts
    totalChunks: 0,
    chunksProcessed: 0,

    // Throughput tracking
    documentsTimestamps: [], // For calculating rate
    chunksTimestamps: [],

    // Latency samples per stage (for percentile calculation)
    latencySamples: {
      fetch: [],
      chunk: [],
      piiScan: [],
      embed: [],
      index: [],
      enrich: [],
    },

    // Error tracking
    errorsByType: {},
    retriesCount: 0,

    // Cost tracking (cloud embeddings)
    tokensEmbedded: 0,
    estimatedCost: 0,

    // Provider usage
    localEmbeddings: 0,
    cloudEmbeddings: 0,

    // Current document being processed
    currentDocument: null,
    currentStage: null,

    // Mode detection (always cloud with Azure OpenAI)
    isCloudMode: true,
  };

  workspaceMetrics.set(workspaceId, metrics);
  return metrics;
}

/**
 * Get or create metrics for a workspace
 */
export function getSyncMetrics(workspaceId) {
  return workspaceMetrics.get(workspaceId) || null;
}

/**
 * Update total documents count
 */
export function setTotalDocuments(workspaceId, total) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (metrics) {
    metrics.totalDocuments = total;
    metrics.lastUpdateTime = Date.now();
  }
}

/**
 * Record document processing
 */
export function recordDocumentProcessed(workspaceId, options = {}) {
  const {
    success = true,
    skipped = false,
    documentTitle = null,
    chunksCreated = 0,
    error = null,
  } = options;

  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics) return;

  metrics.processedDocuments++;
  metrics.lastUpdateTime = Date.now();

  if (success && !skipped) {
    metrics.successCount++;
    metrics.totalChunks += chunksCreated;

    // Track timestamps for rate calculation (keep last 100)
    metrics.documentsTimestamps.push(Date.now());
    if (metrics.documentsTimestamps.length > 100) {
      metrics.documentsTimestamps.shift();
    }
  } else if (skipped) {
    metrics.skippedCount++;
  } else {
    metrics.errorCount++;
    if (error) {
      const errorType = error.code || error.name || 'UnknownError';
      metrics.errorsByType[errorType] = (metrics.errorsByType[errorType] || 0) + 1;
    }
  }

  if (documentTitle) {
    metrics.currentDocument = documentTitle;
  }
}

/**
 * Record stage latency
 */
export function recordStageLatency(workspaceId, stage, latencyMs) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics || !metrics.latencySamples[stage]) return;

  // Keep last 1000 samples for percentile calculation
  metrics.latencySamples[stage].push(latencyMs);
  if (metrics.latencySamples[stage].length > 1000) {
    metrics.latencySamples[stage].shift();
  }

  metrics.currentStage = stage;
  metrics.lastUpdateTime = Date.now();
}

/**
 * Record chunk processing
 */
export function recordChunksProcessed(workspaceId, chunkCount) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics) return;

  metrics.chunksProcessed += chunkCount;

  // Track timestamps for rate calculation
  for (let i = 0; i < chunkCount; i++) {
    metrics.chunksTimestamps.push(Date.now());
  }
  // Keep last 500
  if (metrics.chunksTimestamps.length > 500) {
    metrics.chunksTimestamps = metrics.chunksTimestamps.slice(-500);
  }

  metrics.lastUpdateTime = Date.now();
}

/**
 * Record embedding provider usage
 */
export function recordEmbeddingUsage(workspaceId, options = {}) {
  const { provider = 'local', chunkCount = 0, tokensUsed = 0, cost = 0 } = options;

  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics) return;

  if (provider === 'cloud') {
    metrics.cloudEmbeddings += chunkCount;
    metrics.tokensEmbedded += tokensUsed;
    metrics.estimatedCost += cost;
    metrics.isCloudMode = true;
  } else {
    metrics.localEmbeddings += chunkCount;
  }

  metrics.lastUpdateTime = Date.now();
}

/**
 * Record a retry attempt
 */
export function recordRetry(workspaceId) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (metrics) {
    metrics.retriesCount++;
    metrics.lastUpdateTime = Date.now();
  }
}

/**
 * Calculate percentile from sorted samples
 */
function calculatePercentile(samples, percentile) {
  if (samples.length === 0) return 0;

  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate rate from timestamps
 */
function calculateRate(timestamps, windowMs = 60000) {
  if (timestamps.length < 2) return 0;

  const now = Date.now();
  const recentTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (recentTimestamps.length < 2) return 0;

  const timeSpan = now - recentTimestamps[0];
  if (timeSpan === 0) return 0;

  return (recentTimestamps.length / timeSpan) * 60000; // per minute
}

/**
 * Get comprehensive sync metrics for display
 */
export function getDetailedSyncMetrics(workspaceId) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics) return null;

  const elapsedMs = Date.now() - metrics.startTime;
  const elapsedMinutes = elapsedMs / 60000;

  // Calculate throughput - use sliding window rate if available, otherwise overall average
  let docsPerMinute = calculateRate(metrics.documentsTimestamps, 300000); // 5 min window
  if (docsPerMinute === 0 && elapsedMinutes > 0 && metrics.successCount > 0) {
    // Fall back to overall average rate
    docsPerMinute = metrics.successCount / elapsedMinutes;
  }
  const chunksPerSecond = calculateRate(metrics.chunksTimestamps, 60000) / 60;

  // Calculate ETA
  const remainingDocs = metrics.totalDocuments - metrics.processedDocuments;
  const etaMinutes = docsPerMinute > 0 ? remainingDocs / docsPerMinute : null;

  // Calculate latency percentiles
  const latencyP50 = {};
  const latencyP95 = {};
  for (const [stage, samples] of Object.entries(metrics.latencySamples)) {
    latencyP50[stage] = calculatePercentile(samples, 50);
    latencyP95[stage] = calculatePercentile(samples, 95);
  }

  // Calculate success rate
  const totalAttempted = metrics.successCount + metrics.errorCount;
  const successRate = totalAttempted > 0 ? (metrics.successCount / totalAttempted) * 100 : 100;

  // Always cloud mode with Azure OpenAI
  const syncMode = 'cloud';
  const modeLabel = 'Azure OpenAI embeddings';

  return {
    // Basic progress
    workspaceId: metrics.workspaceId,
    jobId: metrics.jobId,
    startTime: metrics.startTime,
    elapsedMs,
    elapsedMinutes: Math.round(elapsedMinutes * 10) / 10,

    // Document progress
    totalDocuments: metrics.totalDocuments,
    processedDocuments: metrics.processedDocuments,
    successCount: metrics.successCount,
    skippedCount: metrics.skippedCount,
    errorCount: metrics.errorCount,
    progressPercent: metrics.totalDocuments > 0
      ? Math.round((metrics.processedDocuments / metrics.totalDocuments) * 100)
      : 0,

    // Chunk progress
    totalChunks: metrics.totalChunks,
    chunksProcessed: metrics.chunksProcessed,

    // Throughput
    docsPerMinute: Math.round(docsPerMinute * 10) / 10,
    chunksPerSecond: Math.round(chunksPerSecond * 10) / 10,

    // ETA
    etaMinutes: etaMinutes ? Math.round(etaMinutes) : null,
    etaFormatted: etaMinutes ? formatEta(etaMinutes) : 'Calculating...',

    // Latency
    latencyP50,
    latencyP95,

    // Reliability
    successRate: Math.round(successRate * 10) / 10,
    errorsByType: metrics.errorsByType,
    retriesCount: metrics.retriesCount,

    // Cost (cloud only)
    tokensEmbedded: metrics.tokensEmbedded,
    estimatedCost: Math.round(metrics.estimatedCost * 10000) / 10000,

    // Provider usage
    localEmbeddings: metrics.localEmbeddings,
    cloudEmbeddings: metrics.cloudEmbeddings,

    // Current state
    currentDocument: metrics.currentDocument,
    currentStage: metrics.currentStage,

    // Mode (always Azure OpenAI)
    syncMode,
    modeLabel,
    isCloudMode: true,
  };
}

/**
 * Format ETA for display
 */
function formatEta(minutes) {
  if (minutes < 1) return 'Less than a minute';
  if (minutes < 60) return `~${Math.round(minutes)} minutes`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);

  if (remainingMinutes === 0) return `~${hours} hour${hours > 1 ? 's' : ''}`;
  return `~${hours}h ${remainingMinutes}m`;
}

/**
 * Complete sync and return final metrics
 */
export function completeSyncMetrics(workspaceId) {
  const metrics = workspaceMetrics.get(workspaceId);
  if (!metrics) return null;

  const finalMetrics = getDetailedSyncMetrics(workspaceId);

  // Update global metrics
  globalMetrics.totalSyncs++;
  globalMetrics.totalDocuments += metrics.processedDocuments;
  globalMetrics.totalChunks += metrics.chunksProcessed;
  globalMetrics.totalErrors += metrics.errorCount;
  globalMetrics.totalRetries += metrics.retriesCount;

  // Log final metrics
  logger.info('Sync completed with metrics', {
    service: 'sync-metrics',
    workspaceId,
    jobId: metrics.jobId,
    ...finalMetrics,
  });

  // Clean up
  workspaceMetrics.delete(workspaceId);

  return finalMetrics;
}

/**
 * Get global aggregated metrics
 */
export function getGlobalMetrics() {
  return { ...globalMetrics };
}

/**
 * Clear metrics for a workspace (on error/cancel)
 */
export function clearSyncMetrics(workspaceId) {
  workspaceMetrics.delete(workspaceId);
}

export default {
  initSyncMetrics,
  getSyncMetrics,
  setTotalDocuments,
  recordDocumentProcessed,
  recordStageLatency,
  recordChunksProcessed,
  recordEmbeddingUsage,
  recordRetry,
  getDetailedSyncMetrics,
  completeSyncMetrics,
  getGlobalMetrics,
  clearSyncMetrics,
};
