/**
 * Intent Handlers
 *
 * Handles non-RAG intents and special cases like out-of-scope queries
 * and empty document results. Extracted from intentAwareRAG.js to
 * maintain modularity and keep file sizes manageable.
 *
 * @module services/intent/intentHandlers
 */

import { IntentType } from './index.js';

/**
 * Chitchat/greeting responses
 */
export const CHITCHAT_RESPONSES = [
  "Hello! I'm your knowledge assistant. I can help you find information from your documents. What would you like to know?",
  "Hi there! I'm here to help you explore your knowledge base. Feel free to ask me anything about your documents.",
  'Hey! I can search through your documents and answer questions. What can I help you with today?',
];

/**
 * Build a workspace-aware "not found" response
 * @param {Object} options - Response options
 * @param {string} [options.query] - The user's query
 * @param {string[]} [options.suggestedTopics] - Topics the system can help with
 * @param {boolean} [options.offerGeneralKnowledge] - Whether to offer general knowledge fallback
 * @returns {string} Formatted response
 */
export function buildNotFoundResponse(options = {}) {
  const { query, suggestedTopics = [], offerGeneralKnowledge = true } = options;

  let response = `I searched your connected Notion workspace but couldn't find information about "${query || 'this topic'}".`;

  response += `\n\nThis could mean:
- This topic isn't covered in your Notion pages yet
- The information might be in pages that haven't been synced
- Try rephrasing with different keywords`;

  if (suggestedTopics.length > 0) {
    response += `\n\nHere are some topics I found in your workspace:\n${suggestedTopics.slice(0, 5).map((t) => `- ${t}`).join('\n')}`;
  }

  if (offerGeneralKnowledge) {
    response += `\n\nWould you like me to provide a general explanation instead, or would you prefer to rephrase your question?`;
  }

  return response;
}

/**
 * Legacy out of scope response (for backward compatibility)
 * @deprecated Use buildNotFoundResponse instead
 */
export const OUT_OF_SCOPE_RESPONSE = buildNotFoundResponse({ offerGeneralKnowledge: true });

/**
 * Handle non-RAG intents (chitchat, out-of-scope, clarification)
 *
 * @param {string} question - User question
 * @param {Object} routing - Routing decision
 * @param {Object} options - Processing options
 * @param {string} options.conversationId - Conversation ID
 * @param {Array} options.messages - Conversation messages
 * @param {number} options.startTime - Request start time
 * @param {string} options.requestId - Request ID
 * @param {Object} deps - Dependencies
 * @param {Function} deps.saveMessages - Function to save messages
 * @param {Object} deps.answerFormatter - Answer formatter service
 * @param {Function} deps.generateClarificationResponse - Function to generate clarification response
 * @returns {Promise<Object>} Intent-aware result
 */
