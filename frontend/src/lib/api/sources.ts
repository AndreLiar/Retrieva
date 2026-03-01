import apiClient from './client';
import type { ApiResponse } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────

export type DataSourceStatus = 'pending' | 'syncing' | 'active' | 'error';
export type DataSourceType = 'file' | 'url' | 'confluence';

export interface DataSourceStats {
  totalDocuments: number;
  documentsIndexed: number;
  documentsSkipped: number;
  documentsErrored: number;
}

export interface DataSourceConfig {
  // file
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  // url
  url?: string;
  // confluence
  baseUrl?: string;
  spaceKey?: string;
  email?: string;
}

export interface DataSource {
  _id: string;
  workspaceId: string;
  name: string;
  sourceType: DataSourceType;
  status: DataSourceStatus;
  config: DataSourceConfig;
  lastSyncedAt?: string;
  lastSyncJobId?: string;
  stats: DataSourceStats;
  errorLog?: Array<{ timestamp: string; error: string }>;
  storageKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFileDataSourceDto {
  name: string;
  workspaceId: string;
  sourceType: 'file';
  file: File;
}

export interface CreateUrlDataSourceDto {
  name: string;
  workspaceId: string;
  sourceType: 'url';
  config: { url: string };
}

export interface CreateConfluenceDataSourceDto {
  name: string;
  workspaceId: string;
  sourceType: 'confluence';
  config: {
    baseUrl: string;
    spaceKey: string;
    email: string;
    apiToken: string;
  };
}

export type CreateDataSourceDto =
  | CreateFileDataSourceDto
  | CreateUrlDataSourceDto
  | CreateConfluenceDataSourceDto;

// ── API ────────────────────────────────────────────────────────────────────

export const sourcesApi = {
  /**
   * List data sources for a workspace.
   */
  list: async (workspaceId: string): Promise<DataSource[]> => {
    const response = await apiClient.get<ApiResponse<{ dataSources: DataSource[] }>>(
      '/data-sources',
      { params: { workspaceId } }
    );
    return response.data.data?.dataSources ?? [];
  },

  /**
   * Create a new data source.
   * File sources must be sent as multipart/form-data.
   * URL and Confluence sources are sent as JSON.
   */
  create: async (dto: CreateDataSourceDto): Promise<DataSource> => {
    if (dto.sourceType === 'file') {
      const form = new FormData();
      form.append('name', dto.name);
      form.append('workspaceId', dto.workspaceId);
      form.append('sourceType', 'file');
      form.append('file', dto.file);

      const response = await apiClient.post<ApiResponse<{ dataSource: DataSource }>>(
        '/data-sources',
        form,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120_000,
        }
      );
      return response.data.data!.dataSource;
    }

    if (dto.sourceType === 'url') {
      const response = await apiClient.post<ApiResponse<{ dataSource: DataSource }>>(
        '/data-sources',
        {
          name: dto.name,
          workspaceId: dto.workspaceId,
          sourceType: 'url',
          config: dto.config,
        }
      );
      return response.data.data!.dataSource;
    }

    // confluence
    const response = await apiClient.post<ApiResponse<{ dataSource: DataSource }>>(
      '/data-sources',
      {
        name: dto.name,
        workspaceId: dto.workspaceId,
        sourceType: 'confluence',
        config: dto.config,
      }
    );
    return response.data.data!.dataSource;
  },

  /**
   * Trigger a manual sync for a data source.
   */
  triggerSync: async (id: string): Promise<{ jobId: string }> => {
    const response = await apiClient.post<ApiResponse<{ jobId: string }>>(
      `/data-sources/${id}/sync`
    );
    return response.data.data ?? { jobId: '' };
  },

  /**
   * Delete a data source.
   */
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/data-sources/${id}`);
  },

  /**
   * Download the original uploaded file from DigitalOcean Spaces.
   */
  downloadFile: async (id: string, fileName: string): Promise<void> => {
    const response = await apiClient.get(`/data-sources/${id}/download`, {
      responseType: 'blob',
      timeout: 60_000,
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
