import apiClient from './client';
import type {
  ApiResponse,
  PaginatedResponse,
  Conversation,
  Message,
} from '@/types';

export interface CreateConversationData {
  title?: string;
  workspaceId: string;
}

export interface AskQuestionData {
  question: string;
}

export interface UpdateConversationData {
  title?: string;
  isPinned?: boolean;
}

export interface MessageFeedbackData {
  feedback: 'positive' | 'negative' | null;
}

export const conversationsApi = {
  /**
   * Get all conversations for the current workspace
   * Backend returns { status, data: { conversations: [...], pagination: {...} } }
   */
  list: async (params?: {
    page?: number;
    limit?: number;
    pinned?: boolean;
  }) => {
    const response = await apiClient.get<
      ApiResponse<{
        conversations: Conversation[];
        pagination: { total: number; limit: number; skip: number; hasMore: boolean };
      }>
    >('/conversations', { params });
    return response.data;
  },

  /**
   * Get a single conversation with messages
   * Backend returns conversation and messages as siblings, not nested
   */
  get: async (id: string) => {
    const response = await apiClient.get<
      ApiResponse<{
        conversation: Conversation;
        messages: Array<{ id: string; role: string; content: string; sources?: Array<{ id: string; title: string; content: string; url?: string; pageId?: string; score?: number }>; timestamp?: string; createdAt?: string }>;
        pagination?: { total: number; limit: number; skip: number; hasMore: boolean };
      }>
    >(`/conversations/${id}`);
    return response.data;
  },

  /**
   * Create a new conversation
   */
  create: async (data: CreateConversationData) => {
    const response = await apiClient.post<
      ApiResponse<{ conversation: Conversation }>
    >('/conversations', data);
    return response.data;
  },

  /**
   * Update a conversation
   */
  update: async (id: string, data: UpdateConversationData) => {
    const response = await apiClient.patch<
      ApiResponse<{ conversation: Conversation }>
    >(`/conversations/${id}`, data);
    return response.data;
  },

  /**
   * Delete a conversation
   */
  delete: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<{ deletedId: string }>>(`/conversations/${id}`);
    return response.data;
  },

  /**
   * Bulk delete multiple conversations
   */
  bulkDelete: async (ids: string[]) => {
    const response = await apiClient.post<ApiResponse<{
      deletedCount: number;
      deletedIds: string[];
      invalidCount: number;
    }>>('/conversations/bulk-delete', { ids });
    return response.data;
  },

  /**
   * Ask a question in a conversation
   * Note: For streaming responses, use the streaming hook instead
   */
  ask: async (id: string, data: AskQuestionData) => {
    const response = await apiClient.post<
      ApiResponse<{ message: Message; answer: Message }>
    >(`/conversations/${id}/ask`, data);
    return response.data;
  },

  /**
   * Pin/unpin a conversation
   */
  togglePin: async (id: string, isPinned: boolean) => {
    const response = await apiClient.patch<
      ApiResponse<{ conversation: Conversation }>
    >(`/conversations/${id}`, { isPinned });
    return response.data;
  },

  /**
   * Submit feedback for a message
   */
  submitFeedback: async (
    conversationId: string,
    messageId: string,
    data: MessageFeedbackData
  ) => {
    const response = await apiClient.post<ApiResponse<{ message: Message }>>(
      `/conversations/${conversationId}/messages/${messageId}/feedback`,
      data
    );
    return response.data;
  },

  /**
   * Get messages for a conversation (paginated)
   */
  getMessages: async (
    id: string,
    params?: { page?: number; limit?: number }
  ) => {
    const response = await apiClient.get<PaginatedResponse<Message>>(
      `/conversations/${id}/messages`,
      { params }
    );
    return response.data;
  },
};