export async function handleNonRAGIntent(question, routing, options, deps) {
  const { conversationId, messages, startTime } = options;
  const { saveMessages, answerFormatter, generateClarificationResponse } = deps;

  let response;

  switch (routing.intent) {
    case IntentType.CHITCHAT:
      response = CHITCHAT_RESPONSES[Math.floor(Math.random() * CHITCHAT_RESPONSES.length)];
      break;

    case IntentType.OUT_OF_SCOPE:
      response = OUT_OF_SCOPE_RESPONSE;
      break;

    case IntentType.CLARIFICATION:
      response = await generateClarificationResponse(question, messages, routing);
      break;

    default:
      response = "I'm not sure how to help with that. Could you rephrase your question?";
  }

  await saveMessages(conversationId, question, response);

  const formattedAnswer = await answerFormatter.format(response, question);

  return {
    answer: response,
    formattedAnswer,
    sources: [],
    validation: {
      isLowQuality: false,
      confidence: 1.0,
      issues: [],
      isGrounded: true,
      hasHallucinations: false,
    },
    citedSources: [],
    intent: {
      type: routing.intent,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    },
    routing: {
      strategy: routing.strategy,
      skipRAG: true,
      responseStyle: routing.responseStyle,
    },
    metrics: {
      strategy: 'no_retrieval',
      intentClassificationMs: routing.processingTimeMs,
    },
    conversationId,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Handle case when no documents are found
 *
 * @param {string} question - User question
 * @param {Object} routing - Routing decision
 * @param {Object} options - Processing options
 * @param {string} options.conversationId - Conversation ID
 * @param {number} options.startTime - Request start time
 * @param {Object} deps - Dependencies
 * @param {Function} deps.saveMessages - Function to save messages
 * @param {Object} deps.answerFormatter - Answer formatter service
 * @returns {Promise<Object>} Intent-aware result
 */
export async function handleNoDocuments(question, routing, options, deps) {
  const { conversationId, startTime, suggestedTopics = [] } = options;
  const { saveMessages, answerFormatter } = deps;

  // Use workspace-aware response
  const response = buildNotFoundResponse({
    query: question,
    suggestedTopics,
    offerGeneralKnowledge: true,
  });

  await saveMessages(conversationId, question, response);

  const formattedAnswer = await answerFormatter.format(response, question);

  return {
    answer: response,
    formattedAnswer,
    sources: [],
    provenance: 'notion_search_empty', // Indicates we searched Notion but found nothing
    validation: {
      isLowQuality: false, // Not finding is a valid outcome, not low quality
      confidence: 0.8, // We're confident in the "not found" result
      issues: ['No matching documents in connected Notion workspace'],
      isGrounded: true,
      hasHallucinations: false,
    },
    citedSources: [],
    intent: {
      type: routing.intent,
      confidence: routing.confidence,
      reasoning: routing.reasoning,
    },
    routing: {
      strategy: routing.strategy,
      responseStyle: routing.responseStyle,
    },
    metrics: {
      strategy: routing.strategy,
      documentsFound: 0,
      searchedNotion: true,
    },
    conversationId,
    totalTime: Date.now() - startTime,
  };
}

/**
 * Handle out-of-scope queries
 *
 * @param {string} question - User question
 * @param {Object} contextInfo - Context information
 * @param {Object} options - Processing options
 * @param {string} options.conversationId - Conversation ID
 * @param {number} options.startTime - Request start time
 * @param {Object} deps - Dependencies
 * @param {Function} deps.saveMessages - Function to save messages
 * @param {Object} deps.answerFormatter - Answer formatter service
 * @returns {Promise<Object>} Intent-aware result
 */
export async function handleOutOfScope(question, contextInfo, options, deps) {
  const { conversationId, startTime } = options;
  const { saveMessages, answerFormatter } = deps;

  // Use workspace-aware response instead of refusing
  const response = buildNotFoundResponse({
    query: question,
    suggestedTopics: contextInfo.suggestedTopics || [],
    offerGeneralKnowledge: true,
  });

  await saveMessages(conversationId, question, response);

  const formattedAnswer = await answerFormatter.format(response, question);

  return {
    answer: response,
    formattedAnswer,
    sources: [],
    provenance: 'notion_search_empty', // We searched but didn't find
    validation: {
      isLowQuality: false,
      confidence: 0.8, // Confident in the "not found" result
      issues: ['Topic not found in connected Notion workspace'],
      isGrounded: true,
      hasHallucinations: false,
    },
    citedSources: [],
    intent: {
      type: IntentType.OUT_OF_SCOPE,
      confidence: contextInfo.scopeConfidence,
      reasoning: `Searched Notion workspace: ${contextInfo.scopeReason || 'No matching content found'}`,
    },
    routing: {
      strategy: 'workspace_search',
      skipRAG: true,
    },
    context: {
      originalQuery: question,
      inScope: false,
      searchedNotion: true,
      suggestedTopics: contextInfo.suggestedTopics,
    },
    metrics: {
      strategy: 'scope_check',
      contextBuildMs: contextInfo.processingTimeMs,
      searchedNotion: true,
    },
    conversationId,
    totalTime: Date.now() - startTime,
  };
}
