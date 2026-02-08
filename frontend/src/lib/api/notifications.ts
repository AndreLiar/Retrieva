import apiClient from './client';
import type { ApiResponse, Notification } from '@/types';

export const notificationsApi = {
  /**
   * Get all notifications for the current user
   */
  list: async (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const response = await apiClient.get<ApiResponse<{ notifications: Notification[] }>>(
      '/notifications',
      { params }
    );
    return response.data;
  },

  /**
   * Get unread notification count
   */
  getUnreadCount: async () => {
    const response = await apiClient.get<ApiResponse<{ unreadCount: number }>>(
      '/notifications/count'
    );
    return response.data;
  },

  /**
   * Mark a notification as read
   */
  markAsRead: async (id: string) => {
    const response = await apiClient.patch<ApiResponse<{ notification: Notification }>>(
      `/notifications/${id}/read`
    );
    return response.data;
  },

  /**
   * Mark all notifications as read
   */
  markAllAsRead: async () => {
    const response = await apiClient.post<ApiResponse>('/notifications/read', {
      all: true,
    });
    return response.data;
  },

  /**
   * Delete a notification
   */
  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse>(`/notifications/${id}`);
    return response.data;
  },
};
