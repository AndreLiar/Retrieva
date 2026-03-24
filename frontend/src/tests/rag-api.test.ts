
/**
 * Frontend Tests — ragApi client + streamRAGResponse
 *
 * All tests mock the Axios client (for ragApi) or global fetch (for streamRAGResponse).
 * Covers: ask, getStreamUrl, searchSources, streamRAGResponse (happy path, error, no body)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock apiClient BEFORE importing ragApi
// ---------------------------------------------------------------------------
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}));

import { ragApi, streamRAGResponse } from '@/lib/api/rag';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ragApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // ask
  // -------------------------------------------------------------------------
  describe('ask()', () => {
    it('calls POST /rag with query data', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { answer: 'The answer', sources: [] } },
      });
      await ragApi.ask({ question: 'What is DORA?' });
      expect(mockPost).toHaveBeenCalledWith('/rag', { question: 'What is DORA?' });
    });

    it('passes conversationId and workspaceId', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { answer: 'The answer', sources: [] } },
      });
      await ragApi.ask({ question: 'Q', conversationId: 'conv-1', workspaceId: 'ws-1' });
      expect(mockPost).toHaveBeenCalledWith('/rag', {
        question: 'Q',
        conversationId: 'conv-1',
        workspaceId: 'ws-1',
      });
    });

    it('returns response data', async () => {
      mockPost.mockResolvedValue({
        data: { status: 'success', data: { answer: 'The answer', sources: [] } },
      });
      const result = await ragApi.ask({ question: 'What is DORA?' });
      expect(result.data!.answer).toBe('The answer');
    });
  });

  // -------------------------------------------------------------------------
  // getStreamUrl
  // -------------------------------------------------------------------------
  describe('getStreamUrl()', () => {
    it('returns a URL ending with /rag/stream', () => {
      const url = ragApi.getStreamUrl();
      expect(url).toMatch(/\/rag\/stream$/);
    });

    it('uses NEXT_PUBLIC_API_URL env var when set', () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.retrieva.online/api/v1');
      const url = ragApi.getStreamUrl();
      expect(url).toBe('https://api.retrieva.online/api/v1/rag/stream');
      vi.unstubAllEnvs();
    });

    it('falls back to localhost when env var is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_API_URL', '');
      const url = ragApi.getStreamUrl();
      expect(url).toBe('http://localhost:3007/api/v1/rag/stream');
      vi.unstubAllEnvs();
    });
  });

  // -------------------------------------------------------------------------
  // searchSources
  // -------------------------------------------------------------------------
  describe('searchSources()', () => {
    it('calls GET /rag/search with query and default limit', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { sources: [] } },
      });
      await ragApi.searchSources('DORA compliance');
      expect(mockGet).toHaveBeenCalledWith('/rag/search', { params: { query: 'DORA compliance', limit: 5 } });
    });

    it('passes custom limit', async () => {
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { sources: [] } },
      });
      await ragApi.searchSources('DORA compliance', 10);
      expect(mockGet).toHaveBeenCalledWith('/rag/search', { params: { query: 'DORA compliance', limit: 10 } });
    });

    it('returns sources array', async () => {
      const mockSource = { id: 'src-1', title: 'Policy Doc', content: '...' };
      mockGet.mockResolvedValue({
        data: { status: 'success', data: { sources: [mockSource] } },
      });
      const result = await ragApi.searchSources('policy');
      expect(result.data!.sources).toHaveLength(1);
      expect(result.data!.sources[0].title).toBe('Policy Doc');
    });
  });
});

// ---------------------------------------------------------------------------
// streamRAGResponse — async generator tests
// ---------------------------------------------------------------------------

describe('streamRAGResponse()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage
    localStorage.clear();
  });

  function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
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

  it('yields message events from SSE stream', async () => {
    const sseChunk = 'data: hello world\n\ndata: second line\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeReadableStream([sseChunk]),
      })
    );

    const results: { type: string; data: string }[] = [];
    for await (const event of streamRAGResponse({ question: 'Q' })) {
      results.push(event);
    }

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].type).toBe('message');
    expect(results[0].data).toBe('hello world');
  });

  it('yields typed events when "event:" prefix is present', async () => {
    const sseChunk = 'event: token\ndata: chunk1\nevent: done\ndata: {}\n';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeReadableStream([sseChunk]),
      })
    );

    const results: { type: string; data: string }[] = [];
    for await (const event of streamRAGResponse({ question: 'Q' })) {
      results.push(event);
    }

    const tokenEvent = results.find((e) => e.type === 'token');
    expect(tokenEvent).toBeDefined();
    expect(tokenEvent!.data).toBe('chunk1');
  });

  it('throws when response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
      })
    );

    const gen = streamRAGResponse({ question: 'Q' });
    await expect(gen.next()).rejects.toThrow('Unauthorized');
  });

  it('throws "No response body" when body is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: null,
      })
    );

    const gen = streamRAGResponse({ question: 'Q' });
    await expect(gen.next()).rejects.toThrow('No response body');
  });

  it('includes X-Workspace-Id header when activeWorkspaceId is in localStorage', async () => {
    localStorage.setItem('activeWorkspaceId', 'ws-123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeReadableStream(['']),
      })
    );

    // Drain generator
    for await (const _ of streamRAGResponse({ question: 'Q' })) { /* empty */ }

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = fetchCall[1] as RequestInit;
    expect((options.headers as Record<string, string>)['X-Workspace-Id']).toBe('ws-123');
  });

  it('does not include X-Workspace-Id header when localStorage has no activeWorkspaceId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: makeReadableStream(['']),
      })
    );

    for await (const _ of streamRAGResponse({ question: 'Q' })) { /* empty */ }

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const options = fetchCall[1] as RequestInit;
    expect((options.headers as Record<string, string>)['X-Workspace-Id']).toBeUndefined();
  });
});
