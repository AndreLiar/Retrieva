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
 * Out of scope response
 */
export const OUT_OF_SCOPE_RESPONSE = `I apologize, but that query appears to be outside the scope of what I can help with based on your knowledge base.

I'm designed to help you find information from your indexed documents. Here are some things I can help with:
- Answering questions about your documents
- Comparing information across different sources
- Explaining concepts from your knowledge base
- Summarizing document contents
- Finding specific information

Is there something from your documents you'd like me to help you find?`;

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
  const { conversationId, startTime } = options;
  const { saveMessages, answerFormatter } = deps;

  const response = `I couldn't find relevant information in your knowledge base to answer that question.

This could mean:
- The topic isn't covered in your indexed documents
- Try rephrasing with different keywords
- The information might be in documents that haven't been indexed yet

Would you like to try asking in a different way?`;

  await saveMessages(conversationId, question, response);

  const formattedAnswer = await answerFormatter.format(response, question);

  return {
    answer: response,
    formattedAnswer,
    sources: [],
    validation: {
      isLowQuality: true,
      confidence: 0.3,
      issues: ['No documents found'],
      isGrounded: false,
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

  const suggestedStr =
    contextInfo.suggestedTopics?.length > 0
      ? `\n\nHere are some topics I can help with:\n${contextInfo.suggestedTopics.map((t) => `- ${t}`).join('\n')}`
      : '';

  const response = `I apologize, but that question appears to be outside the scope of this knowledge base.

${contextInfo.scopeReason || 'This topic is not covered in the indexed documents.'}${suggestedStr}

Is there something else I can help you with?`;

  await saveMessages(conversationId, question, response);

  const formattedAnswer = await answerFormatter.format(response, question);

  return {
    answer: response,
    formattedAnswer,
    sources: [],
    validation: {
      isLowQuality: false,
      confidence: 0.9,
      issues: ['Query out of scope'],
      isGrounded: true,
      hasHallucinations: false,
    },
    citedSources: [],
    intent: {
      type: IntentType.OUT_OF_SCOPE,
      confidence: contextInfo.scopeConfidence,
      reasoning: contextInfo.scopeReason,
    },
    routing: {
      strategy: 'no_retrieval',
      skipRAG: true,
    },
    context: {
      originalQuery: question,
      inScope: false,
      suggestedTopics: contextInfo.suggestedTopics,
    },
    metrics: {
      strategy: 'scope_check',
      contextBuildMs: contextInfo.processingTimeMs,
    },
    conversationId,
    totalTime: Date.now() - startTime,
  };
}
