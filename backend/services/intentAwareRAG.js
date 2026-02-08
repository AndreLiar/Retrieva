/**
 * Intent-Aware RAG Service
 *
 * Plugin layer over the core RAG pipeline (rag.js).
 * Adds context enrichment (coreference, session, preferences, domain,
 * concepts, tasks) then delegates to ragService.askWithConversation()
 * which owns all safety/quality: sanitization, PII masking, confidence
 * handling, hallucination blocking, retry, and caching.
 *
 * @module services/intentAwareRAG
 */

// Core RAG pipeline — single owner of safety + quality
import { ragService } from './rag.js';

// Intent routing
import { queryRouter } from './intent/index.js';

// Extracted intent modules
import {
  handleNonRAGIntent,
  handleOutOfScope,
} from './intent/intentHandlers.js';
import {
  buildFullContext,
  updateContextAfterInteraction,
  getStyleInstruction,
} from './intent/intentContextBuilder.js';

// Context services
import {
  coreferenceResolver,
  sessionStateManager,
  userPreferenceManager,
  domainAwareness,
  conceptHierarchy,
  taskTracker,
} from './context/index.js';

import { answerFormatter as defaultAnswerFormatter } from './answerFormatter.js';
import defaultLogger from '../config/logger.js';
import { Message as DefaultMessage } from '../models/Message.js';
import { Conversation as DefaultConversation } from '../models/Conversation.js';

/**
 * Intent-Aware RAG Service — plugin layer
 */
class IntentAwareRAGService {
  constructor(dependencies = {}) {
    this.answerFormatter = dependencies.answerFormatter || defaultAnswerFormatter;
    this.logger = dependencies.logger || defaultLogger;

    const models = dependencies.models || {};
    this.Message = models.Message || DefaultMessage;
    this.Conversation = models.Conversation || DefaultConversation;

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
    // Delegate init to the core pipeline
    await ragService.init();
  }

  /**
   * Process a query with context enrichment, then delegate to ragService.
   */
  async ask(question, options = {}) {
    const { conversationId, filters = null, forceIntent = null, userId = null, onEvent = null } = options;

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    const startTime = Date.now();

    const conversation = await this.Conversation.findById(conversationId);
    if (!conversation) throw new Error(`Conversation ${conversationId} not found`);

    const workspaceId = conversation.workspaceId || 'default';
    const effectiveUserId = userId || conversation.userId || 'anonymous';

    const messages = await this.Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(20)
      .sort({ timestamp: 1 })
      .lean();

    // === PLUGIN: Context enrichment (unique to this layer) ===
    const contextInfo = await buildFullContext(
      question,
      { conversationId, userId: effectiveUserId, workspaceId, messages },
      this.contextServices,
      this.logger
    );

    const processedQuery = contextInfo.resolvedQuery || question;

    // NOTE: We no longer bypass RAG based on domain scope check.
    // When a user connects their Notion workspace, we should ALWAYS search first,
    // then report "not found in your Notion" instead of refusing based on domain policing.
    // The scope check is still logged for diagnostics but doesn't prevent RAG execution.
    if (!contextInfo.inScope && contextInfo.scopeConfidence > 0.7) {
      this.logger.info('Query may be outside typical domain (will search anyway)', {
        service: 'intent-rag',
        reason: contextInfo.scopeReason,
        action: 'proceeding_with_search',
      });
      // Continue to RAG - don't return early
    }

    // Route query (with optional forceIntent for testing)
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

    // Handle non-RAG intents locally (canned responses, safe by construction)
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

    // === BUILD PLUGIN INSTRUCTIONS ===
    const styleInstruction = getStyleInstruction(contextInfo);
    const domainInstruction = contextInfo.domainContext
      ? `\nDomain context: ${contextInfo.domainContext}`
      : '';
    const taskInstruction =
      contextInfo.hasActiveTask && contextInfo.taskContextStr
        ? `\nOngoing task: ${contextInfo.taskContextStr}`
        : '';
    const callerInstruction = [styleInstruction, domainInstruction, taskInstruction]
      .filter(Boolean)
      .join('\n');

    // === DELEGATE to the core pipeline (owns safety + quality) ===
    const result = await ragService.askWithConversation(processedQuery, {
      conversationId,
      filters,
      onEvent,
      routing,
      responseInstruction: callerInstruction,
    });

    // === PLUGIN: Post-interaction context update ===
    await updateContextAfterInteraction(
      {
        conversationId,
        userId: effectiveUserId,
        workspaceId,
        query: processedQuery,
        response: result.answer,
        intent: routing.intent,
        entities: routing.entities || [],
        topic: contextInfo.primaryConcept,
      },
      this.contextServices,
      this.logger
    );

    // Augment result with context metadata (standard schema + extras)
    result.intent = {
      type: routing.intent,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    };
    result.context = {
      resolvedQuery: contextInfo.resolvedQuery,
      hadCoreferences: contextInfo.hadCoreferences,
      conversationPhase: contextInfo.conversationPhase,
      currentTopic: contextInfo.currentTopic,
      hasActiveTask: contextInfo.hasActiveTask,
    };

    return result;
  }

  async _generateClarificationResponse(question, history, _routing) {
    // Delegate to ragService LLM for clarification
    const { llm } = ragService;
    const { ChatPromptTemplate } = await import('@langchain/core/prompts');
    const { StringOutputParser } = await import('@langchain/core/output_parsers');

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

Provide a helpful clarification based on the conversation context.`,
      ],
      ['user', '{question}'],
    ]);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());
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

// Factory
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
