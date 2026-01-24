/**
 * Intent Context Builder
 *
 * Builds comprehensive context for intent-aware RAG processing.
 * Gathers conversational, knowledge, and task context in parallel.
 * Extracted from intentAwareRAG.js for modularity.
 *
 * @module services/intent/intentContextBuilder
 */

/**
 * @typedef {Object} ContextServices
 * @property {Object} coreference - Coreference resolver service
 * @property {Object} session - Session state manager
 * @property {Object} preferences - User preference manager
 * @property {Object} domain - Domain awareness service
 * @property {Object} concepts - Concept hierarchy service
 * @property {Object} tasks - Task tracker service
 */

/**
 * @typedef {Object} FullContext
 * @property {string} originalQuery - Original user query
 * @property {string} resolvedQuery - Query with resolved coreferences
 * @property {boolean} hadCoreferences - Whether coreferences were resolved
 * @property {Array} resolvedReferences - List of resolved references
 * @property {string} conversationPhase - Current conversation phase
 * @property {string} currentTopic - Current topic
 * @property {number} topicDepth - Topic depth
 * @property {Array} recentEntities - Recently mentioned entities
 * @property {number} messageCount - Message count
 * @property {string} communicationStyle - User's preferred communication style
 * @property {string} responseFormat - User's preferred response format
 * @property {string} preferredLength - User's preferred response length
 * @property {string} personalizationPrompt - Personalization prompt addition
 * @property {string} domainContext - Domain context string
 * @property {boolean} inScope - Whether query is in scope
 * @property {number} scopeConfidence - Scope confidence
 * @property {string} scopeReason - Scope reason
 * @property {Array} suggestedTopics - Suggested topics if out of scope
 * @property {Array} relevantConcepts - Relevant concepts
 * @property {string} primaryConcept - Primary concept
 * @property {Array} conceptPath - Concept path
 * @property {boolean} hasActiveTask - Whether there's an active task
 * @property {string} taskGoal - Task goal
 * @property {Object} taskProgress - Task progress
 * @property {string} currentSubTask - Current sub-task
 * @property {string} taskContextStr - Task context string
 * @property {number} processingTimeMs - Processing time in ms
 */

/**
 * Build full context (conversational + knowledge + task)
 *
 * @param {string} query - User query
 * @param {Object} params - Context parameters
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.userId - User ID
 * @param {string} params.workspaceId - Workspace ID
 * @param {Array} params.messages - Conversation messages
 * @param {ContextServices} contextServices - Context services
 * @param {Object} logger - Logger instance
 * @returns {Promise<FullContext>} Full context object
 */
