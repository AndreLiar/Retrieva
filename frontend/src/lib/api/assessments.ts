import apiClient from './client';
import type { ApiResponse } from '@/types';

export type GapLevel = 'covered' | 'partial' | 'missing';
export type OverallRisk = 'High' | 'Medium' | 'Low';
export type AssessmentStatus = 'pending' | 'indexing' | 'analyzing' | 'complete' | 'failed';

export interface Gap {
  article: string;
  domain: string;
  requirement: string;
  vendorCoverage: string;
  gapLevel: GapLevel;
  recommendation: string;
  sourceChunks: string[];
}

export interface AssessmentDocument {
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'uploading' | 'indexed' | 'failed';
}

export interface Assessment {
  _id: string;
  workspaceId: string;
  name: string;
  vendorName: string;
  framework: 'DORA';
  status: AssessmentStatus;
  statusMessage: string;
  documents: AssessmentDocument[];
  results?: {
    gaps: Gap[];
    overallRisk: OverallRisk;
    summary: string;
    domainsAnalyzed: string[];
    generatedAt: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentListResponse {
  assessments: Assessment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const assessmentsApi = {
  /**
   * Create a new assessment (multipart/form-data upload)
   */
  create: async (formData: FormData) => {
    const response = await apiClient.post<ApiResponse<{ assessment: Assessment }>>(
      '/assessments',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000, // 2 min — large file uploads
      }
    );
    return response.data;
  },

  /**
   * List assessments with optional filters
   */
  list: async (params?: { workspaceId?: string; status?: AssessmentStatus; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiResponse<AssessmentListResponse>>('/assessments', {
      params,
    });
    return response.data;
  },

  /**
   * Get a single assessment with full results
   */
  get: async (id: string) => {
    const response = await apiClient.get<ApiResponse<{ assessment: Assessment }>>(
      `/assessments/${id}`
    );
    return response.data;
  },

  /**
   * Download the DORA compliance report as a .docx file
   */
  downloadReport: async (id: string, vendorName: string) => {
    const response = await apiClient.get(`/assessments/${id}/report`, {
      responseType: 'blob',
      timeout: 60_000,
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `DORA_Assessment_${vendorName.replace(/\s+/g, '_')}_${dateStr}.docx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * Delete an assessment
   */
  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse>(`/assessments/${id}`);
    return response.data;
  },
};
