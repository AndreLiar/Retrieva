/**
 * Conversation Summarization Service
 *
 * M4 WORKING MEMORY: Compresses conversation history
 * - Summarizes old messages to reduce context window usage
 * - Extracts key insights and topics
 * - Enables cross-conversation knowledge retrieval
 *
 * @module services/memory/conversationSummarization
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { ConversationSummary } from '../../models/ConversationSummary.js';
import { Message } from '../../models/Message.js';
import { Conversation } from '../../models/Conversation.js';
import logger from '../../config/logger.js';

// Summarization LLM
const summaryLlm = new ChatOllama({
  model: process.env.SUMMARIZATION_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.3,
  numPredict: 1500,
  format: 'json',
});

// Conversation summarization prompt
const CONVERSATION_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert at summarizing conversations. Analyze the conversation and extract key information.

Create a concise summary that captures:
1. Main topics discussed
2. Key questions asked and answers given
3. Important facts or decisions mentioned
4. User preferences or patterns observed

Respond with valid JSON only:
{{
  "summary": "A comprehensive summary of the conversation (2-4 sentences)...",
  "topics": ["topic1", "topic2", "topic3"],
  "keyInsights": ["insight1", "insight2"],
  "userPreferences": {{
    "preferredTopics": ["topic"],
    "communicationStyle": "brief|detailed",
    "interests": ["interest"]
  }}
}}`,
  ],
  [
    'user',
    `Conversation Messages:
{messages}

Summarize this conversation as JSON.`,
  ],
]);

// Incremental summary prompt (for updating existing summary)
const INCREMENTAL_SUMMARY_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are updating an existing conversation summary with new messages.

Existing Summary:
{existingSummary}

Existing Topics: {existingTopics}
Existing Insights: {existingInsights}

Update the summary to incorporate the new messages while preserving important information from the existing summary.

Respond with valid JSON:
{{
  "summary": "Updated comprehensive summary...",
  "topics": ["all topics including new ones"],
  "keyInsights": ["all insights including new ones"],
  "userPreferences": {{...}}
}}`,
  ],
  [
    'user',
    `New Messages:
{newMessages}

Update the summary as JSON.`,
  ],
]);

/**
 * Parse JSON response from LLM
 */
function parseSummaryResponse(response) {
  try {
    return JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        logger.warn('Failed to parse conversation summary response');
      }
    }
    return {
      summary: response.trim(),
      topics: [],
      keyInsights: [],
      userPreferences: {},
    };
  }
}

/**
 * Format messages for summarization
 */
function formatMessagesForSummary(messages) {
  return messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

/**
 * Summarize a conversation
 *
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Options
 * @returns {Promise<ConversationSummary>} Created/updated summary
 */
export async function summarizeConversation(conversationId, options = {}) {
  const { forceNew = false, messageThreshold = 10 } = options;
  const startTime = Date.now();

  try {
    // Get conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Get all messages
    const messages = await Message.find({ conversationId })
      .sort({ timestamp: 1 })
      .select('role content timestamp');

    if (messages.length < messageThreshold) {
      logger.debug(
        `Conversation ${conversationId} has ${messages.length} messages, below threshold ${messageThreshold}`
      );
      return null;
    }

    // Check existing summary
    const existingSummary = await ConversationSummary.getLatest(conversationId);

    // If summary exists and covers all messages, skip
    if (existingSummary && !forceNew) {
      const newMessageCount = messages.length - existingSummary.messagesCovered.to;
      if (newMessageCount < messageThreshold) {
        logger.debug(`Only ${newMessageCount} new messages, skipping summary update`);
        return existingSummary;
      }
    }

    let result;

    if (existingSummary && !forceNew) {
      // Incremental update
      const newMessages = messages.slice(existingSummary.messagesCovered.to);
      const chain = INCREMENTAL_SUMMARY_PROMPT.pipe(summaryLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        existingSummary: existingSummary.summary,
        existingTopics: existingSummary.topics.join(', '),
        existingInsights: existingSummary.keyInsights.join(', '),
        newMessages: formatMessagesForSummary(newMessages),
      });

      result = parseSummaryResponse(response);

      // Update existing summary
      existingSummary.summary = result.summary;
      existingSummary.topics = [...new Set([...existingSummary.topics, ...(result.topics || [])])];
      existingSummary.keyInsights = [
        ...new Set([...existingSummary.keyInsights, ...(result.keyInsights || [])]),
      ];
      existingSummary.messagesCovered.to = messages.length;
      existingSummary.messagesCovered.total = messages.length;
      existingSummary.timeRange.end = messages[messages.length - 1].timestamp;
      existingSummary.version += 1;

      if (result.userPreferences) {
        for (const [key, value] of Object.entries(result.userPreferences)) {
          existingSummary.userPreferences.set(key, value);
        }
      }

      await existingSummary.save();

      logger.info('Updated conversation summary', {
        service: 'conversation-summary',
        conversationId,
        newMessagesProcessed: newMessages.length,
        processingTimeMs: Date.now() - startTime,
      });

      return existingSummary;
    } else {
      // Full summarization
      const chain = CONVERSATION_SUMMARY_PROMPT.pipe(summaryLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        messages: formatMessagesForSummary(messages),
      });

      result = parseSummaryResponse(response);

      // Create new summary
      const newSummary = await ConversationSummary.create({
        conversationId,
        userId: conversation.userId,
        workspaceId: conversation.workspaceId || 'default',
        summary: result.summary,
        topics: result.topics || [],
        keyInsights: result.keyInsights || [],
        userPreferences: result.userPreferences || {},
        messagesCovered: {
          from: 0,
          to: messages.length,
          total: messages.length,
        },
        timeRange: {
          start: messages[0].timestamp,
          end: messages[messages.length - 1].timestamp,
        },
      });

      logger.info('Created conversation summary', {
        service: 'conversation-summary',
        conversationId,
        messagesProcessed: messages.length,
        processingTimeMs: Date.now() - startTime,
      });

      return newSummary;
    }
  } catch (error) {
    logger.error('Failed to summarize conversation', {
      service: 'conversation-summary',
      conversationId,
      error: error.message,
      processingTimeMs: Date.now() - startTime,
    });
    throw error;
  }
}