export async function buildFullContext(query, params, contextServices, logger) {
  const { conversationId, userId, workspaceId, messages } = params;
  const startTime = Date.now();

  try {
    const [resolvedQuery, sessionContext, userPrefs, scopeCheck, conceptContext, taskContext] =
      await Promise.all([
        // Resolve coreferences
        contextServices.coreference.resolve(query, { messages }),

        // Get session state
        contextServices.session.getSessionContext(conversationId).catch(() => ({})),

        // Get user preferences
        contextServices.preferences.getPromptPersonalization(userId).catch(() => ({})),

        // Check scope
        contextServices.domain.checkScope(workspaceId, query).catch(() => ({
          inScope: true,
          confidence: 0.5,
        })),

        // Find relevant concepts
        contextServices.concepts.findRelevantConcepts(workspaceId, query).catch(() => ({
          relevantConcepts: [],
          primaryConcept: null,
        })),

        // Get task context
        contextServices.tasks.getTaskContext(conversationId).catch(() => ({
          hasActiveTask: false,
        })),
      ]);

    // Get domain context
    const domainContext = await contextServices.domain
      .getDomainContext(workspaceId)
      .catch(() => '');

    return {
      // Query processing
      originalQuery: query,
      resolvedQuery: resolvedQuery.resolvedQuery,
      hadCoreferences: resolvedQuery.hadReferences,
      resolvedReferences: resolvedQuery.resolvedReferences,

      // Session context
      conversationPhase: sessionContext.phase || 'exploring',
      currentTopic: sessionContext.topic,
      topicDepth: sessionContext.topicDepth || 0,
      recentEntities: sessionContext.recentEntities || [],
      messageCount: sessionContext.messageCount || 0,

      // User preferences
      communicationStyle: userPrefs.communicationStyle || 'balanced',
      responseFormat: userPrefs.responseFormat || 'standard',
      preferredLength: userPrefs.preferredLength || 'medium',
      personalizationPrompt: userPrefs.promptAddition || '',

      // Domain context
      domainContext,
      inScope: scopeCheck.inScope !== false,
      scopeConfidence: scopeCheck.confidence || 0.5,
      scopeReason: scopeCheck.reason || '',
      suggestedTopics: scopeCheck.suggestedTopics || [],

      // Concept context
      relevantConcepts: conceptContext.relevantConcepts || [],
      primaryConcept: conceptContext.primaryConcept,
      conceptPath: conceptContext.conceptPath || [],

      // Task context
      hasActiveTask: taskContext.hasActiveTask || false,
      taskGoal: taskContext.goal,
      taskProgress: taskContext.progress,
      currentSubTask: taskContext.currentSubTask,
      taskContextStr: taskContext.context || '',

      // Metadata
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.warn('Context building partially failed', {
      service: 'intent-rag',
      error: error.message,
    });

    return {
      originalQuery: query,
      resolvedQuery: query,
      hadCoreferences: false,
      inScope: true,
      scopeConfidence: 0.5,
      conversationPhase: 'exploring',
      hasActiveTask: false,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Update context after interaction
 *
 * @param {Object} params - Update parameters
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.userId - User ID
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.query - User query
 * @param {string} params.response - Assistant response
 * @param {string} params.intent - Detected intent
 * @param {Array} params.entities - Detected entities
 * @param {string} params.topic - Current topic
 * @param {ContextServices} contextServices - Context services
 * @param {Object} logger - Logger instance
 */
export async function updateContextAfterInteraction(params, contextServices, logger) {
  const { conversationId, userId, query, response, intent, entities, topic } = params;

  try {
    await Promise.all([
      // Update session state
      contextServices.session
        .updateInteraction(conversationId, {
          userQuery: query,
          assistantResponse: response,
          intent,
          entities,
          topic,
        })
        .catch(() => {}),

      // Learn from interaction
      contextServices.preferences
        .learnFromInteraction(userId, {
          query,
          response,
          intent,
          entities,
        })
        .catch(() => {}),

      // Update task progress
      contextServices.tasks
        .updateProgress(conversationId, {
          query,
          response,
          intent,
        })
        .catch(() => {}),
    ]);
  } catch (error) {
    logger.warn('Context update failed', {
      service: 'intent-rag',
      error: error.message,
    });
  }
}

/**
 * Get style instruction based on user preferences
 *
 * @param {Object} contextInfo - Context information
 * @param {string} contextInfo.communicationStyle - Communication style
 * @param {string} contextInfo.preferredLength - Preferred length
 * @returns {string} Style instruction
 */
export function getStyleInstruction(contextInfo) {
  const style = contextInfo.communicationStyle || 'balanced';
  const length = contextInfo.preferredLength || 'medium';

  const styleMap = {
    brief: 'Be concise and direct',
    detailed: 'Provide comprehensive explanations',
    technical: 'Use precise technical terminology',
    simple: 'Use clear, simple language',
    structured: 'Use bullet points and clear structure',
    conversational: 'Be friendly and conversational',
    balanced: 'Balance detail with clarity',
  };

  const lengthMap = {
    short: 'Keep responses brief (1-2 paragraphs)',
    medium: 'Use moderate length responses',
    long: 'Provide thorough, detailed responses',
  };

  return `${styleMap[style] || styleMap.balanced}. ${lengthMap[length] || lengthMap.medium}`;
}
