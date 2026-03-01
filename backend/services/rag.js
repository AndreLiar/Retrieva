import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

// Prompts
import { ragPrompt } from '../prompts/ragPrompt.js';

// LLM timeout protection
import {
  invokeWithTimeout,
  streamWithTimeout,
  LLMTimeoutError,
} from '../utils/core/asyncHelpers.js';

// Extracted modules
import { rerankDocuments } from './rag/documentRanking.js';
import { evaluateAnswer, extractCitedSources, toValidationResult } from './rag/llmJudge.js';
import { compressDocuments, initChains } from './rag/retrievalEnhancements.js';
import { formatContext, formatSources } from '../utils/rag/contextFormatter.js';
import { sanitizeDocuments, sanitizeFormattedContext } from '../utils/security/contextSanitizer.js';
import { sanitizeLLMOutput } from '../utils/security/outputSanitizer.js';
import { scanOutputForSensitiveInfo } from '../utils/security/piiMasker.js';
import { applyConfidenceHandling } from '../utils/security/confidenceHandler.js';
import { processCitations, analyzeCitationCoverage } from '../utils/rag/citationValidator.js';
import { processOutput } from '../utils/rag/outputValidator.js';
import { buildQdrantFilter, retrieveAdditionalDocuments } from './rag/queryRetrieval.js';
import { trackQueryAnalytics, buildRAGResult } from './rag/analyticsTracker.js';

// Inline guardrails config (guardrails.js removed in MVP)
const guardrailsConfig = {
  output: {
    hallucinationBlocking: { strictMode: false },
    confidenceHandling: {
      messages: {
        blocked:
          "I don't have enough reliable information to answer this question accurately. Please try rephrasing or check your source documents.",
      },
    },
    piiMasking: { enabled: false },
  },
  generation: {
    retry: {
      enabled: false,
      minConfidenceForRetry: 0.3,
      cooldownMs: 0,
      retryTimeoutMs: 30000,
    },
  },
  retrieval: {
    maxRetryDocuments: 20,
    sparseSearch: { useInvertedIndex: false },
  },
};

import { getCallbacks } from '../config/langsmith.js';

