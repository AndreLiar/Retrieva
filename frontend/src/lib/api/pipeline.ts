import apiClient from './client';
import type { ApiResponse } from '@/types';

/**
 * Phase 3: Pipeline API Client
 *
 * Client for pipeline monitoring, metrics, and embedding migration endpoints.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface StageMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalTimeMs: number;
  avgTimeMs: number;
  lastError: string | null;
  lastProcessedAt: string | null;
  itemsProcessed: number;
}

export interface QueueStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total?: number;
}

export interface EmbeddingVersion {
  current: string;
  local: {
    model: string;
    dimensions: number;
  };
  cloud: {
    model: string;
    dimensions: number;
  };
}

export interface PipelineStatus {
  stages: Record<string, QueueStatus>;
  metrics: Record<string, StageMetrics>;
  embeddingVersion: EmbeddingVersion;
}

export interface PipelineHealth {
  healthy: boolean;
  workers: Record<string, { running: boolean; paused: boolean }>;
  queues: Record<string, QueueStatus>;
  metrics: Record<string, StageMetrics>;
  config: {
    concurrency: Record<string, number>;
    lockDuration: Record<string, number>;
  };
}

export interface MigrationStatus {
  inProgress: boolean;
  workspaceId: string | null;
  totalDocuments: number;
  processedDocuments: number;
  failedDocuments: number;
  startedAt: string | null;
  estimatedCompletionAt: string | null;
  lastError: string | null;
  fromVersion: string | null;
  toVersion: string;
}

export interface MigrationCheckResult {
  workspaceId: string;
  total: number;
  needsMigration: number;
  documents: Array<{
    sourceId: string;
    title: string;
    embeddingMetadata?: {
      version?: string;
      model?: string;
    };
    chunkCount: number;
  }>;
  currentVersion: string;
}

export interface MigrationStartResult {
  status: 'started' | 'no_migration_needed' | 'dry_run';
  documentsToMigrate?: number;
  batches?: number;
  migrationId?: string;
  message?: string;
  estimatedBatches?: number;
  currentVersion?: string;
}

// =============================================================================
// API METHODS
// =============================================================================

export interface PipelineStatusResponse {
  pipeline: PipelineStatus;
  stageOrder: string[];
  embeddingVersion: EmbeddingVersion;
}

export interface PipelineMetricsResponse {
  metrics: Record<string, StageMetrics>;
  aggregated: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgTimeMs: number;
    totalItemsProcessed: number;
    successRate: number;
  } | null;
  stages: string[];
}

export const pipelineApi = {
  /**
   * Get overall pipeline status
   */
  getStatus: async () => {
    const response = await apiClient.get<ApiResponse<PipelineStatusResponse>>(
      '/pipeline/status'
    );
    return response.data;
  },

  /**
   * Get pipeline health status
   */
  getHealth: async () => {
    const response = await apiClient.get<ApiResponse<PipelineHealth>>(
      '/pipeline/health'
    );
    return response.data;
  },

  /**
   * Get per-stage metrics
   */
  getMetrics: async (stage?: string) => {
    const params = stage ? { stage } : {};
    const response = await apiClient.get<ApiResponse<PipelineMetricsResponse>>(
      '/pipeline/metrics',
      { params }
    );
    return response.data;
  },

  /**
   * Reset metrics
   */
  resetMetrics: async (stage?: string) => {
    const params = stage ? { stage } : {};
    const response = await apiClient.delete<ApiResponse<{ message: string }>>(
      '/pipeline/metrics',
      { params }
    );
    return response.data;
  },

  /**
   * Retry failed jobs in a stage
   */
  retryFailedJobs: async (stage: string, limit = 100) => {
    const response = await apiClient.post<
      ApiResponse<{ stage: string; retriedCount: number; message: string }>
    >(`/pipeline/stages/${stage}/retry`, null, { params: { limit } });
    return response.data;
  },

  /**
   * Drain a stage queue
   */
  drainStageQueue: async (stage: string) => {
    const response = await apiClient.post<ApiResponse<{ stage: string; message: string }>>(
      `/pipeline/stages/${stage}/drain`
    );
    return response.data;
  },

  /**
   * Get migration status
   */
  getMigrationStatus: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        migration: MigrationStatus;
        currentVersion: string;
        embeddingConfig: EmbeddingVersion;
      }>
    >('/pipeline/migration/status');
    return response.data;
  },

  /**
   * Check which documents need migration
   */
  checkMigrationNeeded: async (workspaceId: string, limit = 1000) => {
    const response = await apiClient.get<ApiResponse<MigrationCheckResult>>(
      `/pipeline/migration/check/${workspaceId}`,
      { params: { limit } }
    );
    return response.data;
  },

  /**
   * Start embedding migration
   */
  startMigration: async (
    workspaceId: string,
    options: { batchSize?: number; priority?: 'high' | 'normal' | 'low'; dryRun?: boolean } = {}
  ) => {
    const response = await apiClient.post<ApiResponse<MigrationStartResult>>(
      `/pipeline/migration/start/${workspaceId}`,
      options
    );
    return response.data;
  },

  /**
   * Cancel ongoing migration
   */
  cancelMigration: async () => {
    const response = await apiClient.post<
      ApiResponse<{
        status: string;
        processedDocuments?: number;
        remainingDocuments?: number;
      }>
    >('/pipeline/migration/cancel');
    return response.data;
  },
};

export default pipelineApi;
