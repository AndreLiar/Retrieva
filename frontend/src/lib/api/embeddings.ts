import apiClient from './client';
import type { ApiResponse } from '@/types';

// Types for embedding settings
export interface EmbeddingSettings {
  preferCloud: boolean;
  cloudConsent: boolean;
  cloudConsentDate?: string;
  fallbackToCloud: boolean;
  lastPiiScan?: string;
  piiDetected?: boolean;
  detectedPatterns?: string[];
  autoUpgraded?: boolean;
  autoUpgradedAt?: string;
  autoUpgradedFrom?: string;
}

export interface DataClassification {
  declaredType: 'personal_notes' | 'team_docs' | 'company_confidential' | 'regulated_data' | 'not_set';
  declaredAt?: string;
  declaredBy?: string;
  description?: string;
}

export interface WorkspaceEmbeddingStatus {
  trustLevel: 'public' | 'internal' | 'regulated';
  embeddingSettings: EmbeddingSettings;
  cloudAvailable: boolean;
  canUseCloud: boolean;
}

export interface ClassificationOption {
  label: string;
  description: string;
  recommendedTrustLevel: string;
  canUseCloud: boolean;
}

export interface ConsentDisclosure {
  title: string;
  description: string;
  dataProcessed: string[];
  benefits: string[];
  optOut: string;
  provider: string;
  model: string;
}

export interface PiiStatus {
  lastScan: string | null;
  piiDetected: boolean;
  detectedPatterns: string[];
  autoUpgraded: boolean;
  autoUpgradedAt: string | null;
  autoUpgradedFrom: string | null;
  currentTrustLevel: string;
  dataClassification: DataClassification;
}

export interface ProviderMetrics {
  local: {
    totalCalls: number;
    totalChunks: number;
    totalTimeMs: number;
    errors: number;
    lastError: string | null;
  };
  cloud: {
    totalCalls: number;
    totalChunks: number;
    totalTimeMs: number;
    errors: number;
    lastError: string | null;
    estimatedCost: number;
  };
}

export const embeddingsApi = {
  /**
   * Get embedding settings for a workspace
   */
  getSettings: async (workspaceId: string) => {
    const response = await apiClient.get<ApiResponse<WorkspaceEmbeddingStatus>>(
      `/embeddings/workspace/${workspaceId}`
    );
    return response.data;
  },

  /**
   * Update embedding settings for a workspace
   */
  updateSettings: async (
    workspaceId: string,
    settings: Partial<{
      trustLevel: string;
      preferCloud: boolean;
      cloudConsent: boolean;
      fallbackToCloud: boolean;
    }>
  ) => {
    const response = await apiClient.patch<ApiResponse<WorkspaceEmbeddingStatus>>(
      `/embeddings/workspace/${workspaceId}`,
      settings
    );
    return response.data;
  },

  /**
   * Get cloud consent disclosure (GDPR)
   */
  getDisclosure: async () => {
    const response = await apiClient.get<ApiResponse<ConsentDisclosure>>(
      '/embeddings/disclosure'
    );
    return response.data;
  },

  /**
   * Grant cloud embedding consent
   */
  grantConsent: async (workspaceId: string) => {
    const response = await apiClient.post<
      ApiResponse<{ consentDate: string; canUseCloud: boolean }>
    >(`/embeddings/workspace/${workspaceId}/consent`, { acknowledged: true });
    return response.data;
  },

  /**
   * Revoke cloud embedding consent
   */
  revokeConsent: async (workspaceId: string) => {
    const response = await apiClient.delete<ApiResponse<{ canUseCloud: boolean }>>(
      `/embeddings/workspace/${workspaceId}/consent`
    );
    return response.data;
  },

  /**
   * Get data classification options
   */
  getClassificationOptions: async () => {
    const response = await apiClient.get<
      ApiResponse<{ options: Record<string, ClassificationOption>; note: string }>
    >('/embeddings/classification-options');
    return response.data;
  },

  /**
   * Declare data classification for a workspace
   */
  declareClassification: async (
    workspaceId: string,
    classificationType: string,
    description?: string
  ) => {
    const response = await apiClient.post<
      ApiResponse<{
        dataClassification: DataClassification;
        trustLevel: string;
        canUseCloud: boolean;
        note: string;
      }>
    >(`/embeddings/workspace/${workspaceId}/classify`, {
      classificationType,
      description,
    });
    return response.data;
  },

  /**
   * Get PII detection status for a workspace
   */
  getPiiStatus: async (workspaceId: string) => {
    const response = await apiClient.get<ApiResponse<PiiStatus>>(
      `/embeddings/workspace/${workspaceId}/pii-status`
    );
    return response.data;
  },

  /**
   * Get embedding provider metrics
   */
  getMetrics: async () => {
    const response = await apiClient.get<ApiResponse<ProviderMetrics>>(
      '/embeddings/metrics'
    );
    return response.data;
  },

  /**
   * Get audit log for a workspace
   */
  getAuditLog: async (workspaceId: string, limit: number = 50) => {
    const response = await apiClient.get<
      ApiResponse<{ logs: Array<Record<string, unknown>> }>
    >(`/embeddings/workspace/${workspaceId}/audit`, { params: { limit } });
    return response.data;
  },
};
