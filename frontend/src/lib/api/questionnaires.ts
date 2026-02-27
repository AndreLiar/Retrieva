import axios from 'axios';
import apiClient from './client';
import type { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuestionnaireStatus = 'draft' | 'sent' | 'partial' | 'complete' | 'expired' | 'failed';
export type GapLevel = 'covered' | 'partial' | 'missing';

export interface QuestionnaireQuestion {
  id: string;
  text: string;
  doraArticle: string;
  category: string;
  hint?: string;
  answer?: string;
  score?: number;
  gapLevel?: GapLevel;
  reasoning?: string;
}

export interface VendorQuestionnaire {
  _id: string;
  workspaceId: string;
  vendorName: string;
  vendorEmail: string;
  vendorContactName?: string;
  token?: string;
  tokenExpiresAt?: string;
  status: QuestionnaireStatus;
  statusMessage?: string;
  sentAt?: string;
  respondedAt?: string;
  questions: QuestionnaireQuestion[];
  overallScore?: number;
  results?: {
    summary: string;
    domainsAnalyzed: string[];
    generatedAt: string;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireListResponse {
  questionnaires: VendorQuestionnaire[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CreateQuestionnaireDto {
  vendorName: string;
  vendorEmail: string;
  vendorContactName?: string;
  workspaceId: string;
}

// ---------------------------------------------------------------------------
// Public client (no auth interceptor, no withCredentials)
// Used for the vendor-facing /q/:token form to avoid token-refresh loops.
// ---------------------------------------------------------------------------

const publicApiBaseURL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : '') + '/api/v1';

const publicClient = axios.create({
  baseURL: publicApiBaseURL,
  withCredentials: false,
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// API module
// ---------------------------------------------------------------------------

export const questionnairesApi = {
  /**
   * Create a new vendor questionnaire from the default DORA template.
   */
  create: async (data: CreateQuestionnaireDto) => {
    const response = await apiClient.post<ApiResponse<{ questionnaire: VendorQuestionnaire }>>(
      '/questionnaires',
      data
    );
    return response.data;
  },

  /**
   * List questionnaires with optional filters.
   */
  list: async (params?: {
    workspaceId?: string;
    status?: QuestionnaireStatus;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiResponse<QuestionnaireListResponse>>(
      '/questionnaires',
      { params }
    );
    return response.data;
  },

  /**
   * Get a single questionnaire with full results.
   */
  get: async (id: string) => {
    const response = await apiClient.get<ApiResponse<{ questionnaire: VendorQuestionnaire }>>(
      `/questionnaires/${id}`
    );
    return response.data;
  },

  /**
   * Send the questionnaire invitation email to the vendor.
   * Generates a secure token and sets status to 'sent'.
   */
  send: async (id: string) => {
    const response = await apiClient.post<ApiResponse<{ questionnaire: VendorQuestionnaire }>>(
      `/questionnaires/${id}/send`
    );
    return response.data;
  },

  /**
   * Delete a questionnaire (creator only).
   */
  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/questionnaires/${id}`);
    return response.data;
  },

  // ── Public methods (no auth) ────────────────────────────────────────────

  /**
   * Load the public vendor form by token.
   * Uses a plain axios instance with no auth interceptors.
   */
  getPublicForm: async (token: string) => {
    const response = await publicClient.get<
      ApiResponse<{
        vendorName: string;
        status: QuestionnaireStatus;
        questions: QuestionnaireQuestion[];
        alreadyComplete?: boolean;
        expired?: boolean;
        message?: string;
      }>
    >(`/questionnaires/respond/${token}`);
    return response.data;
  },

  /**
   * Submit partial or final vendor response by token.
   * Uses a plain axios instance with no auth interceptors.
   */
  submitResponse: async (
    token: string,
    body: { answers: { id: string; answer: string }[]; final: boolean }
  ) => {
    const response = await publicClient.post<
      ApiResponse<{ saved: boolean; final: boolean; alreadyComplete?: boolean }>
    >(`/questionnaires/respond/${token}`, body);
    return response.data;
  },
};
