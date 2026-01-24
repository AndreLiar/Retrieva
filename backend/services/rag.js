import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';

// Prompts
import { ragPrompt } from '../prompts/ragPrompt.js';

// Extracted modules
import { rerankDocuments } from './rag/documentRanking.js';
import { evaluateAnswer, extractCitedSources, toValidationResult } from './rag/llmJudge.js';
import { compressDocuments, initChains } from './rag/retrievalEnhancements.js';
import { formatContext, formatSources } from '../utils/rag/contextFormatter.js';
import { sanitizeDocuments, sanitizeFormattedContext } from '../utils/security/contextSanitizer.js';
import { sanitizeLLMOutput } from '../utils/security/outputSanitizer.js';
import { scanOutputForSensitiveInfo } from '../utils/security/piiMasker.js';
import { applyConfidenceHandling } from '../utils/security/confidenceHandler.js';
import {
  buildQdrantFilter,
  performMultiQueryRetrieval,
  retrieveAdditionalDocuments,
} from './rag/queryRetrieval.js';
import { trackQueryAnalytics, buildRAGResult } from './rag/analyticsTracker.js';
import { guardrailsConfig } from '../config/guardrails.js';

// Streaming module
import { askWithStreaming } from './rag/ragStreaming.js';

// M3 Compressed Memory Layer
import { entityMemory } from './memory/entityMemory.js';

// LangSmith tracing
import { getCallbacks } from '../config/langsmith.js';

// Default dependencies
import { llm as defaultLlm } from '../config/llm.js';
import { getVectorStore as defaultVectorStoreFactory } from '../config/vectorStore.js';
import { ragCache as defaultCache } from '../utils/rag/ragCache.js';
import { answerFormatter as defaultAnswerFormatter } from './answerFormatter.js';
import defaultLogger from '../config/logger.js';
import { Analytics as DefaultAnalytics } from '../models/Analytics.js';
import { Message as DefaultMessage } from '../models/Message.js';
import { Conversation as DefaultConversation } from '../models/Conversation.js';

/**
 * @typedef {Object} RAGDependencies
 * @property {Object} llm - LangChain LLM instance
 * @property {Function} vectorStoreFactory - Factory to create vector store
 * @property {Object} cache - Cache instance
 * @property {Object} answerFormatter - Answer formatter service
 * @property {Object} logger - Logger instance
 * @property {Object} models - Mongoose models
 */

/**
 * @typedef {Object} Source
 * @property {number} sourceNumber - Source index
 * @property {string} title - Document title
 * @property {string} url - Document URL
 * @property {string} [section] - Section within document
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isLowQuality - Whether answer quality is low
 * @property {number} confidence - Confidence score (0-1)
 * @property {string[]} issues - List of quality issues
 * @property {number} citationCount - Number of citations found
 * @property {number} validCitationCount - Number of valid citations
 * @property {boolean} meetsMinConfidence - Whether it meets threshold
 */

/**
 * @typedef {Object} RAGResult
 * @property {string} answer - Raw answer text
 * @property {Object} formattedAnswer - Formatted answer with structure
 * @property {Source[]} sources - Source documents used
 * @property {ValidationResult} validation - Answer validation results
 * @property {Source[]} citedSources - Sources actually cited
 * @property {Object} [retrievalMetrics] - Retrieval performance metrics
 * @property {string} [conversationId] - Conversation ID if applicable
 * @property {number} totalTime - Total processing time in ms
 */

/**
 * @typedef {Object} GenerationContext
 * @property {string} context - Formatted context string
 * @property {Source[]} sources - Source documents
 * @property {Object[]} sanitizedDocs - Sanitized document objects
 */

/**
 * RAG Service with Dependency Injection
 */
class RAGService {
  constructor(dependencies = {}) {
    this.llm = dependencies.llm || defaultLlm;
    this.vectorStoreFactory = dependencies.vectorStoreFactory || defaultVectorStoreFactory;
    this.cache = dependencies.cache || defaultCache;
    this.answerFormatter = dependencies.answerFormatter || defaultAnswerFormatter;
    this.logger = dependencies.logger || defaultLogger;

    const models = dependencies.models || {};
    this.Analytics = models.Analytics || DefaultAnalytics;
    this.Message = models.Message || DefaultMessage;
    this.Conversation = models.Conversation || DefaultConversation;

    this.retriever = null;
    this.rephraseChain = null;
    this.vectorStore = null;
    this._initialized = false;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    if (this._initialized) return;

    this._initPromise = this._doInit();
    await this._initPromise;
    this._initPromise = null;
  }

