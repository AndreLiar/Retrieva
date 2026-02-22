import apiClient from './client';
import type { ApiResponse } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export type MCPSourceType = 'confluence' | 'gdrive' | 'github' | 'jira' | 'slack' | 'custom';
export type MCPSyncStatus = 'pending' | 'syncing' | 'active' | 'error' | 'paused';

export interface MCPSyncSettings {
  autoSync: boolean;
  syncIntervalHours: number;
}

export interface MCPSourceStats {
  totalDocuments: number;
  documentsIndexed: number;
  documentsSkipped: number;
  documentsErrored: number;
  lastSyncDurationMs?: number;
}

export interface MCPSource {
  _id: string;
  workspaceId: string;
  name: string;
  sourceType: MCPSourceType;
  serverUrl: string;
  syncStatus: MCPSyncStatus;
  syncSettings: MCPSyncSettings;
  lastSyncedAt?: string;
  lastSyncJobId?: string;
  stats: MCPSourceStats;
  errorLog?: Array<{ timestamp: string; error: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterMCPSourceDto {
  workspaceId: string;
  name: string;
  sourceType: MCPSourceType;
  serverUrl: string;
  authToken?: string;
  syncSettings?: Partial<MCPSyncSettings>;
}

export interface TestConnectionResult {
  ok: boolean;
  sourceInfo?: {
    name: string;
    type: string;
    totalDocuments?: number;
    description?: string;
  };
  error?: string;
}

// ── API ────────────────────────────────────────────────────────────────────

export const mcpApi = {
  /**
   * List all MCP sources for a workspace.
   */
  list: async (workspaceId: string): Promise<MCPSource[]> => {
    const response = await apiClient.get<ApiResponse<{ sources: MCPSource[] }>>('/mcp-sources', {
      params: { workspaceId },
    });
    return response.data.data?.sources ?? [];
  },

  /**
   * Register a new MCP data source.
   */
  register: async (dto: RegisterMCPSourceDto): Promise<MCPSource> => {
    const response = await apiClient.post<ApiResponse<{ source: MCPSource }>>('/mcp-sources', dto);
    return response.data.data!.source;
  },

  /**
   * Trigger a manual sync (full or incremental).
   */
  triggerSync: async (id: string, syncType: 'full' | 'incremental' = 'full'): Promise<void> => {
    await apiClient.post(`/mcp-sources/${id}/sync`, { syncType });
  },

  /**
   * Delete an MCP source and soft-delete its indexed documents.
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/mcp-sources/${id}`);
  },

  /**
   * Test connectivity to an MCP server without persisting.
   */
  testConnection: async (
    serverUrl: string,
    authToken?: string,
    sourceType: MCPSourceType = 'custom'
  ): Promise<TestConnectionResult> => {
    const response = await apiClient.post<ApiResponse<TestConnectionResult>>(
      '/mcp-sources/test-connection',
      { serverUrl, authToken, sourceType },
      { timeout: 20_000 }
    );
    return response.data.data ?? { ok: false, error: 'No response from server' };
  },
};
