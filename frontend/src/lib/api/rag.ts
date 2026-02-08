import apiClient from './client';
import type { ApiResponse, RAGResponse, Source } from '@/types';

export interface RAGQueryData {
  question: string;
  conversationId?: string;
  workspaceId?: string;
}

export const ragApi = {
  /**
   * Ask a question (non-streaming)
   * For streaming responses, use the useStreaming hook instead
   */
  ask: async (data: RAGQueryData) => {
    const response = await apiClient.post<ApiResponse<RAGResponse>>('/rag', data);
    return response.data;
  },

  /**
   * Get the streaming endpoint URL for SSE
   */
  getStreamUrl: () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';
    return `${baseUrl}/rag/stream`;
  },

  /**
   * Search sources without asking a question
   */
  searchSources: async (query: string, limit = 5) => {
    const response = await apiClient.get<ApiResponse<{ sources: Source[] }>>(
      '/rag/search',
      { params: { query, limit } }
    );
    return response.data;
  },
};

/**
 * Create an EventSource for streaming RAG responses
 * Note: EventSource doesn't support POST, so we use fetch with ReadableStream
 */
export async function* streamRAGResponse(
  data: RAGQueryData,
  signal?: AbortSignal
): AsyncGenerator<{ type: string; data: string }> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';
  const workspaceId = typeof window !== 'undefined'
    ? localStorage.getItem('activeWorkspaceId')
    : null;

  const response = await fetch(`${baseUrl}/rag/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Stream failed' }));
    throw new Error(error.message || 'Failed to start stream');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7);
          const dataLineIndex = lines.indexOf(line) + 1;
          if (dataLineIndex < lines.length && lines[dataLineIndex].startsWith('data: ')) {
            const eventData = lines[dataLineIndex].slice(6);
            yield { type: eventType, data: eventData };
          }
        } else if (line.startsWith('data: ')) {
          // Default event type
          yield { type: 'message', data: line.slice(6) };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
