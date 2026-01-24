/**
 * Intent-Aware RAG Service
 *
 * Wraps the core RAG service with intent classification and routing
 * - Classifies query intent before processing
 * - Routes to optimal retrieval strategy
 * - Generates intent-appropriate responses
 * - Skips RAG for non-retrieval intents
 * - Full context awareness (conversational, knowledge, task)
 *
 * @module services/intentAwareRAG
 */

import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { randomUUID } from 'crypto';

// Intent services
import { queryRouter, IntentType } from './intent/index.js';
import { executeStrategy } from './intent/retrievalStrategies.js';

// Extracted intent modules
import {
  handleNonRAGIntent,
  handleNoDocuments,
  handleOutOfScope,
} from './intent/intentHandlers.js';
import {
  buildFullContext,
  updateContextAfterInteraction,
  getStyleInstruction,
} from './intent/intentContextBuilder.js';

// Core RAG components
import { rerankDocuments } from './rag/documentRanking.js';
import { evaluateAnswer, toValidationResult, extractCitedSources } from './rag/llmJudge.js';
import { formatContext, formatSources } from '../utils/rag/contextFormatter.js';
import { sanitizeDocuments, sanitizeFormattedContext } from '../utils/security/contextSanitizer.js';
import { buildQdrantFilter } from './rag/queryRetrieval.js';
import { trackQueryAnalytics } from './rag/analyticsTracker.js';

// Memory services
import { entityMemory } from './memory/entityMemory.js';

// Context services
import {
  coreferenceResolver,
  sessionStateManager,
  userPreferenceManager,
  domainAwareness,
  conceptHierarchy,
  taskTracker,
} from './context/index.js';

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
 * @typedef {Object} IntentAwareResult
 * @property {string} answer - Generated answer
 * @property {Object} formattedAnswer - Formatted answer structure
 * @property {Array} sources - Source documents
 * @property {Object} validation - Answer validation
 * @property {Array} citedSources - Actually cited sources
 * @property {Object} intent - Intent classification details
 * @property {Object} routing - Routing decision details
 * @property {Object} metrics - Processing metrics
 * @property {string} conversationId - Conversation ID
 * @property {number} totalTime - Total processing time
 */

/**
 * Intent-Aware RAG Service
 */
class IntentAwareRAGService {
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
    this.vectorStore = null;
    this._initialized = false;
    this._initPromise = null;

    this.router = queryRouter;

    this.contextServices = {
      coreference: coreferenceResolver,
      session: sessionStateManager,
      preferences: userPreferenceManager,
      domain: domainAwareness,
      concepts: conceptHierarchy,
      tasks: taskTracker,
    };
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    if (this._initialized) return;

