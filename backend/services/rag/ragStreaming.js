/**
 * RAG Streaming Handler
 *
 * Handles real-time streaming responses for the RAG service.
 * Extracted from rag.js to maintain modularity and keep file sizes manageable.
 *
 * @module services/rag/ragStreaming
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import { randomUUID } from 'crypto';

// Real-time events for streaming
import {
  emitQueryStart,
  emitQueryThinking,
  emitQueryRetrieving,
  emitQueryStream,
  emitQuerySources,
  emitQueryComplete,
  emitQueryError,
} from '../realtimeEvents.js';

// RAG components
import { rerankDocuments } from './documentRanking.js';
import { compressDocuments } from './retrievalEnhancements.js';
import { buildQdrantFilter, performMultiQueryRetrieval } from './queryRetrieval.js';

// Memory services
import { entityMemory } from '../memory/entityMemory.js';

// Prompts
import { ragPrompt } from '../../prompts/ragPrompt.js';

// LangSmith tracing
import { getCallbacks } from '../../config/langsmith.js';

/**
 * Split text into chunks for streaming cached responses
 * @param {string} text - Text to split
 * @param {number} chunkSize - Words per chunk
 * @returns {string[]} Array of chunks
 */
export function splitIntoChunks(text, chunkSize = 20) {
  const words = text.split(' ');
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' ') + ' ');
  }
  return chunks;
}

/**
 * Simple delay helper
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stream a cached response to the client
 * @param {Object} cached - Cached response
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {number} startTime - Request start time
 */
export async function streamCachedResponse(cached, queryId, userId, startTime) {
  emitQueryThinking(queryId, userId, 'Found cached answer...');

  const chunks = splitIntoChunks(cached.answer, 20);
  for (const chunk of chunks) {
    emitQueryStream(queryId, userId, chunk, false);
    await delay(10);
  }
  emitQueryStream(queryId, userId, '', true);

  if (cached.sources) {
    emitQuerySources(queryId, userId, cached.sources);
  }

  emitQueryComplete(queryId, userId, {
    answer: cached.answer,
    sources: cached.sources,
    confidence: cached.validation?.confidence,
    processingTime: Date.now() - startTime,
    cached: true,
  });
}

/**
 * Generate answer with token streaming
 * @param {Object} llm - LLM instance
 * @param {string} question - User question
 * @param {string} context - Document context
 * @param {Array} history - Chat history
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<string>} Full response
 */
export async function generateAnswerWithStreaming(
  llm,
  question,
  context,
  history,
  queryId,
  userId,
  metadata = {}
) {
  const callbacks = getCallbacks({
    runName: metadata.runName || 'rag-query-streaming',
    metadata: {
      questionLength: question.length,
      sourcesCount: metadata.sourcesCount || 0,
      hasHistory: history.length > 0,
      streaming: true,
      ...metadata,
    },
    sessionId: metadata.sessionId,
  });

  const chain = ragPrompt.pipe(llm).pipe(new StringOutputParser());

  let fullResponse = '';

  const stream = await chain.stream(
    { context, input: question, chat_history: history },
    { callbacks }
  );

  for await (const chunk of stream) {
    fullResponse += chunk;
    emitQueryStream(queryId, userId, chunk, false);
  }

  emitQueryStream(queryId, userId, '', true);

  return fullResponse;
}

/**
 * Ask a question with real-time streaming response
 *
 * @param {Object} ragService - RAG service instance (provides shared methods)
 * @param {string} question - User's question
 * @param {Object} options - Query options
 * @param {string} options.conversationId - Conversation ID (required)
 * @param {string} options.userId - User ID for WebSocket targeting (required)
 * @param {string} [options.queryId] - Optional query ID
 * @param {Object|null} [options.filters=null] - Qdrant filters
 * @returns {Promise<Object>} RAG result with answer, sources, and validation
 */