  async _doInit() {
    this.logger.info('Initializing RAG system for Notion...', { service: 'rag' });

    const vectorStore = await this.vectorStoreFactory([]);
    this.retriever = vectorStore.asRetriever({ k: 15, searchType: 'similarity' });
    this.vectorStore = vectorStore;

    this.logger.info('RAG system initialized successfully (connected to Qdrant)', {
      service: 'rag',
    });

    const historyAwarePrompt = ChatPromptTemplate.fromMessages([
      new MessagesPlaceholder('chat_history'),
      ['user', '{input}'],
      [
        'user',
        'Given the above conversation, generate a search query to look up in order to get information relevant to the conversation',
      ],
    ]);

    this.rephraseChain = historyAwarePrompt.pipe(this.llm).pipe(new StringOutputParser());
    initChains();
    this._initialized = true;
  }

  async _ensureInitialized() {
    if (!this._initialized) await this.init();
  }

  _convertToHistory(messages) {
    return messages.map((msg) =>
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
    );
  }

  async _rephraseQuery(question, history) {
    if (history.length === 0) return question;

    const rephrased = await this.rephraseChain.invoke({ input: question, chat_history: history });
    this.logger.info('Rephrased query for context', {
      service: 'rag',
      originalQuery: question,
      rephrasedQuery: rephrased,
    });
    return rephrased;
  }

  _prepareContext(docs) {
    const sanitizedDocs = sanitizeDocuments(docs);
    const rawContext = formatContext(sanitizedDocs);
    const context = sanitizeFormattedContext(rawContext);
    const sources = formatSources(sanitizedDocs);

    return { context, sources, sanitizedDocs };
  }

  async _generateAnswer(question, context, history, metadata = {}) {
    const chain = ragPrompt.pipe(this.llm).pipe(new StringOutputParser());
    const callbacks = getCallbacks({
      runName: metadata.runName || 'rag-query',
      metadata: {
        questionLength: question.length,
        sourcesCount: metadata.sourcesCount || 0,
        hasHistory: history.length > 0,
        ...metadata,
      },
      sessionId: metadata.sessionId,
    });

    return chain.invoke({ context, input: question, chat_history: history }, { callbacks });
  }

  async _processAnswer(response, sources, question, context = '') {
    const judgeEvaluation = await evaluateAnswer(question, response, sources, context);
    const validation = toValidationResult(judgeEvaluation);
    const citedSources = extractCitedSources(judgeEvaluation, sources);

    this.logger.info('LLM Judge evaluated answer', {
      service: 'rag',
      answerLength: response?.length || 0,
      confidence: validation.confidence.toFixed(2),
      isGrounded: validation.isGrounded,
      hasHallucinations: validation.hasHallucinations,
      citationCount: citedSources.length,
    });

    return { validation, citedSources };
  }

  async _buildAndCacheResult({
    answer,
    sources,
    validation,
    citedSources,
    question,
    requestId,
    conversationId = null,
    retrievalMetrics = null,
    startTime,
    extraData = {},
  }) {
    // SECURITY FIX (LLM02): Sanitize LLM output before formatting/rendering
    const sanitization = sanitizeLLMOutput(answer, {
      encodeHtml: true,
      removeDangerous: true,
      detectSuspicious: true,
      preserveMarkdown: true,
    });

    let sanitizedAnswer = sanitization.text;

    if (sanitization.modified) {
      this.logger.warn('LLM output was sanitized', {
        service: 'rag',
        requestId,
        suspicious: sanitization.suspicious,
        categories: sanitization.categories,
      });
    }

    // SECURITY FIX (LLM06): Scan output for PII and sensitive information
    const sensitiveInfoScan = scanOutputForSensitiveInfo(sanitizedAnswer, {
      maskSensitive: true,
      logDetections: true,
      strictMode: process.env.GUARDRAIL_STRICT_MODE === 'true',
    });

    if (!sensitiveInfoScan.clean) {
      this.logger.warn('Sensitive information detected and masked in output', {
        service: 'rag',
        requestId,
        summary: sensitiveInfoScan.summary,
        promptLeakDetected: sensitiveInfoScan.promptLeakDetected,
        hasCriticalLeak: sensitiveInfoScan.hasCriticalLeak,
      });
      sanitizedAnswer = sensitiveInfoScan.text;
    }

    const formattedAnswer = await this.answerFormatter.format(sanitizedAnswer, question);

    const result = buildRAGResult({
      answer: sanitizedAnswer,
      formattedAnswer,
      sources,
      validation,
      citedSources,
      retrievalMetrics,
      conversationId,
      totalTime: Date.now() - startTime,
      _outputSanitized: sanitization.modified,
      _sensitiveInfoFiltered: !sensitiveInfoScan.clean,
      ...extraData,
    });

    await trackQueryAnalytics({
      Analytics: this.Analytics,
      cache: this.cache,
      logger: this.logger,
      requestId,
      question,
      cacheHit: false,
      citedSources,
      conversationId,
    });

    // SECURITY FIX (LLM09): Apply confidence handling to prevent overreliance
    const finalResult = applyConfidenceHandling(result);

    // Only cache if not blocked (don't cache low-quality blocked responses)
    if (!finalResult._confidenceBlocked) {
      await this.cache.set(question, finalResult, conversationId);
    }

    return finalResult;
  }