/**
 * Get conversation context with summary
 * Returns compressed context for long conversations
 *
 * @param {string} conversationId - Conversation ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Context with summary and recent messages
 */
export async function getConversationContext(conversationId, options = {}) {
  const { recentMessageCount = 10, includeSummary = true } = options;

  // Get recent messages
  const recentMessages = await Message.find({ conversationId })
    .sort({ timestamp: -1 })
    .limit(recentMessageCount)
    .sort({ timestamp: 1 });

  // Get summary if available
  let summary = null;
  if (includeSummary) {
    summary = await ConversationSummary.getLatest(conversationId);
  }

  return {
    summary: summary
      ? {
          text: summary.summary,
          topics: summary.topics,
          keyInsights: summary.keyInsights,
        }
      : null,
    recentMessages,
    hasCompressedHistory: !!summary,
  };
}

/**
 * Build context string from summary and recent messages
 *
 * @param {Object} context - Context from getConversationContext
 * @returns {string} Formatted context string
 */
export function buildCompressedContext(context) {
  const parts = [];

  if (context.summary) {
    parts.push(`[Previous Conversation Summary]
${context.summary.text}

Key Topics: ${context.summary.topics.join(', ')}
Key Insights: ${context.summary.keyInsights.join('; ')}`);
  }

  if (context.recentMessages.length > 0) {
    parts.push(`[Recent Messages]
${context.recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}`);
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Get cross-conversation knowledge for a user
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 * @param {string} query - Search query
 * @returns {Promise<Object>} Cross-conversation insights
 */
export async function getCrossConversationKnowledge(userId, workspaceId, query) {
  // Get topic insights
  const topicInsights = await ConversationSummary.getCrossConversationInsights(userId, workspaceId);

  // Search by query terms
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const relevantSummaries = [];

  for (const term of queryTerms.slice(0, 5)) {
    const matches = await ConversationSummary.searchByTopic(userId, term, { limit: 3 });
    relevantSummaries.push(...matches);
  }

  // Deduplicate
  const uniqueSummaries = Array.from(
    new Map(relevantSummaries.map((s) => [s._id.toString(), s])).values()
  ).slice(0, 5);

  return {
    topicInsights: topicInsights.slice(0, 10),
    relevantSummaries: uniqueSummaries.map((s) => ({
      conversationId: s.conversationId,
      summary: s.summary,
      topics: s.topics,
      timeRange: s.timeRange,
    })),
  };
}

/**
 * Summarize all eligible conversations for a user
 * Used for batch processing
 *
 * @param {string} userId - User ID
 * @param {Object} options - Options
 * @returns {Promise<Object>} Processing results
 */
export async function summarizeUserConversations(userId, options = {}) {
  const { messageThreshold = 10, maxConversations = 50 } = options;

  const conversations = await Conversation.find({ userId })
    .sort({ updatedAt: -1 })
    .limit(maxConversations)
    .select('_id messageCount');

  const results = {
    processed: 0,
    skipped: 0,
    errors: [],
  };

  for (const conv of conversations) {
    if (conv.messageCount < messageThreshold) {
      results.skipped++;
      continue;
    }

    try {
      await summarizeConversation(conv._id, { messageThreshold });
      results.processed++;
    } catch (error) {
      results.errors.push({ conversationId: conv._id, error: error.message });
    }
  }

  logger.info('Batch conversation summarization complete', {
    service: 'conversation-summary',
    userId,
    ...results,
  });

  return results;
}