export async function askWithStreaming(ragService, question, options = {}) {
  const { conversationId, userId, queryId = randomUUID(), filters = null } = options;

  if (!conversationId) throw new Error('conversationId is required');
  if (!userId) throw new Error('userId is required for streaming');

  await ragService._ensureInitialized();

  const startTime = Date.now();
  const requestId = randomUUID();

  ragService.logger.info('Processing streaming RAG question', {
    service: 'rag',
    conversationId,
    userId,
    queryId,
    questionLength: question.length,
    requestId,
  });

  emitQueryStart(queryId, userId, { question });

  try {
    // Check cache first
    const cached = await ragService.cache.get(question, conversationId);
    if (cached) {
      await streamCachedResponse(cached, queryId, userId, startTime);
      return ragService._handleCacheHit(cached, question, requestId, conversationId);
    }

    emitQueryThinking(queryId, userId, 'Analyzing your question...');

    // Verify conversation exists
    const conversation = await ragService.Conversation.findById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const workspaceId = conversation.workspaceId || 'default';

    // Fetch history from database
    const messages = await ragService.Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 });
    const history = ragService._convertToHistory(messages);

    // Build memory context
    let memoryContext = { entityContext: '', summaryContext: '' };
    try {
      memoryContext = await entityMemory.buildMemoryContext(question, workspaceId, conversationId);
    } catch (memoryError) {
      ragService.logger.warn('Failed to build memory context', {
        service: 'rag',
        error: memoryError.message,
      });
    }

    emitQueryRetrieving(queryId, userId, { message: 'Searching relevant documents...' });

    // Rephrase query based on history
    const searchQuery = await ragService._rephraseQuery(question, history);

    // Build filters
    let qdrantFilter = null;
    try {
      qdrantFilter = buildQdrantFilter(filters, workspaceId);
    } catch (filterError) {
      emitQueryError(queryId, userId, filterError);
      throw filterError;
    }

    // Retrieve and process documents
    const retrieval = await performMultiQueryRetrieval(
      searchQuery,
      ragService.retriever,
      ragService.vectorStore,
      qdrantFilter,
      ragService.logger
    );

    emitQueryRetrieving(queryId, userId, {
      message: `Found ${retrieval.documents.length} relevant documents`,
      documentsFound: retrieval.documents.length,
    });

    const rerankedDocs = rerankDocuments(retrieval.documents, searchQuery, 5);
    const compressedDocs = await compressDocuments(rerankedDocs, question);
    const { context: docContext, sources } = ragService._prepareContext(compressedDocs);

    emitQuerySources(queryId, userId, sources);

    // Combine context
    const contextParts = [];
    if (memoryContext.summaryContext) {
      contextParts.push(`[Document Overviews]\n${memoryContext.summaryContext}`);
    }
    if (memoryContext.entityContext) {
      contextParts.push(memoryContext.entityContext);
    }
    contextParts.push(docContext);
    const context = contextParts.join('\n\n---\n\n');

    emitQueryThinking(queryId, userId, 'Generating answer...');

    // Generate answer with streaming
    const response = await generateAnswerWithStreaming(
      ragService.llm,
      question,
      context,
      history,
      queryId,
      userId,
      {
        runName: 'rag-query-streaming',
        sourcesCount: compressedDocs.length,
        sessionId: conversationId,
      }
    );

    // Process answer (validation)
    const { validation, citedSources } = await ragService._processAnswer(
      response,
      sources,
      question,
      context
    );

    // Save messages to database
    await ragService._saveMessages(conversationId, question, response);

    // Build result
    const result = await ragService._buildAndCacheResult({
      answer: response,
      sources,
      validation,
      citedSources,
      question,
      requestId,
      conversationId,
      retrievalMetrics: retrieval.metrics,
      startTime,
    });

    emitQueryComplete(queryId, userId, {
      answer: response,
      sources: citedSources,
      confidence: validation.confidence,
      processingTime: Date.now() - startTime,
    });

    return result;
  } catch (error) {
    ragService.logger.error('Streaming query error', {
      service: 'rag',
      queryId,
      error: error.message,
      stack: error.stack,
    });

    emitQueryError(queryId, userId, error);
    throw error;
  }
}
