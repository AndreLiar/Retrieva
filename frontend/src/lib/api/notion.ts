import apiClient from './client';
import type {
  ApiResponse,
  NotionWorkspace,
  SyncJob,
} from '@/types';

export const notionApi = {
  /**
   * Get OAuth authorization URL
   */
  getAuthUrl: async (redirectUrl?: string) => {
    const response = await apiClient.get<ApiResponse<{ authUrl: string; state: string }>>(
      '/notion/auth',
      { params: redirectUrl ? { redirectUrl } : undefined }
    );
    return response.data;
  },

  /**
   * Handle OAuth callback (exchange code for token)
   */
  handleCallback: async (code: string, state: string) => {
    const response = await apiClient.post<
      ApiResponse<{ notionWorkspace: NotionWorkspace }>
    >('/notion/auth/callback', { code, state });
    return response.data;
  },

  /**
   * Get all connected Notion workspaces
   */
  listWorkspaces: async () => {
    const response = await apiClient.get<
      ApiResponse<{ workspaces: NotionWorkspace[] }>
    >('/notion/workspaces');
    return response.data;
  },

  /**
   * Get a single Notion workspace
   */
  getWorkspace: async (id: string) => {
    const response = await apiClient.get<
      ApiResponse<{ workspace: NotionWorkspace }>
    >(`/notion/workspaces/${id}`);
    return response.data;
  },

  /**
   * Disconnect a Notion workspace
   */
  disconnectWorkspace: async (id: string) => {
    const response = await apiClient.delete<ApiResponse>(
      `/notion/workspaces/${id}`
    );
    return response.data;
  },

  /**
   * Trigger a manual sync for a Notion workspace
   */
  triggerSync: async (id: string, options?: { fullSync?: boolean }) => {
    const response = await apiClient.post<ApiResponse<{ job: SyncJob }>>(
      `/notion/workspaces/${id}/sync`,
      options
    );
    return response.data;
  },

  /**
   * Get sync status for a Notion workspace
   */
  getSyncStatus: async (id: string) => {
    const response = await apiClient.get<
      ApiResponse<{
        workspace: {
          workspaceId: string;
          syncStatus: NotionWorkspace['syncStatus'];
          lastSyncAt: string | null;
          lastSuccessfulSyncAt: string | null;
        };
        activeJobs: Array<{
          jobId: string;
          jobType: string;
          status: string;
          progress: {
            totalDocuments: number;
            processedDocuments: number;
            successCount: number;
            skippedCount: number;
            errorCount: number;
            currentDocument: string;
          };
          startedAt: string;
        }>;
        lastJob: {
          jobId: string;
          jobType: string;
          status: string;
          completedAt: string;
          duration: number;
          result: Record<string, unknown>;
        } | null;
        // Phase 4: Detailed sync metrics
        metrics: {
          workspaceId: string;
          jobId: string;
          startTime: number;
          elapsedMs: number;
          elapsedMinutes: number;
          totalDocuments: number;
          processedDocuments: number;
          successCount: number;
          skippedCount: number;
          errorCount: number;
          progressPercent: number;
          totalChunks: number;
          chunksProcessed: number;
          docsPerMinute: number;
          chunksPerSecond: number;
          etaMinutes: number | null;
          etaFormatted: string;
          latencyP50: Record<string, number>;
          latencyP95: Record<string, number>;
          successRate: number;
          errorsByType: Record<string, number>;
          retriesCount: number;
          tokensEmbedded: number;
          estimatedCost: number;
          localEmbeddings: number;
          cloudEmbeddings: number;
          currentDocument: string | null;
          currentStage: string | null;
          syncMode: 'cloud' | 'local';
          modeLabel: string;
          isCloudMode: boolean;
        } | null;
      }>
    >(`/notion/workspaces/${id}/sync-status`);
    return response.data;
  },

  /**
   * Get sync history for a Notion workspace
   */
  getSyncHistory: async (
    id: string,
    params?: { page?: number; limit?: number }
  ) => {
    const response = await apiClient.get<
      ApiResponse<{ syncJobs: SyncJob[]; workspaceId: string }>
    >(`/notion/workspaces/${id}/sync-history`, { params });
    return response.data;
  },

  /**
   * Get token health for all user workspaces (Admin only)
   */
  getTokenHealth: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        workspaces: Array<{
          workspaceId: string;
          workspaceName: string;
          tokenStatus: 'valid' | 'expired' | 'invalid' | 'revoked' | 'unknown';
          lastValidated: string | null;
          invalidatedAt: string | null;
          syncStatus: string;
          needsReconnect: boolean;
        }>;
        hasIssues: boolean;
      }>
    >('/notion/token-health');
    return response.data;
  },

  /**
   * Check token for a specific workspace (Admin only)
   */
  checkWorkspaceToken: async (id: string) => {
    const response = await apiClient.post<
      ApiResponse<{
        workspaceId: string;
        workspaceName: string;
        status: 'valid' | 'expired' | 'invalid' | 'revoked' | 'unknown';
        lastValidated: string | null;
        isValid: boolean;
      }>
    >(`/notion/workspaces/${id}/check-token`);
    return response.data;
  },

  /**
   * Update token handling preference (Admin only)
   */
  updateTokenPreference: async (preference: 'notify' | 'auto_reconnect') => {
    const response = await apiClient.patch<
      ApiResponse<{ preference: string }>
    >('/notion/token-preference', { preference });
    return response.data;
  },
};
