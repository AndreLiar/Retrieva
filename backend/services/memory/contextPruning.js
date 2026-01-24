/**
 * Smart Context Pruning Service
 *
 * M4 WORKING MEMORY: Relevance-based context selection
 * - Semantic similarity scoring for message selection
 * - Dynamic context window sizing
 * - Episodic vs semantic memory separation
 * - Token budget management
 *
 * @module services/memory/contextPruning
 */

import { Message } from '../../models/Message.js';
import { ConversationSummary } from '../../models/ConversationSummary.js';
import { embeddings } from '../../config/embeddings.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} PrunedContext
 * @property {Array} episodicMemory - Recent conversation messages (temporal)
 * @property {Array} semanticMemory - Relevant past messages (by topic)
 * @property {Object|null} summary - Compressed conversation summary
 * @property {number} totalTokens - Estimated token count
 * @property {Object} stats - Pruning statistics
 */

/**
 * @typedef {Object} MessageWithScore
 * @property {Object} message - The message
 * @property {number} relevanceScore - Relevance to current query (0-1)
 * @property {number} recencyScore - Recency score (0-1)
 * @property {number} combinedScore - Combined score
 * @property {string} memoryType - 'episodic' or 'semantic'
 */

// Approximate tokens per character (rough estimate)
const CHARS_PER_TOKEN = 4;

// Default token budgets
const DEFAULT_BUDGETS = {
  maxTotalTokens: 4000,
  episodicBudget: 0.4, // 40% for recent messages
  semanticBudget: 0.4, // 40% for relevant past messages
  summaryBudget: 0.2, // 20% for summary
};

/**
 * Estimate token count for text
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude > 0 ? dotProduct / magnitude : 0;
}

/**
 * Context Pruning Manager
 */
class ContextPruningManager {
  constructor(options = {}) {
    this.maxTotalTokens = options.maxTotalTokens || DEFAULT_BUDGETS.maxTotalTokens;
    this.episodicBudget = options.episodicBudget || DEFAULT_BUDGETS.episodicBudget;
    this.semanticBudget = options.semanticBudget || DEFAULT_BUDGETS.semanticBudget;
    this.summaryBudget = options.summaryBudget || DEFAULT_BUDGETS.summaryBudget;

    // Caches for embeddings
    this.queryEmbeddingCache = new Map();
    this.messageEmbeddingCache = new Map();
  }

  /**
   * Get query embedding with caching
   * @private
   */
  async _getQueryEmbedding(query) {
    const cacheKey = query.toLowerCase().trim();
    if (this.queryEmbeddingCache.has(cacheKey)) {
      return this.queryEmbeddingCache.get(cacheKey);
    }

    const embedding = await embeddings.embedQuery(query);
    this.queryEmbeddingCache.set(cacheKey, embedding);

    // Keep cache size manageable
    if (this.queryEmbeddingCache.size > 100) {
      const firstKey = this.queryEmbeddingCache.keys().next().value;
      this.queryEmbeddingCache.delete(firstKey);
    }

    return embedding;
  }

  /**
   * Get message embedding with caching
   * @private
   */
  async _getMessageEmbedding(message) {
    const cacheKey = message._id?.toString() || message.content.substring(0, 100);
    if (this.messageEmbeddingCache.has(cacheKey)) {
      return this.messageEmbeddingCache.get(cacheKey);
    }

    const embedding = await embeddings.embedQuery(message.content);
    this.messageEmbeddingCache.set(cacheKey, embedding);

    // Keep cache size manageable
    if (this.messageEmbeddingCache.size > 500) {
      const firstKey = this.messageEmbeddingCache.keys().next().value;
      this.messageEmbeddingCache.delete(firstKey);
    }

    return embedding;
  }

  /**
   * Calculate recency score for a message
   * More recent = higher score
   * @private
   */
  _calculateRecencyScore(messageTimestamp, newestTimestamp) {
    const age = newestTimestamp - new Date(messageTimestamp).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    return Math.max(0, 1 - age / maxAge);
  }

  /**
   * Calculate query complexity for adaptive window sizing
   * @private
   */
  _assessQueryComplexity(query) {
    const queryLength = query.length;
    const questionWords = [
      'what',
      'why',
      'how',
      'when',
      'where',
      'which',
      'who',
      'explain',
      'describe',
      'compare',
    ];
    const complexityIndicators = [
      'and',
      'or',
      'but',
      'however',
      'considering',
      'based on',
      'in relation to',
    ];

    let complexity = 0;

    // Length factor
    if (queryLength > 100) complexity += 0.2;
    if (queryLength > 200) complexity += 0.2;

    const lowerQuery = query.toLowerCase();

    // Question complexity
    const questionCount = questionWords.filter((w) => lowerQuery.includes(w)).length;
    complexity += questionCount * 0.1;

    // Complexity indicators
    const indicatorCount = complexityIndicators.filter((w) => lowerQuery.includes(w)).length;
    complexity += indicatorCount * 0.15;

    return Math.min(1, complexity);
  }

