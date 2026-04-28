import apiClient from '@/shared/api/client';
import type { ApiResponse } from '@/types';

export const billingApi = {
  createPortalSession: async () => {
    const response = await apiClient.post<ApiResponse<{ url: string }>>('/billing/portal');
    return response.data;
  },
};
