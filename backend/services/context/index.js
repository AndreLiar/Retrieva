/**
 * Context Services Index
 *
 * Centralized exports for all context-aware services:
 * - Conversational Context: Session state, user preferences, coreference resolution
 * - Knowledge Context: Domain awareness, concept hierarchy
 * - Task Context: Multi-turn task tracking, goal management
 *
 * @module services/context
 */

// Conversational Context
export { coreferenceResolver, CoreferenceResolver } from './coreferenceResolver.js';
export {
  sessionStateManager,
  SessionStateManager,
  SessionState,
  ConversationPhase,
  TopicShift,
} from './sessionState.js';
export {
  userPreferenceManager,
  UserPreferenceManager,
  UserPreferences,
  CommunicationStyle,
  ResponseFormat,
} from './userPreferences.js';

// Knowledge Context
export { domainAwareness, DomainAwarenessManager, DomainProfile } from './domainAwareness.js';
export { conceptHierarchy, ConceptHierarchyManager, ConceptNode } from './conceptHierarchy.js';

// Task Context
export { taskTracker, TaskTrackerManager, Task, TaskStatus, TaskType } from './taskTracker.js';

/**
 * Context Manager - Unified interface for all context services
 */
class ContextManager {
  constructor() {
    // Lazy load services to avoid circular dependencies
    this._services = null;
  }

  /**
   * Get all services
   * @private
   */
  get services() {
    if (!this._services) {
      this._services = {
        coreference: require('./coreferenceResolver.js').coreferenceResolver,
        session: require('./sessionState.js').sessionStateManager,
        preferences: require('./userPreferences.js').userPreferenceManager,
        domain: require('./domainAwareness.js').domainAwareness,
        concepts: require('./conceptHierarchy.js').conceptHierarchy,
        tasks: require('./taskTracker.js').taskTracker,
      };
    }
    return this._services;
  }

  /**
   * Build complete context for a query
   *
   * @param {Object} params - Context parameters
   * @returns {Promise<Object>}
   */
  async buildContext(params) {
    const { query, conversationId, userId, workspaceId, messages = [], entities = [] } = params;

    const startTime = Date.now();

    // Run context gathering in parallel where possible
    const [resolvedQuery, sessionContext, userContext, domainContext, taskContext] =
      await Promise.all([
        // Resolve coreferences
        this.services.coreference.resolve(query, { messages, entities }),

        // Get session state
        this.services.session.getSessionContext(conversationId),

        // Get user preferences
        this.services.preferences.getPromptPersonalization(userId),

        // Get domain context
        this.services.domain.getDomainContext(workspaceId),

        // Get task context
        this.services.tasks.getTaskContext(conversationId),
      ]);

    // Check scope
    const scopeCheck = await this.services.domain.checkScope(
      workspaceId,
      resolvedQuery.resolvedQuery
    );

    // Find relevant concepts
    const conceptContext = await this.services.concepts.findRelevantConcepts(
      workspaceId,
      resolvedQuery.resolvedQuery
    );

    const context = {
      // Query processing
      originalQuery: query,
      resolvedQuery: resolvedQuery.resolvedQuery,
      hadCoreferences: resolvedQuery.hadReferences,
      resolvedReferences: resolvedQuery.resolvedReferences,

      // Session context
      conversationPhase: sessionContext.phase,
      currentTopic: sessionContext.topic,
      topicDepth: sessionContext.topicDepth,
      recentEntities: sessionContext.recentEntities,
      messageCount: sessionContext.messageCount,

      // User context
      communicationStyle: userContext.communicationStyle,
      responseFormat: userContext.responseFormat,
      preferredLength: userContext.preferredLength,
      personalizationPrompt: userContext.promptAddition,

      // Domain context
      domainContext,
      inScope: scopeCheck.inScope,
      scopeConfidence: scopeCheck.confidence,
      scopeReason: scopeCheck.reason,
      suggestedTopics: scopeCheck.suggestedTopics,

      // Concept context
      relevantConcepts: conceptContext.relevantConcepts,
      primaryConcept: conceptContext.primaryConcept,
      conceptPath: conceptContext.conceptPath,

      // Task context
      hasActiveTask: taskContext.hasActiveTask,
      taskGoal: taskContext.goal,
      taskProgress: taskContext.progress,
      currentSubTask: taskContext.currentSubTask,
      taskContext: taskContext.context,

      // Metadata
      processingTimeMs: Date.now() - startTime,
    };

    return context;
  }