  /**
   * Build smart pruned context for a query
   *
   * @param {string} conversationId - Conversation ID
   * @param {string} query - Current user query
   * @param {Object} options - Pruning options
   * @returns {Promise<PrunedContext>}
   */
  async buildPrunedContext(conversationId, query, options = {}) {
    const startTime = Date.now();
    const { maxMessages = 50, minRelevanceScore = 0.3, adaptiveWindow = true } = options;

    // Assess query complexity for adaptive sizing
    const queryComplexity = this._assessQueryComplexity(query);

    // Adjust token budget based on complexity
    const adjustedMaxTokens = adaptiveWindow
      ? Math.floor(this.maxTotalTokens * (0.7 + 0.3 * queryComplexity))
      : this.maxTotalTokens;

    const episodicTokenBudget = Math.floor(adjustedMaxTokens * this.episodicBudget);
    const semanticTokenBudget = Math.floor(adjustedMaxTokens * this.semanticBudget);
    const summaryTokenBudget = Math.floor(adjustedMaxTokens * this.summaryBudget);

    // Get query embedding
    const queryEmbedding = await this._getQueryEmbedding(query);

    // Fetch all messages
    const allMessages = await Message.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(maxMessages)
      .lean();

    if (allMessages.length === 0) {
      return {
        episodicMemory: [],
        semanticMemory: [],
        summary: null,
        totalTokens: 0,
        stats: { episodicCount: 0, semanticCount: 0, prunedCount: 0 },
      };
    }

    const newestTimestamp = new Date(allMessages[0].timestamp).getTime();

    // Score all messages
    const scoredMessages = await Promise.all(
      allMessages.map(async (msg, idx) => {
        const messageEmbedding = await this._getMessageEmbedding(msg);
        const relevanceScore = cosineSimilarity(queryEmbedding, messageEmbedding);
        const recencyScore = this._calculateRecencyScore(msg.timestamp, newestTimestamp);

        // Recent messages (last 5) are always episodic
        const isRecent = idx < 5;

        return {
          message: msg,
          relevanceScore,
          recencyScore,
          combinedScore: isRecent
            ? 0.3 * relevanceScore + 0.7 * recencyScore // Weight recency for recent
            : 0.7 * relevanceScore + 0.3 * recencyScore, // Weight relevance for older
          memoryType: isRecent ? 'episodic' : 'semantic',
          tokens: estimateTokens(msg.content),
        };
      })
    );

    // Separate episodic (recent) and semantic (relevant) messages
    const episodicCandidates = scoredMessages
      .filter((m) => m.memoryType === 'episodic')
      .sort((a, b) => b.recencyScore - a.recencyScore);

    const semanticCandidates = scoredMessages
      .filter((m) => m.memoryType === 'semantic' && m.relevanceScore >= minRelevanceScore)
      .sort((a, b) => b.combinedScore - a.combinedScore);

    // Select messages within token budgets
    const selectedEpisodic = this._selectWithinBudget(episodicCandidates, episodicTokenBudget);
    const selectedSemantic = this._selectWithinBudget(semanticCandidates, semanticTokenBudget);

    // Get summary if available
    let summary = null;
    const conversationSummary = await ConversationSummary.findOne({ conversationId })
      .sort({ version: -1 })
      .lean();

    if (conversationSummary && estimateTokens(conversationSummary.summary) <= summaryTokenBudget) {
      summary = {
        text: conversationSummary.summary,
        topics: conversationSummary.topics,
        keyInsights: conversationSummary.keyInsights,
        tokens: estimateTokens(conversationSummary.summary),
      };
    }

    // Calculate total tokens
    const episodicTokens = selectedEpisodic.reduce((sum, m) => sum + m.tokens, 0);
    const semanticTokens = selectedSemantic.reduce((sum, m) => sum + m.tokens, 0);
    const summaryTokens = summary?.tokens || 0;
    const totalTokens = episodicTokens + semanticTokens + summaryTokens;

    const result = {
      episodicMemory: selectedEpisodic
        .map((m) => ({
          ...m.message,
          relevanceScore: m.relevanceScore,
          recencyScore: m.recencyScore,
        }))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)), // Chronological order

      semanticMemory: selectedSemantic.map((m) => ({
        ...m.message,
        relevanceScore: m.relevanceScore,
        recencyScore: m.recencyScore,
      })),

      summary,
      totalTokens,

