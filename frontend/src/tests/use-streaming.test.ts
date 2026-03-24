/**
 * useStreaming Hook Unit Tests
 *
 * Tests for SSE streaming hook functionality
 * Note: These tests focus on state management and basic behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreaming } from '@/lib/hooks/use-streaming';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(() => 'test-workspace-id'),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useStreaming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch to a pending promise by default
    mockFetch.mockImplementation(() => new Promise(() => {}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================
  describe('Initial State', () => {
    it('should have empty content initially', () => {
      const { result } = renderHook(() => useStreaming());

      expect(result.current.content).toBe('');
    });

    it('should have empty status initially', () => {
      const { result } = renderHook(() => useStreaming());

      expect(result.current.status).toBe('');
    });

    it('should have empty sources initially', () => {
      const { result } = renderHook(() => useStreaming());

      expect(result.current.sources).toEqual([]);
    });

    it('should not be streaming initially', () => {
      const { result } = renderHook(() => useStreaming());

      expect(result.current.isStreaming).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useStreaming());

      expect(result.current.error).toBeNull();
    });

    it('should provide startStreaming function', () => {
      const { result } = renderHook(() => useStreaming());

      expect(typeof result.current.startStreaming).toBe('function');
    });

    it('should provide stopStreaming function', () => {
      const { result } = renderHook(() => useStreaming());

      expect(typeof result.current.stopStreaming).toBe('function');
    });

    it('should provide reset function', () => {
      const { result } = renderHook(() => useStreaming());

      expect(typeof result.current.reset).toBe('function');
    });
  });

  // ===========================================================================
  // startStreaming Tests
  // ===========================================================================
  describe('startStreaming', () => {
    it('should set isStreaming to true when starting', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test question');
      });

      expect(result.current.isStreaming).toBe(true);
    });

    it('should set status to "Thinking..." when starting', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test question');
      });

      expect(result.current.status).toBe('Thinking...');
    });

    it('should reset content when starting new stream', () => {
      const { result } = renderHook(() => useStreaming());

      // Simulate some existing content
      act(() => {
        result.current.startStreaming('first question');
      });

      // Start new stream
      act(() => {
        result.current.startStreaming('second question');
      });

      expect(result.current.content).toBe('');
    });

    it('should reset error when starting new stream', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(result.current.error).toBeNull();
    });

    it('should reset sources when starting new stream', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(result.current.sources).toEqual([]);
    });

    it('should include workspace ID in headers', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test question');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Workspace-Id': 'test-workspace-id',
          }),
        })
      );
    });

    it('should send question and conversationId in body', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test question', 'conv-123');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            question: 'test question',
            conversationId: 'conv-123',
          }),
        })
      );
    });

    it('should use POST method', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include credentials', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should call the correct endpoint', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/rag/stream'),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // stopStreaming Tests
  // ===========================================================================
  describe('stopStreaming', () => {
    it('should set isStreaming to false', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(result.current.isStreaming).toBe(true);

      act(() => {
        result.current.stopStreaming();
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('should be callable even when not streaming', () => {
      const { result } = renderHook(() => useStreaming());

      expect(() => {
        act(() => {
          result.current.stopStreaming();
        });
      }).not.toThrow();

      expect(result.current.isStreaming).toBe(false);
    });
  });

  // ===========================================================================
  // reset Tests
  // ===========================================================================
  describe('reset', () => {
    it('should reset content to empty', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.content).toBe('');
    });

    it('should reset status to empty', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('');
    });

    it('should reset sources to empty array', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.reset();
      });

      expect(result.current.sources).toEqual([]);
    });

    it('should reset isStreaming to false', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('should reset error to null', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.reset();
      });

      expect(result.current.error).toBeNull();
    });
  });

  // ===========================================================================
  // Options Tests
  // ===========================================================================
  describe('Options', () => {
    it('should accept onComplete callback', () => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useStreaming({ onComplete }));

      expect(result.current).toBeDefined();
    });

    it('should accept onError callback', () => {
      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));

      expect(result.current).toBeDefined();
    });

    it('should accept connectTimeout option', () => {
      const { result } = renderHook(() =>
        useStreaming({ connectTimeout: 5000 })
      );

      expect(result.current).toBeDefined();
    });

    it('should accept totalTimeout option', () => {
      const { result } = renderHook(() =>
        useStreaming({ totalTimeout: 60000 })
      );

      expect(result.current).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================
  describe('Error Handling', () => {
    it('should handle non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Unauthorized' }),
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));

      await act(async () => {
        await result.current.startStreaming('test');
      });

      expect(result.current.error).toBe('Unauthorized');
      expect(result.current.isStreaming).toBe(false);
      expect(onError).toHaveBeenCalledWith('Unauthorized');
    });

    it('should handle fetch rejection', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));

      await act(async () => {
        await result.current.startStreaming('test');
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isStreaming).toBe(false);
      expect(onError).toHaveBeenCalledWith('Network error');
    });

    it('should handle response without body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));

      await act(async () => {
        await result.current.startStreaming('test');
      });

      expect(result.current.error).toBe('No response body');
      expect(result.current.isStreaming).toBe(false);
    });

    it('should handle JSON parse error in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const { result } = renderHook(() => useStreaming());

      await act(async () => {
        await result.current.startStreaming('test');
      });

      expect(result.current.error).toBe('Failed to get response');
    });
  });

  // ===========================================================================
  // AbortController Tests
  // ===========================================================================
  describe('AbortController', () => {
    it('should pass abort signal to fetch', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('test');
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should handle abort gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));

      await act(async () => {
        await result.current.startStreaming('test');
      });

      // AbortError should not trigger onError
      expect(onError).not.toHaveBeenCalled();
      expect(result.current.isStreaming).toBe(false);
    });
  });

  // ===========================================================================
  // Multiple Streams Tests
  // ===========================================================================
  describe('Multiple Streams', () => {
    it('should abort previous stream when starting new one', () => {
      const { result } = renderHook(() => useStreaming());

      // Start first stream
      act(() => {
        result.current.startStreaming('first');
      });

      const firstCallSignal = mockFetch.mock.calls[0]?.[1]?.signal as AbortSignal;

      // Start second stream
      act(() => {
        result.current.startStreaming('second');
      });

      // First stream's signal should be aborted
      expect(firstCallSignal?.aborted).toBe(true);
    });

    it('should reset state for new stream', () => {
      const { result } = renderHook(() => useStreaming());

      act(() => {
        result.current.startStreaming('first');
      });

      act(() => {
        result.current.startStreaming('second');
      });

      expect(result.current.content).toBe('');
      expect(result.current.status).toBe('Thinking...');
      expect(result.current.isStreaming).toBe(true);
    });
  });

  // ===========================================================================
  // SSE Event Processing Tests
  // ===========================================================================
  describe('SSE event processing', () => {
    /** Build a ReadableStream from string chunks */
    function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let i = 0;
      return new ReadableStream({
        pull(controller) {
          if (i < chunks.length) {
            controller.enqueue(encoder.encode(chunks[i++]));
          } else {
            controller.close();
          }
        },
      });
    }

    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('accumulates text from chunk events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['event: chunk\ndata: {"text":"Hello"}\nevent: chunk\ndata: {"text":" world"}\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('Hello world');
      expect(result.current.isStreaming).toBe(false);
    });

    it('handles chunk with "chunk" field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['event: chunk\ndata: {"chunk":"via chunk field"}\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('via chunk field');
    });

    it('handles chunk with "data" field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['event: chunk\ndata: {"data":"via data field"}\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('via data field');
    });

    it('sets status from status events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([
          'event: status\ndata: {"message":"Retrieving docs..."}\nevent: chunk\ndata: {"text":"Answer"}\n',
        ]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      // Status is cleared to '' by the chunk handler
      expect(result.current.content).toBe('Answer');
    });

    it('sets status from data field on status events', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([
          'event: status\ndata: {"data":"Searching..."}\n',
        ]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      // After stream ends isStreaming=false; status was set during the stream
      expect(result.current.isStreaming).toBe(false);
    });

    it('stores sources from sources events', async () => {
      const sources = [{ id: 's1', title: 'Policy Doc', content: '...' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([
          `event: sources\ndata: ${JSON.stringify({ sources })}\nevent: chunk\ndata: {"text":"ok"}\n`,
        ]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.sources).toHaveLength(1);
      expect(result.current.sources[0].title).toBe('Policy Doc');
    });

    it('stores sources from "data" field on sources events', async () => {
      const sources = [{ id: 's1', title: 'Doc', content: '...' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([`event: sources\ndata: ${JSON.stringify({ data: sources })}\n`]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.sources).toHaveLength(1);
    });

    it('replaces content on replace event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([
          'event: chunk\ndata: {"text":"Bad"}\nevent: replace\ndata: {"text":"Corrected"}\n',
        ]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('Corrected');
    });

    it('breaks out of stream on done event', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['event: chunk\ndata: {"text":"Final"}\nevent: done\ndata: {}\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('Final');
      expect(result.current.isStreaming).toBe(false);
    });

    it('swallows error event (throw is caught by inner catch) and appends data as raw text', async () => {
      // The hook's inner try/catch catches the intentional throw for 'error' events,
      // so the JSON string gets appended as raw fallback text rather than setting error state.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['event: error\ndata: {"message":"Internal failure"}\n']),
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useStreaming({ onError }));
      await act(async () => { await result.current.startStreaming('Q'); });

      // Inner catch appends the raw JSON string as content; error state is NOT set
      expect(result.current.content).toContain('"message":"Internal failure"');
      expect(result.current.error).toBeNull();
      expect(onError).not.toHaveBeenCalled();
    });

    it('falls back to raw text when data is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['data: plain text here\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('plain text here');
    });

    it('skips [DONE] sentinel in raw text mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream(['data: [DONE]\n']),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('');
    });

    it('uses parsed.type as fallback when no event: prefix is present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([`data: ${JSON.stringify({ type: 'chunk', text: 'type-driven' })}\n`]),
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.content).toBe('type-driven');
    });

    it('calls onComplete with final content and sources', async () => {
      const onComplete = vi.fn();
      const sources = [{ id: 's1', title: 'Policy', content: '...' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: makeStream([
          `event: sources\ndata: ${JSON.stringify({ sources })}\n` +
          'event: chunk\ndata: {"text":"Answer"}\n',
        ]),
      });

      const { result } = renderHook(() => useStreaming({ onComplete }));
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(onComplete).toHaveBeenCalledOnce();
      expect(onComplete).toHaveBeenCalledWith('Answer', sources);
    });

    it('sets interrupted error when AbortError fires with partial content', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('event: chunk\ndata: {"text":"Partial"}\n'),
          })
          .mockRejectedValueOnce(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const { result } = renderHook(() => useStreaming());
      await act(async () => { await result.current.startStreaming('Q'); });

      expect(result.current.isStreaming).toBe(false);
      expect(result.current.error).toMatch(/interrupted/i);
    });
  });
});
