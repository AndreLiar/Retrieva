import apiClient from './client';
import type {
  ApiResponse,
  AnalyticsSummary,
  UsageDataPoint,
  FeedbackDataPoint,
  PopularQuestion,
} from '@/types';

export interface AnalyticsParams {
  startDate?: string;
  endDate?: string;
  workspaceId?: string;
}

export const analyticsApi = {
  /**
   * Get analytics summary
   */
  getSummary: async (params?: AnalyticsParams) => {
    const response = await apiClient.get<ApiResponse<AnalyticsSummary>>(
      '/analytics/summary',
      { params }
    );
    return response.data;
  },

  /**
   * Get usage data over time
   */
  getUsageData: async (params?: AnalyticsParams & { interval?: 'day' | 'week' | 'month' }) => {
    const response = await apiClient.get<ApiResponse<{ data: UsageDataPoint[] }>>(
      '/analytics/usage',
      { params }
    );
    return response.data;
  },

  /**
   * Get feedback distribution (positive vs negative)
   */
  getFeedbackData: async (params?: AnalyticsParams) => {
    const response = await apiClient.get<ApiResponse<{ data: FeedbackDataPoint[] }>>(
      '/analytics/feedback-distribution',
      { params }
    );
    return response.data;
  },

  /**
   * Get popular questions
   */
  getPopularQuestions: async (params?: AnalyticsParams & { limit?: number }) => {
    const response = await apiClient.get<ApiResponse<{ questions: PopularQuestion[] }>>(
      '/analytics/popular-questions',
      { params }
    );
    return response.data;
  },

  /**
   * Get cache performance stats
   */
  getCacheStats: async () => {
    const response = await apiClient.get<
      ApiResponse<{
        performance: {
          totalRequests: number;
          cacheHits: number;
          cacheMisses: number;
          hitRate: string;
        };
        redisStatus: Record<string, unknown>;
      }>
    >('/analytics/cache-stats');
    return response.data;
  },
};
