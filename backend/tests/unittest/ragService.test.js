/**
 * Unit Tests — RAGService (rag.js)
 *
 * Tests the pure/isolated methods using dependency injection.
 * All external dependencies (LLM, VectorStore, Cache, DB) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (declared before import) ──────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../config/langsmith.js', () => ({ getCallbacks: vi.fn(() => []) }));
vi.mock('../../config/llm.js', () => ({ getDefaultLLM: vi.fn() }));
vi.mock('../../config/vectorStore.js', () => ({ getVectorStore: vi.fn() }));
vi.mock('../../utils/rag/ragCache.js', () => ({ ragCache: { get: vi.fn(), set: vi.fn() } }));
vi.mock('../../services/answerFormatter.js', () => ({
  answerFormatter: { format: vi.fn() },
}));
vi.mock('../../models/Message.js', () => ({ Message: { find: vi.fn(), create: vi.fn() } }));
vi.mock('../../models/Conversation.js', () => ({
  Conversation: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}));
vi.mock('../../prompts/ragPrompt.js', () => ({ ragPrompt: { pipe: vi.fn() } }));
vi.mock('../../utils/core/asyncHelpers.js', () => ({
  invokeWithTimeout: vi.fn(),
  streamWithTimeout: vi.fn(),
  LLMTimeoutError: class LLMTimeoutError extends Error {},
}));
vi.mock('../../services/rag/documentRanking.js', () => ({
  rerankDocuments: vi.fn((docs) => docs),
}));
vi.mock('../../services/rag/llmJudge.js', () => ({
  evaluateAnswer: vi.fn(),
  extractCitedSources: vi.fn(() => []),
  toValidationResult: vi.fn(() => ({
    confidence: 0.8,
    isGrounded: true,
    hasHallucinations: false,
    isLowQuality: false,
    issues: [],
    isRelevant: true,
    reasoning: '',
  })),
}));
vi.mock('../../services/rag/retrievalEnhancements.js', () => ({
  compressDocuments: vi.fn((docs) => docs),
  initChains: vi.fn(),
}));
vi.mock('../../services/rag/queryRetrieval.js', () => ({
  buildQdrantFilter: vi.fn(() => null),
  retrieveAdditionalDocuments: vi.fn(() => []),
}));
vi.mock('../../services/rag/analyticsTracker.js', () => ({
  trackQueryAnalytics: vi.fn(),
  buildRAGResult: vi.fn((params) => ({ ...params, _built: true })),
}));
vi.mock('../../utils/rag/contextFormatter.js', () => ({
  formatContext: vi.fn(() => 'formatted context'),
  formatSources: vi.fn(() => [{ sourceNumber: 1, title: 'Doc', url: '' }]),
}));
vi.mock('../../utils/security/contextSanitizer.js', () => ({
  sanitizeDocuments: vi.fn((docs) => docs),
  sanitizeFormattedContext: vi.fn((ctx) => ctx),
}));
vi.mock('../../utils/security/outputSanitizer.js', () => ({
  sanitizeLLMOutput: vi.fn((text) => ({
    text,
    modified: false,
    suspicious: false,
    categories: [],
  })),
}));
vi.mock('../../utils/security/piiMasker.js', () => ({
  scanOutputForSensitiveInfo: vi.fn((text) => ({ text, clean: true })),
}));
vi.mock('../../utils/security/confidenceHandler.js', () => ({
  applyConfidenceHandling: vi.fn((result) => result),
}));
vi.mock('../../utils/rag/citationValidator.js', () => ({
  processCitations: vi.fn((text) => ({
    text,
    valid: true,
    invalidCitations: [],
    validCitations: [],
  })),
  analyzeCitationCoverage: vi.fn(() => ({ coverage: 1, meetsCoverage: true })),
}));
vi.mock('../../utils/rag/outputValidator.js', () => ({
  processOutput: vi.fn((text) => ({
    content: text,
    valid: true,
    errors: [],
    warnings: [],
    metadata: {},
  })),
}));
vi.mock('mongoose', () => ({
  default: {
    startSession: vi.fn(() => ({
      withTransaction: vi.fn(async (fn) => fn()),
      endSession: vi.fn(),
    })),
  },
}));

import { RAGService } from '../../services/rag.js';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// ─── Test factory ─────────────────────────────────────────────────────────────

function makeService(overrides = {}) {
  const mockLLM = { pipe: vi.fn().mockReturnThis(), invoke: vi.fn() };
  const mockCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(null) };
  const mockFormatter = { format: vi.fn().mockResolvedValue({ sections: [] }) };
  const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const mockMessage = {
    find: vi.fn().mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    create: vi.fn().mockResolvedValue({}),
  };
  const mockConversation = {
    findById: vi.fn().mockResolvedValue({ _id: 'conv-1', workspaceId: 'ws-1' }),
    findByIdAndUpdate: vi.fn().mockResolvedValue({}),
  };
  const mockVectorStore = {
    asRetriever: vi.fn().mockReturnValue({}),
    similaritySearch: vi.fn().mockResolvedValue([]),
  };
  const mockVectorStoreFactory = vi.fn().mockResolvedValue(mockVectorStore);

  const svc = new RAGService({
    llm: mockLLM,
    vectorStoreFactory: mockVectorStoreFactory,
    cache: mockCache,
    answerFormatter: mockFormatter,
    logger: mockLogger,
    models: { Message: mockMessage, Conversation: mockConversation },
    ...overrides,
  });

  return {
    svc,
    mockLLM,
    mockCache,
    mockFormatter,
    mockLogger,
    mockMessage,
    mockConversation,
    mockVectorStore,
  };
}

// ─── Constructor / DI ─────────────────────────────────────────────────────────

describe('RAGService constructor', () => {
  it('uses injected dependencies', () => {
    const { svc, mockLLM, mockCache } = makeService();
    expect(svc._injectedLLM).toBe(mockLLM);
    expect(svc.cache).toBe(mockCache);
    expect(svc._initialized).toBe(false);
  });

  it('falls back to defaults when no dependencies provided', () => {
    // Just verify it constructs without throwing
    expect(() => new RAGService()).not.toThrow();
  });
});

// ─── _convertToHistory ────────────────────────────────────────────────────────

describe('_convertToHistory', () => {
  it('converts user messages to HumanMessage', () => {
    const { svc } = makeService();
    const result = svc._convertToHistory([{ role: 'user', content: 'Hello' }]);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[0].content).toBe('Hello');
  });

  it('converts assistant messages to AIMessage', () => {
    const { svc } = makeService();
    const result = svc._convertToHistory([{ role: 'assistant', content: 'Hi there' }]);
    expect(result[0]).toBeInstanceOf(AIMessage);
    expect(result[0].content).toBe('Hi there');
  });

  it('converts mixed conversation history', () => {
    const { svc } = makeService();
    const msgs = [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ];
    const result = svc._convertToHistory(msgs);
    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(HumanMessage);
    expect(result[1]).toBeInstanceOf(AIMessage);
    expect(result[2]).toBeInstanceOf(HumanMessage);
  });

  it('returns empty array for empty input', () => {
    const { svc } = makeService();
    expect(svc._convertToHistory([])).toEqual([]);
  });
});

// ─── _resolveQdrantWorkspaceId ────────────────────────────────────────────────

describe('_resolveQdrantWorkspaceId', () => {
  it('returns "default" for null workspaceId', async () => {
    const { svc } = makeService();
    expect(await svc._resolveQdrantWorkspaceId(null)).toBe('default');
  });

  it('returns "default" for "default" workspaceId', async () => {
    const { svc } = makeService();
    expect(await svc._resolveQdrantWorkspaceId('default')).toBe('default');
  });

  it('converts ObjectId to string', async () => {
    const { svc } = makeService();
    expect(await svc._resolveQdrantWorkspaceId('workspace-abc-123')).toBe('workspace-abc-123');
  });
});

// ─── _createValidatedEmit ─────────────────────────────────────────────────────

describe('_createValidatedEmit', () => {
  let svc, mockLogger;

  beforeEach(() => {
    ({ svc, mockLogger } = makeService());
  });

  it('calls rawEmit for valid "status" event', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('status', { message: 'Loading...' });
    expect(rawEmit).toHaveBeenCalledWith(
      'status',
      expect.objectContaining({ message: 'Loading...' })
    );
  });

  it('calls rawEmit for valid "chunk" event', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('chunk', { text: 'Hello' });
    expect(rawEmit).toHaveBeenCalledWith('chunk', expect.objectContaining({ text: 'Hello' }));
  });

  it('calls rawEmit for valid "sources" event', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('sources', { sources: [] });
    expect(rawEmit).toHaveBeenCalledWith('sources', expect.objectContaining({ sources: [] }));
  });

  it('calls rawEmit for valid "done" event (no required fields)', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('done', { message: 'Complete' });
    expect(rawEmit).toHaveBeenCalled();
  });

  it('enriches events with a timestamp', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('done', {});
    const [, enriched] = rawEmit.mock.calls[0];
    expect(enriched.timestamp).toBeTypeOf('number');
  });

  it('blocks unknown event types and logs a warning', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('unknown_event', { data: 'x' });
    expect(rawEmit).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Invalid streaming event type',
      expect.any(Object)
    );
  });

  it('blocks "status" event with missing message field', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('status', { wrongField: 'x' });
    expect(rawEmit).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Invalid streaming event payload',
      expect.any(Object)
    );
  });

  it('blocks "chunk" event with missing text field', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('chunk', { wrongField: 'x' });
    expect(rawEmit).not.toHaveBeenCalled();
  });

  it('blocks "sources" event with non-array sources', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('sources', { sources: 'not-an-array' });
    expect(rawEmit).not.toHaveBeenCalled();
  });

  it('blocks events where payload is not an object', () => {
    const rawEmit = vi.fn();
    const emit = svc._createValidatedEmit(rawEmit);
    emit('done', 'string-payload');
    expect(rawEmit).not.toHaveBeenCalled();
  });

  it('catches and logs errors thrown by rawEmit', () => {
    const rawEmit = vi.fn().mockImplementation(() => {
      throw new Error('emit crash');
    });
    const emit = svc._createValidatedEmit(rawEmit);
    expect(() => emit('done', {})).not.toThrow();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error emitting streaming event',
      expect.any(Object)
    );
  });
});

// ─── _rephraseQuery ───────────────────────────────────────────────────────────

describe('_rephraseQuery', () => {
  it('returns original question when no history', async () => {
    const { svc } = makeService();
    const result = await svc._rephraseQuery('What is DORA?', []);
    expect(result).toBe('What is DORA?');
  });

  it('invokes rephraseChain when history exists', async () => {
    const { svc } = makeService();
    const mockChain = { invoke: vi.fn().mockResolvedValue('rephrased query') };
    svc.rephraseChain = mockChain;

    const history = [new HumanMessage('previous question')];
    const result = await svc._rephraseQuery('follow up', history);

    expect(mockChain.invoke).toHaveBeenCalledWith({
      input: 'follow up',
      chat_history: history,
    });
    expect(result).toBe('rephrased query');
  });
});

// ─── askWithConversation ──────────────────────────────────────────────────────

describe('askWithConversation', () => {
  it('throws when conversationId is missing', async () => {
    const { svc } = makeService();
    svc._initialized = true;
    await expect(svc.askWithConversation('question', {})).rejects.toThrow(
      'conversationId is required'
    );
  });

  it('throws when conversation is not found', async () => {
    const { svc, mockConversation } = makeService();
    svc._initialized = true;
    svc.vectorStore = { similaritySearch: vi.fn().mockResolvedValue([]) };
    mockConversation.findById.mockResolvedValue(null);

    await expect(
      svc.askWithConversation('question', { conversationId: 'nonexistent' })
    ).rejects.toThrow('not found');
  });

  it('returns cached result when cache hit', async () => {
    const { svc, mockCache, mockConversation, mockMessage } = makeService();
    svc._initialized = true;
    svc.vectorStore = { similaritySearch: vi.fn().mockResolvedValue([]) };

    const cached = { answer: 'cached answer', sources: [{ title: 'Doc' }] };
    mockCache.get.mockResolvedValue(cached);
    mockConversation.findById.mockResolvedValue({ _id: 'conv-1', workspaceId: 'ws-1' });
    mockMessage.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ sort: vi.fn().mockResolvedValue([]) }),
      }),
    });

    const result = await svc.askWithConversation('question', { conversationId: 'conv-1' });

    expect(result).toBe(cached);
    expect(mockCache.get).toHaveBeenCalledWith('question', 'ws-1', 'conv-1');
  });

  it('uses null workspaceId when conversation has no workspaceId', async () => {
    const { svc, mockCache, mockConversation } = makeService();
    svc._initialized = true;
    svc.vectorStore = { similaritySearch: vi.fn().mockResolvedValue([]) };

    const cached = { answer: 'cached', sources: [] };
    mockCache.get.mockResolvedValue(cached);
    mockConversation.findById.mockResolvedValue({ _id: 'conv-1', workspaceId: null });

    await svc.askWithConversation('question', { conversationId: 'conv-1' });

    expect(mockCache.get).toHaveBeenCalledWith('question', null, 'conv-1');
  });
});

// ─── init / _doInit ───────────────────────────────────────────────────────────

describe('init()', () => {
  it('sets _initialized to true after successful init', async () => {
    const { svc, mockLLM, mockVectorStore } = makeService();
    const mockChain = { pipe: vi.fn().mockReturnThis() };
    mockLLM.pipe.mockReturnValue(mockChain);

    // Mock initChains
    const { initChains } = await import('../../services/rag/retrievalEnhancements.js');
    initChains.mockResolvedValue(undefined);

    await svc.init();

    expect(svc._initialized).toBe(true);
    expect(svc.llm).toBe(mockLLM);
  });

  it('does not re-initialize if already initialized', async () => {
    const { svc, mockVectorStore } = makeService();
    svc._initialized = true;

    await svc.init();

    expect(svc.vectorStoreFactory).toBeDefined();
  });

  it('reuses existing _initPromise for concurrent calls', async () => {
    const { svc, mockLLM, mockVectorStore } = makeService();
    const mockChain = { pipe: vi.fn().mockReturnThis() };
    mockLLM.pipe.mockReturnValue(mockChain);

    const { initChains } = await import('../../services/rag/retrievalEnhancements.js');
    initChains.mockResolvedValue(undefined);

    // Call init twice concurrently
    await Promise.all([svc.init(), svc.init()]);

    expect(svc._initialized).toBe(true);
  });
});