      stats: {
        queryComplexity: queryComplexity.toFixed(2),
        adjustedMaxTokens,
        episodicCount: selectedEpisodic.length,
        semanticCount: selectedSemantic.length,
        prunedCount: allMessages.length - selectedEpisodic.length - selectedSemantic.length,
        episodicTokens,
        semanticTokens,
        summaryTokens,
        processingTimeMs: Date.now() - startTime,
      },
    };

    logger.info('Built pruned context', {
      service: 'context-pruning',
      conversationId,
      ...result.stats,
    });

    return result;
  }

  /**
   * Select messages within token budget
   * @private
   */
  _selectWithinBudget(candidates, budget) {
    const selected = [];
    let usedTokens = 0;

    for (const candidate of candidates) {
      if (usedTokens + candidate.tokens <= budget) {
        selected.push(candidate);
        usedTokens += candidate.tokens;
      }
    }

    return selected;
  }

  /**
   * Format pruned context for LLM prompt
   *
   * @param {PrunedContext} prunedContext - Pruned context
   * @returns {string} Formatted context string
   */
  formatForPrompt(prunedContext) {
    const parts = [];

    // Add summary if available
    if (prunedContext.summary) {
      parts.push(`[Conversation Summary]
${prunedContext.summary.text}

Key Topics: ${prunedContext.summary.topics?.join(', ') || 'N/A'}
Key Insights: ${prunedContext.summary.keyInsights?.join('; ') || 'N/A'}`);
    }

    // Add relevant past context (semantic memory)
    if (prunedContext.semanticMemory.length > 0) {
      const semanticLines = prunedContext.semanticMemory
        .map(
          (m) =>
            `[Relevance: ${(m.relevanceScore * 100).toFixed(0)}%] ${m.role.toUpperCase()}: ${m.content}`
        )
        .join('\n');
      parts.push(`[Relevant Past Messages]\n${semanticLines}`);
    }

    // Add recent context (episodic memory)
    if (prunedContext.episodicMemory.length > 0) {
      const episodicLines = prunedContext.episodicMemory
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');
      parts.push(`[Recent Conversation]\n${episodicLines}`);
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get context for LangChain chat history format
   *
   * @param {PrunedContext} prunedContext - Pruned context
   * @returns {Array} Messages in chat history format
   */
  toChatHistory(prunedContext) {
    const messages = [];

    // Add semantic memory first (older but relevant)
    for (const msg of prunedContext.semanticMemory) {
      messages.push({
        role: msg.role,
        content: msg.content,
        metadata: { type: 'semantic', relevance: msg.relevanceScore },
      });
    }

    // Add episodic memory (recent)
    for (const msg of prunedContext.episodicMemory) {
      messages.push({
        role: msg.role,
        content: msg.content,
        metadata: { type: 'episodic', recency: msg.recencyScore },
      });
    }

    return messages;
  }

  /**
   * Prune and compress context for a given token limit
   *
   * @param {string} conversationId - Conversation ID
   * @param {string} query - Current query
   * @param {number} maxTokens - Maximum tokens allowed
   * @returns {Promise<{context: string, tokens: number}>}
   */
  async pruneToTokenLimit(conversationId, query, maxTokens) {
    // Temporarily adjust max tokens
    const originalMax = this.maxTotalTokens;
    this.maxTotalTokens = maxTokens;

    try {
      const prunedContext = await this.buildPrunedContext(conversationId, query);
      const context = this.formatForPrompt(prunedContext);

      return {
        context,
        tokens: prunedContext.totalTokens,
        stats: prunedContext.stats,
      };
    } finally {
      this.maxTotalTokens = originalMax;
    }
  }

  /**
   * Clear embedding caches
   */
  clearCaches() {
    this.queryEmbeddingCache.clear();
    this.messageEmbeddingCache.clear();
    logger.debug('Cleared context pruning caches', { service: 'context-pruning' });
  }

  /**
   * Get pruning statistics for a conversation
   *
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>}
   */
  async getConversationStats(conversationId) {
    const [messageCount, summary] = await Promise.all([
      Message.countDocuments({ conversationId }),
      ConversationSummary.findOne({ conversationId }).sort({ version: -1 }).lean(),
    ]);

    const messages = await Message.find({ conversationId }).select('content role').lean();

    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    const estimatedTokens = estimateTokens(messages.map((m) => m.content).join(' '));

    return {
      messageCount,
      hasSummary: !!summary,
      summaryVersion: summary?.version || 0,
      estimatedTotalTokens: estimatedTokens,
      avgMessageLength: messageCount > 0 ? Math.round(totalChars / messageCount) : 0,
      wouldRequirePruning: estimatedTokens > this.maxTotalTokens,
    };
  }
}

// Singleton instance
export const contextPruning = new ContextPruningManager();

// Export class for testing
export { ContextPruningManager };
