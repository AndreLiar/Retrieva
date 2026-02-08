'use client';

import { useState, useCallback, useRef } from 'react';
import type { Source } from '@/types';

/**
 * ISSUE #41 FIX: Streaming timeout configuration
 * - Initial connection timeout: 30 seconds (time to establish connection)
 * - Stream timeout: 120 seconds (max time for entire stream)
 * - Chunk timeout: 60 seconds (max time between chunks)
 */
const STREAM_CONNECT_TIMEOUT_MS = 30000; // 30 seconds to connect
const STREAM_TOTAL_TIMEOUT_MS = 120000; // 120 seconds max for entire stream
const STREAM_CHUNK_TIMEOUT_MS = 60000; // 60 seconds max between chunks

interface StreamingState {
  content: string;
  status: string;
  sources: Source[];
  isStreaming: boolean;
  error: string | null;
}

interface UseStreamingOptions {
  onComplete?: (content: string, sources: Source[]) => void;
  onError?: (error: string) => void;
  /** Override default connection timeout (ms) */
  connectTimeout?: number;
  /** Override default total stream timeout (ms) */
  totalTimeout?: number;
}

export function useStreaming(options: UseStreamingOptions = {}) {
  const [state, setState] = useState<StreamingState>({
    content: '',
    status: '',
    sources: [],
    isStreaming: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  // ISSUE #41 FIX: Track timeout handles for cleanup
  const timeoutRefs = useRef<{
    connect: ReturnType<typeof setTimeout> | null;
    total: ReturnType<typeof setTimeout> | null;
    chunk: ReturnType<typeof setTimeout> | null;
  }>({ connect: null, total: null, chunk: null });

  // Helper to clear all timeouts
  const clearTimeouts = useCallback(() => {
    if (timeoutRefs.current.connect) {
      clearTimeout(timeoutRefs.current.connect);
      timeoutRefs.current.connect = null;
    }
    if (timeoutRefs.current.total) {
      clearTimeout(timeoutRefs.current.total);
      timeoutRefs.current.total = null;
    }
    if (timeoutRefs.current.chunk) {
      clearTimeout(timeoutRefs.current.chunk);
      timeoutRefs.current.chunk = null;
    }
  }, []);

  const startStreaming = useCallback(
    async (question: string, conversationId?: string) => {
      // Abort any existing stream and clear timeouts
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      clearTimeouts();

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      const controller = abortControllerRef.current;

      // Reset state
      setState({
        content: '',
        status: 'Thinking...',
        sources: [],
        isStreaming: true,
        error: null,
      });

      // ISSUE #41 FIX: Get timeout values from options or use defaults
      const connectTimeout = options.connectTimeout ?? STREAM_CONNECT_TIMEOUT_MS;
      const totalTimeout = options.totalTimeout ?? STREAM_TOTAL_TIMEOUT_MS;

      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3007/api/v1';
        const workspaceId =
          typeof window !== 'undefined'
            ? localStorage.getItem('activeWorkspaceId')
            : null;

        console.log('[useStreaming] Starting stream request:', {
          url: `${baseUrl}/rag/stream`,
          question,
          conversationId,
          workspaceId,
          connectTimeout,
          totalTimeout,
        });

        // ISSUE #41 FIX: Set connection timeout
        timeoutRefs.current.connect = setTimeout(() => {
          console.warn('[useStreaming] Connection timeout reached');
          controller.abort();
        }, connectTimeout);

        // ISSUE #41 FIX: Set total stream timeout
        timeoutRefs.current.total = setTimeout(() => {
          console.warn('[useStreaming] Total stream timeout reached');
          controller.abort();
        }, totalTimeout);

        const response = await fetch(`${baseUrl}/rag/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ question, conversationId }),
          signal: controller.signal,
        });

        // Clear connection timeout once response is received
        if (timeoutRefs.current.connect) {
          clearTimeout(timeoutRefs.current.connect);
          timeoutRefs.current.connect = null;
        }

        console.log('[useStreaming] Response status:', response.status);

        if (!response.ok) {
          const error = await response.json().catch(() => ({
            message: 'Failed to get response',
          }));
          console.error('[useStreaming] Response error:', error);
          throw new Error(error.message || 'Request failed');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let sources: Source[] = [];

        let currentEventType = '';

        // ISSUE #41 FIX: Helper to reset chunk timeout
        const resetChunkTimeout = () => {
          if (timeoutRefs.current.chunk) {
            clearTimeout(timeoutRefs.current.chunk);
          }
          timeoutRefs.current.chunk = setTimeout(() => {
            console.warn('[useStreaming] Chunk timeout - no data received');
            controller.abort();
          }, STREAM_CHUNK_TIMEOUT_MS);
        };

        // Start initial chunk timeout
        resetChunkTimeout();

        while (true) {
          const { done, value } = await reader.read();

          // Reset chunk timeout on each read
          if (!done) {
            resetChunkTimeout();
          }
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
              continue;
            }

            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              try {
                // Try to parse as JSON first (for structured events)
                const parsed = JSON.parse(data);

                // Use the event type from the 'event:' line
                const eventType = currentEventType || parsed.type;

                if (eventType === 'status') {
                  setState((prev) => ({
                    ...prev,
                    status: parsed.message || parsed.data || '',
                  }));
                } else if (eventType === 'sources') {
                  sources = parsed.sources || parsed.data || [];
                  console.log('[useStreaming] Sources received:', {
                    count: sources.length,
                    hasUrls: sources.filter((s: Source) => s.url).length,
                    sample: sources.slice(0, 2).map((s: Source) => ({ title: s.title, url: s.url })),
                  });
                  setState((prev) => ({
                    ...prev,
                    sources,
                  }));
                } else if (eventType === 'chunk') {
                  // Backend sends { text: chunk }
                  const chunk = parsed.text || parsed.chunk || parsed.data || '';
                  fullContent += chunk;
                  setState((prev) => ({
                    ...prev,
                    content: fullContent,
                    status: '',
                  }));
                } else if (eventType === 'replace') {
                  // Hallucination detected — replace streamed content with fallback
                  fullContent = parsed.text || '';
                  setState((prev) => ({
                    ...prev,
                    content: fullContent,
                  }));
                } else if (eventType === 'done') {
                  // Stream complete
                  break;
                } else if (eventType === 'error') {
                  throw new Error(parsed.message || 'Stream error');
                }
                // Reset event type after processing
                currentEventType = '';
              } catch {
                // If not JSON, treat as raw text chunk
                if (data && data !== '[DONE]') {
                  fullContent += data;
                  setState((prev) => ({
                    ...prev,
                    content: fullContent,
                    status: '',
                  }));
                }
                currentEventType = '';
              }
            }
          }
        }

        // ISSUE #41 FIX: Clear all timeouts on successful completion
        clearTimeouts();

        // Stream complete
        console.log('[useStreaming] Stream complete. Sources to pass:', {
          count: sources.length,
          hasUrls: sources.filter((s: Source) => s.url).length,
        });
        setState((prev) => ({
          ...prev,
          isStreaming: false,
        }));

        options.onComplete?.(fullContent, sources);
      } catch (error) {
        // ISSUE #41 FIX: Clear all timeouts on error
        clearTimeouts();

        console.error('[useStreaming] Fetch error:', {
          name: (error as Error).name,
          message: (error as Error).message,
          error,
        });

        if ((error as Error).name === 'AbortError') {
          // ISSUE #41 FIX: Distinguish between user abort and timeout
          // Check if we have any content - if so, this might be a timeout mid-stream
          const state = setState((prev) => {
            // If we have partial content, it was likely a timeout mid-stream
            if (prev.content.length > 0) {
              console.log('[useStreaming] Stream aborted with partial content - possible timeout');
              return {
                ...prev,
                isStreaming: false,
                error: 'The response was interrupted. Your partial answer is shown above.',
              };
            }
            // Otherwise it was a connection timeout or user cancel
            return {
              ...prev,
              isStreaming: false,
            };
          });
          return;
        }

        // ISSUE #41 FIX: User-friendly timeout error message
        let errorMessage = error instanceof Error ? error.message : 'An error occurred';
        if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
          errorMessage = 'The request timed out. Please try again.';
        }

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));
        options.onError?.(errorMessage);
      }
    },
    [options, clearTimeouts]
  );

  const stopStreaming = useCallback(() => {
    // ISSUE #41 FIX: Clear timeouts when stopping
    clearTimeouts();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, [clearTimeouts]);

  const reset = useCallback(() => {
    stopStreaming();
    setState({
      content: '',
      status: '',
      sources: [],
      isStreaming: false,
      error: null,
    });
  }, [stopStreaming]);

  return {
    ...state,
    startStreaming,
    stopStreaming,
    reset,
  };
}