    this._initPromise = this._doInit();
    await this._initPromise;
    this._initPromise = null;
  }

  async _doInit() {
    this.logger.info('Initializing Intent-Aware RAG system...', { service: 'intent-rag' });

    const vectorStore = await this.vectorStoreFactory([]);
    this.retriever = vectorStore.asRetriever({ k: 15, searchType: 'similarity' });
    this.vectorStore = vectorStore;

    this.logger.info('Intent-Aware RAG system initialized', { service: 'intent-rag' });
    this._initialized = true;
  }

  async _ensureInitialized() {
    if (!this._initialized) await this.init();
  }

  /**
   * Process a query with intent awareness
   */
  async ask(question, options = {}) {
    const { conversationId, filters = null, forceIntent = null, userId = null } = options;

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    await this._ensureInitialized();

    const startTime = Date.now();
    const requestId = randomUUID();

    this.logger.info('Processing intent-aware query', {
      service: 'intent-rag',
      conversationId,
      questionLength: question.length,
      requestId,
    });

    const conversation = await this.Conversation.findById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const workspaceId = conversation.workspaceId || 'default';
    const effectiveUserId = userId || conversation.userId || 'anonymous';

    const messages = await this.Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 })
      .lean();

    // Build full context using extracted module
    const contextInfo = await buildFullContext(
      question,
      { conversationId, userId: effectiveUserId, workspaceId, messages },
      this.contextServices,
      this.logger
    );

    const processedQuery = contextInfo.resolvedQuery || question;

    // Check if query is out of scope
    if (!contextInfo.inScope && contextInfo.scopeConfidence > 0.7) {
      this.logger.info('Query out of scope', {
        service: 'intent-rag',
        reason: contextInfo.scopeReason,
      });

      return handleOutOfScope(
        question,
        contextInfo,
        { conversationId, startTime },
        {
          saveMessages: this._saveMessages.bind(this),
          answerFormatter: this.answerFormatter,
        }
      );
    }

    // Route the query
    const routing = await this.router.route(processedQuery, {
      conversationHistory: messages,
      forceIntent,
      contextInfo,
    });

    this.logger.info('Query routed', {
      service: 'intent-rag',
      intent: routing.intent,
      strategy: routing.strategy,
      skipRAG: routing.skipRAG,
      confidence: routing.confidence.toFixed(2),
    });

    // Handle non-RAG intents using extracted module
    if (routing.skipRAG) {
      return handleNonRAGIntent(
        question,
        routing,
        { conversationId, messages, startTime },
        {
          saveMessages: this._saveMessages.bind(this),
          answerFormatter: this.answerFormatter,
          generateClarificationResponse: this._generateClarificationResponse.bind(this),
        }
      );
    }

    // Check cache
    const cached = await this.cache.get(question, conversationId);
    if (cached) {
      this.logger.info('Returning cached answer', { service: 'intent-rag', requestId });
      return { ...cached, fromCache: true };
    }

    // Build filters
    let qdrantFilter = null;
    try {
      qdrantFilter = buildQdrantFilter(filters, workspaceId);
    } catch (error) {
      const validationError = new Error(error.message);
      validationError.statusCode = 400;
      validationError.isValidationError = true;
      throw validationError;
    }

    // Execute retrieval strategy
    const retrievalResult = await executeStrategy(
      routing.strategy,
      question,
      this.retriever,
      this.vectorStore,
      routing.config,
      {
        filter: qdrantFilter,
        entities: routing.entities,
        workspaceId,
        conversationContext: messages,
      }
    );

    // Handle no documents found using extracted module
    if (retrievalResult.documents.length === 0 && routing.intent !== IntentType.CLARIFICATION) {
      return handleNoDocuments(
        question,
        routing,
        { conversationId, startTime },
        {
          saveMessages: this._saveMessages.bind(this),
          answerFormatter: this.answerFormatter,
        }
      );
    }

    // Get memory context
    let memoryContext = { entityContext: '', summaryContext: '' };
    try {
      memoryContext = await entityMemory.buildMemoryContext(question, workspaceId, conversationId);
    } catch (error) {
      this.logger.warn('Failed to build memory context', {
        service: 'intent-rag',
        error: error.message,
      });
    }

    // Prepare context
    const sanitizedDocs = sanitizeDocuments(retrievalResult.documents);
    const rawContext = formatContext(sanitizedDocs);
    const docContext = sanitizeFormattedContext(rawContext);
    const sources = formatSources(sanitizedDocs);

    const contextParts = [];
    if (memoryContext.summaryContext) {
      contextParts.push(`[Document Overviews]\n${memoryContext.summaryContext}`);
    }
    if (memoryContext.entityContext) {
      contextParts.push(memoryContext.entityContext);
    }
    contextParts.push(docContext);
    const context = contextParts.join('\n\n---\n\n');

    // Generate response
    const response = await this._generateIntentAwareResponse(
      processedQuery,
      context,
      messages,
      routing,
      { conversationId, requestId, contextInfo, originalQuery: question }
    );

    // Evaluate answer
    const judgeEvaluation = await evaluateAnswer(question, response, sources, context);
    const validation = toValidationResult(judgeEvaluation);
    const citedSources = extractCitedSources(judgeEvaluation, sources);

    await this._saveMessages(conversationId, question, response);

    const formattedAnswer = await this.answerFormatter.format(response, question);

    const result = {
      answer: response,
      formattedAnswer,
      sources,
      validation,
      citedSources,
      intent: {
        type: routing.intent,
        confidence: routing.confidence,
        reasoning: routing.reasoning,
      },
      routing: {
        strategy: routing.strategy,
        config: routing.config,
        responseStyle: routing.responseStyle,
      },
      context: {
        originalQuery: question,
        resolvedQuery: contextInfo.resolvedQuery,
        hadCoreferences: contextInfo.hadCoreferences,
        conversationPhase: contextInfo.conversationPhase,
        currentTopic: contextInfo.currentTopic,
        hasActiveTask: contextInfo.hasActiveTask,
        taskProgress: contextInfo.taskProgress,
        relevantConcepts: contextInfo.relevantConcepts,
      },
      metrics: {
        ...retrievalResult.metrics,
        intentClassificationMs: routing.processingTimeMs,
        contextBuildMs: contextInfo.processingTimeMs,
      },
      conversationId,
      totalTime: Date.now() - startTime,
    };

    // Update context after interaction using extracted module
    await updateContextAfterInteraction(
      {
        conversationId,
        userId: effectiveUserId,
        workspaceId,
        query: processedQuery,
        response,
        intent: routing.intent,
        entities: routing.entities || [],
        topic: contextInfo.primaryConcept,
      },
      this.contextServices,
      this.logger
    );

    await trackQueryAnalytics({
      Analytics: this.Analytics,
      cache: this.cache,
      logger: this.logger,
      requestId,
      question,
      cacheHit: false,
      citedSources,
      conversationId,
      intent: routing.intent,
    });

    await this.cache.set(question, result, conversationId);

    this.logger.info('Intent-aware query complete', {
      service: 'intent-rag',
      intent: routing.intent,
      documentsUsed: retrievalResult.documents.length,
      confidence: validation.confidence.toFixed(2),
      totalTimeMs: result.totalTime,
    });

    return result;
  }

  async _generateIntentAwareResponse(question, context, history, routing, options) {
    const { conversationId, contextInfo = {} } = options;

    const styleInstruction = getStyleInstruction(contextInfo);
    const taskInstruction =
      contextInfo.hasActiveTask && contextInfo.taskContextStr
        ? `\n\nOngoing task context:\n${contextInfo.taskContextStr}`
        : '';
    const domainInstruction = contextInfo.domainContext ? `\n\n${contextInfo.domainContext}` : '';

    const systemPrompt = `You are a helpful knowledge assistant. ${routing.responsePrompt}
${domainInstruction}${taskInstruction}

Important guidelines:
- Only use information from the provided context
- Always cite sources using [1], [2], etc. notation
- If information is not in the context, say so
- ${styleInstruction}`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      ['user', `Context:\n{context}\n\nQuestion: {question}`],
    ]);

    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());

    const callbacks = getCallbacks({
      runName: `rag-${routing.intent}`,
      metadata: {
        intent: routing.intent,
        strategy: routing.strategy,
        phase: contextInfo.conversationPhase,
      },
      sessionId: conversationId,
    });

    return chain.invoke({ context, question }, { callbacks });
  }

  async _generateClarificationResponse(question, history, routing) {
    const recentContext = history
      .slice(-6)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are continuing a conversation. The user is asking for clarification about something discussed earlier.

Recent conversation:
${recentContext}

Provide a helpful clarification based on the conversation context. If you need more information to clarify, ask a specific follow-up question.`,
      ],
      ['user', '{question}'],
    ]);

    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());

    return chain.invoke({ question });
  }

  async _saveMessages(conversationId, question, response) {
    await this.Message.create({ conversationId, role: 'user', content: question });
    await this.Message.create({ conversationId, role: 'assistant', content: response });
    await this.Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 2 },
    });
  }

  getRoutingStats() {
    return this.router.getStats();
  }

  async startTask(params) {
    return this.contextServices.tasks.startTask(params);
  }

  async checkTaskCompletion(conversationId, interaction) {
    return this.contextServices.tasks.checkCompletion(conversationId, interaction);
  }

  async getContextStats(params) {
    const { userId, workspaceId, conversationId } = params;

    const [sessionStats, domainStats, conceptStats, taskStats] = await Promise.all([
      conversationId
        ? this.contextServices.session.getStats(conversationId).catch(() => null)
        : null,
      workspaceId ? this.contextServices.domain.getStats(workspaceId).catch(() => null) : null,
      workspaceId ? this.contextServices.concepts.getStats(workspaceId).catch(() => null) : null,
      userId ? this.contextServices.tasks.getStats(userId).catch(() => null) : null,
    ]);

    return {
      routing: this.router.getStats(),
      session: sessionStats,
      domain: domainStats,
      concepts: conceptStats,
      tasks: taskStats,
    };
  }

  async initializeConversation(params) {
    const { conversationId, userId, workspaceId } = params;

    try {
      const session = await this.contextServices.session.getOrCreate(conversationId, {
        userId,
        workspaceId,
      });

      const domainProfile = await this.contextServices.domain.getProfile(workspaceId);

      const hierarchy = await this.contextServices.concepts.getHierarchy(workspaceId);
      if (hierarchy.totalConcepts === 0 && domainProfile?.coreTopics?.length > 0) {
        await this.contextServices.concepts.buildHierarchy(workspaceId, domainProfile);
      }

      return {
        conversationId,
        sessionPhase: session.currentPhase,
        domain: domainProfile?.domain?.primary,
        conceptCount: hierarchy.totalConcepts,
      };
    } catch (error) {
      this.logger.warn('Conversation context initialization failed', {
        service: 'intent-rag',
        error: error.message,
      });

      return { conversationId };
    }
  }

  clearContextCaches(params = {}) {
    const { conversationId, workspaceId } = params;

    if (conversationId) {
      this.contextServices.tasks.clearCache(conversationId);
    }

    if (workspaceId) {
      this.contextServices.domain.clearCache(workspaceId);
      this.contextServices.concepts.clearCache(workspaceId);
    }
  }
}

// Factory functions
export async function createIntentAwareRAGService(dependencies = {}) {
  const service = new IntentAwareRAGService(dependencies);
  await service.init();
  return service;
}

// Singleton
let _instance = null;
let _instancePromise = null;

export async function getIntentAwareRAGService() {
  if (_instance) return _instance;
  if (_instancePromise) return _instancePromise;

  _instancePromise = createIntentAwareRAGService();
  _instance = await _instancePromise;
  _instancePromise = null;
  return _instance;
}

export function resetIntentAwareRAGService() {
  _instance = null;
  _instancePromise = null;
}

export { IntentAwareRAGService };
export const intentAwareRAG = new IntentAwareRAGService();