  async _handleCacheHit(cached, question, requestId, conversationId = null) {
    this.logger.info('Returning cached answer', { service: 'rag', requestId });
    await trackQueryAnalytics({
      Analytics: this.Analytics,
      cache: this.cache,
      logger: this.logger,
      requestId,
      question,
      cacheHit: true,
      citedSources: cached.sources || [],
      conversationId,
    });
    return cached;
  }

  async askWithConversation(question, options = {}) {
    const { conversationId, filters = null } = options;

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    await this._ensureInitialized();

    const startTime = Date.now();
    const requestId = randomUUID();

    this.logger.info('Processing RAG question', {
      service: 'rag',
      conversationId,
      questionLength: question.length,
      requestId,
    });

    const cached = await this.cache.get(question, conversationId);
    if (cached) {
      return this._handleCacheHit(cached, question, requestId, conversationId);
    }

    const conversation = await this.Conversation.findById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const workspaceId = conversation.workspaceId || 'default';

    const messages = await this.Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 });
    const history = this._convertToHistory(messages);

    let memoryContext = { entityContext: '', summaryContext: '' };
    try {
      memoryContext = await entityMemory.buildMemoryContext(question, workspaceId, conversationId);
      if (memoryContext.entityContext || memoryContext.summaryContext) {
        this.logger.info('Built M3 memory context', {
          service: 'rag',
          entitiesCount: memoryContext.mentionedEntities?.length || 0,
          summariesCount: memoryContext.relevantSummaries?.length || 0,
        });
      }
    } catch (memoryError) {
      this.logger.warn('Failed to build memory context, continuing without', {
        service: 'rag',
        error: memoryError.message,
      });
    }

    const searchQuery = await this._rephraseQuery(question, history);

    let qdrantFilter = null;
    try {
      qdrantFilter = buildQdrantFilter(filters, workspaceId);
      this.logger.info('Applied Qdrant filters with workspace isolation', {
        service: 'rag',
        workspaceId,
        hasUserFilters: !!filters,
        filterConditions: qdrantFilter?.must?.length || 0,
      });
    } catch (filterError) {
      this.logger.warn('Filter validation failed', {
        service: 'rag',
        error: filterError.message,
        filters,
      });
      const error = new Error(filterError.message);
      error.statusCode = 400;
      error.isValidationError = true;
      throw error;
    }

    const retrieval = await performMultiQueryRetrieval(
      searchQuery,
      this.retriever,
      this.vectorStore,
      qdrantFilter,
      this.logger
    );

    const rerankedDocs = rerankDocuments(retrieval.documents, searchQuery, 5);
    this.logger.info(`Re-ranked to top ${rerankedDocs.length} documents`, {
      service: 'rag',
      topScores: rerankedDocs.map((d) => d.score?.toFixed(4)),
    });

    const compressedDocs = await compressDocuments(rerankedDocs, question);
    const { context: docContext, sources } = this._prepareContext(compressedDocs);

    const contextParts = [];
    if (memoryContext.summaryContext) {
      contextParts.push(`[Document Overviews]\n${memoryContext.summaryContext}`);
    }
    if (memoryContext.entityContext) {
      contextParts.push(memoryContext.entityContext);
    }
    contextParts.push(docContext);
    const context = contextParts.join('\n\n---\n\n');

    try {
      const response = await this._generateAnswer(question, context, history, {
        runName: 'rag-query',
        sourcesCount: compressedDocs.length,
        sessionId: conversationId,
      });

      const { validation, citedSources } = await this._processAnswer(
        response,
        sources,
        question,
        context
      );

      // SECURITY FIX (LLM04): Apply retry guardrails to prevent DoS
      const retryConfig = guardrailsConfig.generation.retry;
      const shouldRetry =
        retryConfig.enabled &&
        validation.isLowQuality &&
        validation.confidence >= retryConfig.minConfidenceForRetry &&
        retrieval.documents.length < 50;

      if (shouldRetry) {
        // Apply cooldown before retry to prevent rapid resource consumption
        if (retryConfig.cooldownMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryConfig.cooldownMs));
        }

        const retryResult = await this._retryWithMoreContext({
          question,
          retrieval,
          qdrantFilter,
          searchQuery,
          history,
          sources,
          conversationId,
          startTime,
          requestId,
          retryTimeout: retryConfig.retryTimeoutMs,
        });
        if (retryResult) return retryResult;
      }

      await this._saveMessages(conversationId, question, response);

      return this._buildAndCacheResult({
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
    } catch (error) {
      this.logger.error('Error generating answer', {
        service: 'rag',
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * SECURITY FIX (LLM04): Retry with resource limits
   * - Limited document count for retry
   * - Timeout on retry operations
   * - Abort capability for cancellation
   */
  async _retryWithMoreContext({
    question,
    retrieval,
    qdrantFilter,
    searchQuery,
    history,
    sources,
    conversationId,
    startTime,
    requestId,
    retryTimeout = guardrailsConfig.generation.retry.retryTimeoutMs,
  }) {
    const retryStartTime = Date.now();
    this.logger.warn('Low quality answer detected - attempting retry with more sources', {
      service: 'rag',
      retryTimeout,
    });

    // SECURITY FIX (LLM04): Limit retry documents to prevent excessive resource usage
    const maxRetryDocs = guardrailsConfig.retrieval.maxRetryDocuments;

    try {
      const uniqueRetryDocs = await retrieveAdditionalDocuments(
        retrieval.allQueries,
        this.retriever,
        this.vectorStore,
        qdrantFilter,
        retrieval.documents
      );

      // Limit documents for retry to conserve resources
      const limitedDocs = uniqueRetryDocs.slice(0, maxRetryDocs);
      const rerankedRetryDocs = rerankDocuments(
        limitedDocs,
        searchQuery,
        Math.min(10, maxRetryDocs)
      );
      const compressedRetryDocs = await compressDocuments(rerankedRetryDocs, question);
      const { context: retryContext } = this._prepareContext(compressedRetryDocs);

      // Check if we've exceeded retry timeout before expensive LLM call
      const elapsedTime = Date.now() - retryStartTime;
      if (elapsedTime > retryTimeout * 0.8) {
        this.logger.warn('Retry timeout approaching, skipping LLM call', {
          service: 'rag',
          elapsed: elapsedTime,
          timeout: retryTimeout,
        });
        return null;
      }

      const retryResponse = await this._generateAnswer(question, retryContext, history, {
        runName: 'rag-query-retry',
        sourcesCount: compressedRetryDocs.length,
        sessionId: conversationId,
      });

      const { validation: retryValidation, citedSources } = await this._processAnswer(
        retryResponse,
        sources,
        question,
        retryContext
      );

      if (retryValidation.confidence > 0.2) {
        this.logger.info('Retry improved answer quality', {
          service: 'rag',
          retryConfidence: retryValidation.confidence.toFixed(2),
          retryDuration: Date.now() - retryStartTime,
        });

        await this._saveMessages(conversationId, question, retryResponse);

        return this._buildAndCacheResult({
          answer: retryResponse,
          sources,
          validation: retryValidation,
          citedSources,
          question,
          requestId,
          conversationId,
          retrievalMetrics: retrieval.metrics,
          startTime,
          extraData: { retriedWithMoreContext: true, retryDuration: Date.now() - retryStartTime },
        });
      }

      return null;
    } catch (error) {
      // SECURITY FIX (LLM04): Don't let retry failures crash the request
      this.logger.error('Retry attempt failed', {
        service: 'rag',
        error: error.message,
        retryDuration: Date.now() - retryStartTime,
      });
      return null;
    }
  }

  async _saveMessages(conversationId, question, response) {
    await this.Message.create({ conversationId, role: 'user', content: question });
    await this.Message.create({ conversationId, role: 'assistant', content: response });
    await this.Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
    });
    this.logger.info('Saved messages to database', { service: 'rag', conversationId });
  }

  /**
   * Ask a question with real-time streaming response
   * Delegates to the extracted streaming module
   */
  async askWithStreaming(question, options = {}) {
    return askWithStreaming(this, question, options);
  }
}

export async function createRAGService(dependencies = {}) {
  const service = new RAGService(dependencies);
  await service.init();
  return service;
}

export function createRAGServiceSync(dependencies = {}) {
  return new RAGService(dependencies);
}

let _singletonInstance = null;
let _singletonPromise = null;

export async function getRAGService() {
  if (_singletonInstance) return _singletonInstance;
  if (_singletonPromise) return _singletonPromise;

  _singletonPromise = createRAGService();
  _singletonInstance = await _singletonPromise;
  _singletonPromise = null;
  return _singletonInstance;
}

export function resetRAGService() {
  _singletonInstance = null;
  _singletonPromise = null;
}

export const ragService = new RAGService();
export { RAGService };