// Default dependencies
import { getDefaultLLM } from '../config/llm.js';
import { getVectorStore as defaultVectorStoreFactory } from '../config/vectorStore.js';
import { ragCache as defaultCache } from '../utils/rag/ragCache.js';
import { answerFormatter as defaultAnswerFormatter } from './answerFormatter.js';
import defaultLogger from '../config/logger.js';
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
    this._injectedLLM = dependencies.llm || null;
    this.llm = null; // Will be set during init()
    this.vectorStoreFactory = dependencies.vectorStoreFactory || defaultVectorStoreFactory;
    this.cache = dependencies.cache || defaultCache;
    this.answerFormatter = dependencies.answerFormatter || defaultAnswerFormatter;
    this.logger = dependencies.logger || defaultLogger;

    const models = dependencies.models || {};
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
    this.logger.info('Initializing RAG system...', { service: 'rag' });

    // Initialize LLM - use injected LLM or get from provider factory
    if (this._injectedLLM) {
      this.llm = this._injectedLLM;
      this.logger.info('Using injected LLM instance', { service: 'rag' });
    } else {
      this.llm = await getDefaultLLM();
      this.logger.info('LLM initialized from provider factory', { service: 'rag' });
    }

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
    await initChains();
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

  async _resolveQdrantWorkspaceId(workspaceId) {
    if (!workspaceId || workspaceId === 'default') return 'default';
    return String(workspaceId);
  }

  async _generateAnswer(question, context, history, metadata = {}) {
    const chain = ragPrompt.pipe(this.llm).pipe(new StringOutputParser());
    const callbacks = getCallbacks({
      runName: 'rag-answer-generation',
      feature: 'rag',
      userId: metadata.userId,
      workspaceId: metadata.workspaceId,
      sessionId: metadata.conversationId,
    });

    const invokeInput = {
      context,
      input: question,
      chat_history: history,
      responseInstruction: metadata.responseInstruction || '',
    };

    // Timeout configuration (in ms)
    const LLM_INVOKE_TIMEOUT = parseInt(process.env.LLM_INVOKE_TIMEOUT) || 60000; // 60s default
    const LLM_STREAM_INITIAL_TIMEOUT = parseInt(process.env.LLM_STREAM_INITIAL_TIMEOUT) || 30000; // 30s for first chunk
    const LLM_STREAM_CHUNK_TIMEOUT = parseInt(process.env.LLM_STREAM_CHUNK_TIMEOUT) || 10000; // 10s between chunks

    // If onEvent callback is provided, stream with timeout protection
    if (metadata.onEvent) {
      let fullResponse = '';
      try {
        const stream = streamWithTimeout(
          chain,
          invokeInput,
          { callbacks },
          LLM_STREAM_INITIAL_TIMEOUT,
          LLM_STREAM_CHUNK_TIMEOUT
        );
        for await (const chunk of stream) {
          fullResponse += chunk;
          metadata.onEvent('chunk', { text: chunk });
        }
        return fullResponse;
      } catch (error) {
        if (error instanceof LLMTimeoutError) {
          this.logger.error('LLM stream timed out', {
            service: 'rag',
            operation: error.operation,
            timeoutMs: error.timeoutMs,
            partialResponse: fullResponse.length > 0,
          });
          // Return partial response if we have one, otherwise throw
          if (fullResponse.length > 0) {
            this.logger.warn('Returning partial response after timeout', {
              service: 'rag',
              responseLength: fullResponse.length,
            });
            return fullResponse + '\n\n[Response interrupted due to timeout]';
          }
        }
        throw error;
      }
    }

    // Non-streaming invoke with timeout protection
    try {
      return await invokeWithTimeout(chain, invokeInput, { callbacks }, LLM_INVOKE_TIMEOUT);
    } catch (error) {
      if (error instanceof LLMTimeoutError) {
        this.logger.error('LLM invoke timed out', {
          service: 'rag',
          operation: error.operation,
          timeoutMs: error.timeoutMs,
        });
      }
      throw error;
    }
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
    workspaceId = null,
    retrievalMetrics = null,
    startTime,
    extraData = {},
  }) {
    // FIX #2: Output schema validation - ensure answer meets quality standards
    const outputValidation = processOutput(answer, {
      strict: false,
      minLength: 10,
    });

    if (!outputValidation.valid) {
      this.logger.warn('LLM output failed schema validation', {
        service: 'rag',
        requestId,
        errors: outputValidation.errors,
        warnings: outputValidation.warnings,
      });
    }

    let processedAnswer = outputValidation.content;

    // FIX #1: Citation validation - ensure [Source N] references are valid
    const citationValidation = processCitations(processedAnswer, sources, {
      removeInvalid: true,
      logWarnings: true,
    });

    if (!citationValidation.valid) {
      this.logger.warn('Invalid citations detected and corrected', {
        service: 'rag',
        requestId,
        invalidCitations: citationValidation.invalidCitations,
        validCitations: citationValidation.validCitations,
      });
      processedAnswer = citationValidation.text;
    }

    // Analyze citation coverage for quality metrics
    const coverageAnalysis = analyzeCitationCoverage(processedAnswer);

    // SECURITY FIX (LLM02): Sanitize LLM output before formatting/rendering
    const sanitization = sanitizeLLMOutput(processedAnswer, {
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
      _citationValidation: {
        valid: citationValidation.valid,
        invalidCitations: citationValidation.invalidCitations,
        coverage: coverageAnalysis.coverage,
        meetsCoverage: coverageAnalysis.meetsCoverage,
      },
      _outputValidation: {
        valid: outputValidation.valid,
        warnings: outputValidation.warnings,
        metadata: outputValidation.metadata,
      },
      ...extraData,
    });

    await trackQueryAnalytics({
      Analytics: null,
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
    // SECURITY: workspaceId required for tenant isolation
    if (!finalResult._confidenceBlocked && workspaceId) {
      await this.cache.set(question, finalResult, workspaceId, conversationId);
    }

    return finalResult;
  }

  async _handleCacheHit(cached, question, requestId, conversationId = null, workspaceId = null) {
    this.logger.info('Returning cached answer', { service: 'rag', requestId, workspaceId });
    await trackQueryAnalytics({
      Analytics: null,
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
    const {
      conversationId,
      filters = null,
      onEvent = null,
      responseInstruction: callerInstruction = '',
    } = options;

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    // ISSUE #31 FIX: Validated emit wrapper for streaming events
    const rawEmit = onEvent || (() => {});
    const emit = this._createValidatedEmit(rawEmit);
    await this._ensureInitialized();

    const startTime = Date.now();
    const requestId = randomUUID();

    // SECURITY: Get conversation and workspaceId BEFORE cache check for tenant isolation
    const conversation = await this.Conversation.findById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const workspaceId = conversation.workspaceId || 'default';

    this.logger.info('Processing RAG question', {
      service: 'rag',
      conversationId,
      workspaceId,
      questionLength: question.length,
      requestId,
      streaming: !!onEvent,
    });

    // Check cache (SECURITY: workspaceId included for tenant isolation)
    const cached = await this.cache.get(question, workspaceId, conversationId);
    if (cached) {
      if (onEvent) {
        emit('status', { message: 'Found cached answer...' });
        for (const char of cached.answer || '') {
          emit('chunk', { text: char });
        }
        if (cached.sources) emit('sources', { sources: cached.sources });
        emit('done', { message: 'Streaming complete' });
      }
      return this._handleCacheHit(cached, question, requestId, conversationId, workspaceId);
    }

    const messages = await this.Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 });
    const history = this._convertToHistory(messages);

    const memoryContext = { entityContext: '', summaryContext: '' };

    emit('status', { message: 'Retrieving context...', queryId: requestId });

    const searchQuery = await this._rephraseQuery(question, history);

    // Resolve workspace UUID for Qdrant filtering
    const qdrantWorkspaceId = await this._resolveQdrantWorkspaceId(workspaceId);

    let qdrantFilter = null;
    try {
      qdrantFilter = buildQdrantFilter(filters, qdrantWorkspaceId);
      this.logger.info('Applied Qdrant filters with workspace isolation', {
        service: 'rag',
        workspaceId: qdrantWorkspaceId,
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

    // Direct vector store retrieval
    const rawDocs = await this.vectorStore.similaritySearch(searchQuery, 15, qdrantFilter);
    const rerankedDocs = rerankDocuments(rawDocs, searchQuery, 15);

    const retrieval = {
      documents: rerankedDocs,
      allQueries: [searchQuery],
      metrics: {
        strategy: 'direct',
        docsCollected: rawDocs.length,
        docsAfterRerank: rerankedDocs.length,
      },
    };

    this.logger.info('Retrieval complete', {
      service: 'rag',
      requestId,
      docsCollected: rawDocs.length,
      docsAfterRerank: rerankedDocs.length,
    });

    const { context: docContext, sources } = this._prepareContext(retrieval.documents);

    // Retrieval trace logging (gated by env var)
    if (process.env.LOG_RETRIEVAL_TRACE === 'true') {
      const tinyThreshold = 50;
      const chunks = retrieval.documents.map((doc) => ({
        sourceId: doc.metadata?.sourceId || null,
        documentTitle: doc.metadata?.documentTitle || null,
        headingPath: doc.metadata?.heading_path || [],
        estimatedTokens:
          doc.metadata?.estimatedTokens || Math.ceil((doc.pageContent?.length || 0) / 4),
        rrfScore: doc.rrfScore || doc.score || null,
        block_type: doc.metadata?.block_type || null,
      }));
      const tinyChunkCount = chunks.filter((c) => c.estimatedTokens < tinyThreshold).length;

      this.logger.debug('Retrieval trace', {
        service: 'rag-trace',
        requestId,
        query: searchQuery,
        chunks,
        retrievedChunkCount: chunks.length,
        tinyChunkCount,
      });
    }

    emit('sources', { sources });

    const contextParts = [];
    if (memoryContext.summaryContext) {
      contextParts.push(`[Document Overviews]\n${memoryContext.summaryContext}`);
    }
    if (memoryContext.entityContext) {
      contextParts.push(memoryContext.entityContext);
    }
    contextParts.push(docContext);
    const context = contextParts.join('\n\n---\n\n');

    emit('status', { message: 'Generating answer...' });

    try {
      const combinedInstruction = callerInstruction || '';

      const response = await this._generateAnswer(question, context, history, {
        runName: 'rag-query',
        sourcesCount: retrieval.documents.length,
        sessionId: conversationId,
        onEvent: onEvent || undefined,
        responseInstruction: combinedInstruction,
      });

      emit('status', { message: 'Evaluating answer...' });

      const { validation, citedSources } = await this._processAnswer(
        response,
        sources,
        question,
        context
      );

      // FIX #3: Stricter hallucination blocking
      // Block if hasHallucinations is true (strict mode) OR compound condition (legacy mode)
      const hallucinationConfig = guardrailsConfig.output.hallucinationBlocking || {};
      const shouldBlockHallucination = hallucinationConfig.strictMode
        ? validation.hasHallucinations // Strict: block on hallucination flag alone
        : validation.hasHallucinations && !validation.isGrounded; // Legacy: compound condition

      if (shouldBlockHallucination) {
        this.logger.warn('Hallucinated answer detected — replacing with fallback', {
          service: 'rag',
          confidence: validation.confidence.toFixed(2),
          hasHallucinations: validation.hasHallucinations,
          isGrounded: validation.isGrounded,
          strictMode: hallucinationConfig.strictMode,
          requestId,
        });

        const fallbackAnswer = guardrailsConfig.output.confidenceHandling.messages.blocked;
        emit('replace', { text: fallbackAnswer });

        await this._saveMessages(conversationId, question, fallbackAnswer);

        const result = await this._buildAndCacheResult({
          answer: fallbackAnswer,
          sources,
          validation,
          citedSources,
          question,
          requestId,
          conversationId,
          workspaceId,
          retrievalMetrics: retrieval.metrics,
          startTime,
          extraData: { _hallucinationBlocked: true },
        });

        emit('metadata', {
          confidence: validation.confidence,
          citationCount: citedSources.length,
          citedSources,
          isGrounded: validation.isGrounded,
          hasHallucinations: validation.hasHallucinations,
          isRelevant: validation.isRelevant,
          reasoning: validation.reasoning,
        });
        emit('saved', { conversationId });
        emit('done', { message: 'Streaming complete' });

        return result;
      }

      // SECURITY FIX (LLM04): Apply retry guardrails to prevent DoS
      const retryConfig = guardrailsConfig.generation.retry;
      const shouldRetry =
        retryConfig.enabled &&
        validation.isLowQuality &&
        validation.confidence >= retryConfig.minConfidenceForRetry &&
        retrieval.documents.length < 50;

      if (shouldRetry) {
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
        if (retryResult) {
          emit('metadata', {
            confidence: retryResult.validation?.confidence,
            citationCount: retryResult.citedSources?.length || 0,
            citedSources: retryResult.citedSources || [],
            retriedWithMoreContext: true,
          });
          emit('saved', { conversationId });
          emit('done', { message: 'Streaming complete' });
          return retryResult;
        }
      }

      await this._saveMessages(conversationId, question, response);

      const result = await this._buildAndCacheResult({
        answer: response,
        sources,
        validation,
        citedSources,
        question,
        requestId,
        conversationId,
        workspaceId,
        retrievalMetrics: retrieval.metrics,
        startTime,
      });

      emit('metadata', {
        confidence: validation.confidence,
        citationCount: citedSources.length,
        citedSources,
        qualityIssues: validation.issues,
        isGrounded: validation.isGrounded,
        hasHallucinations: validation.hasHallucinations,
        isRelevant: validation.isRelevant,
        reasoning: validation.reasoning,
      });
      emit('saved', { conversationId });
      emit('done', { message: 'Streaming complete' });

      return result;
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
    workspaceId,
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

      if (retryValidation.confidence > 0.2 && !retryValidation.hasHallucinations) {
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
          workspaceId,
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

  /**
   * ISSUE #31 FIX: Create validated emit wrapper for streaming events
   * Ensures event types and payloads match expected schemas
   * @param {Function} rawEmit - The raw emit function to wrap
   * @returns {Function} Validated emit function
   */
  _createValidatedEmit(rawEmit) {
    const validEventTypes = new Set(['status', 'chunk', 'sources', 'done', 'error', 'metadata']);

    const validatePayload = (type, data) => {
      if (typeof data !== 'object' || data === null) {
        return { valid: false, error: 'Payload must be an object' };
      }

      switch (type) {
        case 'status':
          if (typeof data.message !== 'string') {
            return { valid: false, error: 'status event requires message string' };
          }
          break;
        case 'chunk':
          if (typeof data.text !== 'string') {
            return { valid: false, error: 'chunk event requires text string' };
          }
          break;
        case 'sources':
          if (!Array.isArray(data.sources)) {
            return { valid: false, error: 'sources event requires sources array' };
          }
          break;
        case 'done':
          // done can have optional message
          break;
        case 'error':
          if (typeof data.message !== 'string') {
            return { valid: false, error: 'error event requires message string' };
          }
          break;
        case 'metadata':
          // metadata can have arbitrary structure
          break;
      }
      return { valid: true };
    };

    return (type, data) => {
      // Validate event type
      if (!validEventTypes.has(type)) {
        this.logger.warn('Invalid streaming event type', {
          type,
          validTypes: [...validEventTypes],
        });
        return;
      }

      // Validate payload
      const validation = validatePayload(type, data);
      if (!validation.valid) {
        this.logger.warn('Invalid streaming event payload', {
          type,
          error: validation.error,
        });
        return;
      }

      // Add timestamp to all events
      const enrichedData = {
        ...data,
        timestamp: Date.now(),
      };

      try {
        rawEmit(type, enrichedData);
      } catch (error) {
        this.logger.error('Error emitting streaming event', {
          type,
          error: error.message,
        });
      }
    };
  }

  /**
   * Save user and assistant messages to database
   * ISSUE #26 FIX: Use MongoDB transaction for atomicity
   * Ensures either both messages are saved or neither is
   */
  async _saveMessages(conversationId, question, response) {
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        // Create both messages within the transaction
        await this.Message.create([{ conversationId, role: 'user', content: question }], {
          session,
        });
        await this.Message.create([{ conversationId, role: 'assistant', content: response }], {
          session,
        });

        // Update conversation metadata
        await this.Conversation.findByIdAndUpdate(
          conversationId,
          {
            lastMessageAt: new Date(),
            $inc: { messageCount: 2 },
          },
          { session }
        );
      });

      this.logger.info('Saved messages to database', { service: 'rag', conversationId });
    } catch (error) {
      this.logger.error('Failed to save messages (transaction rolled back)', {
        service: 'rag',
        conversationId,
        error: error.message,
      });
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

export const ragService = new RAGService();
export { RAGService };