  /**
   * Update context after interaction
   *
   * @param {Object} params - Update parameters
   * @returns {Promise<void>}
   */
  async updateAfterInteraction(params) {
    const {
      conversationId,
      userId,
      _workspaceId,
      query,
      response,
      intent,
      entities = [],
      topic = null,
    } = params;

    // Run updates in parallel
    await Promise.all([
      // Update session state
      this.services.session.updateInteraction(conversationId, {
        userQuery: query,
        assistantResponse: response,
        intent,
        entities,
        topic,
      }),

      // Learn from interaction
      this.services.preferences.learnFromInteraction(userId, {
        query,
        response,
        intent,
        entities,
      }),

      // Update task progress
      this.services.tasks.updateProgress(conversationId, {
        query,
        response,
        intent,
      }),
    ]);
  }

  /**
   * Start a new task
   *
   * @param {Object} params - Task parameters
   * @returns {Promise<Object>}
   */
  async startTask(params) {
    return this.services.tasks.startTask(params);
  }

  /**
   * Check task completion
   *
   * @param {string} conversationId - Conversation ID
   * @param {Object} interaction - Latest interaction
   * @returns {Promise<Object>}
   */
  async checkTaskCompletion(conversationId, interaction) {
    return this.services.tasks.checkCompletion(conversationId, interaction);
  }

  /**
   * Get comprehensive stats
   *
   * @param {Object} params - Stats parameters
   * @returns {Promise<Object>}
   */
  async getStats(params) {
    const { userId, workspaceId, conversationId } = params;

    const [sessionStats, domainStats, conceptStats, taskStats] = await Promise.all([
      conversationId ? this.services.session.getStats(conversationId) : null,
      workspaceId ? this.services.domain.getStats(workspaceId) : null,
      workspaceId ? this.services.concepts.getStats(workspaceId) : null,
      userId ? this.services.tasks.getStats(userId) : null,
    ]);

    return {
      session: sessionStats,
      domain: domainStats,
      concepts: conceptStats,
      tasks: taskStats,
    };
  }

  /**
   * Clear all caches
   *
   * @param {Object} params - Cache clear parameters
   */
  clearCaches(params = {}) {
    const { conversationId, _userId, workspaceId } = params;

    if (conversationId) {
      this.services.session.clearCache?.(conversationId);
      this.services.tasks.clearCache(conversationId);
    }

    if (workspaceId) {
      this.services.domain.clearCache(workspaceId);
      this.services.concepts.clearCache(workspaceId);
    }
  }

  /**
   * Initialize context for a new conversation
   *
   * @param {Object} params - Initialization parameters
   * @returns {Promise<Object>}
   */
  async initializeConversation(params) {
    const { conversationId, userId, workspaceId } = params;

    // Create session state
    const session = await this.services.session.getOrCreate(conversationId, {
      userId,
      workspaceId,
    });

    // Get domain profile (creates if needed)
    const domainProfile = await this.services.domain.getProfile(workspaceId);

    // Build concept hierarchy if not exists
    const hierarchy = await this.services.concepts.getHierarchy(workspaceId);
    if (hierarchy.totalConcepts === 0 && domainProfile.coreTopics?.length > 0) {
      await this.services.concepts.buildHierarchy(workspaceId, domainProfile);
    }

    return {
      conversationId,
      sessionPhase: session.currentPhase,
      domain: domainProfile.domain?.primary,
      conceptCount: hierarchy.totalConcepts,
    };
  }
}

// Singleton
export const contextManager = new ContextManager();
export { ContextManager };
