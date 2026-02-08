/**
 * Query Router Service
 *
 * Routes queries to appropriate retrieval strategies based on intent
 * - Selects optimal retrieval configuration
 * - Handles different response generation paths
 * - Manages intent-specific processing
 *
 * @module services/intent/queryRouter
 */

import { intentClassifier, IntentType, IntentCharacteristics } from './intentClassifier.js';
import { createRedisConnection } from '../../config/redis.js';
import logger from '../../config/logger.js';

/**
 * Redis key prefixes for routing history
 */
const REDIS_KEYS = {
  ROUTING_HISTORY: 'router:history',
  ROUTING_STATS: 'router:stats',
};

/**
 * @typedef {Object} RoutingDecision
 * @property {string} intent - Classified intent
 * @property {number} confidence - Intent confidence
 * @property {string} strategy - Selected retrieval strategy
 * @property {Object} config - Strategy configuration
 * @property {boolean} skipRAG - Whether to skip RAG retrieval
 * @property {string} responseStyle - How to format the response
 */

/**
 * @typedef {Object} RetrievalConfig
 * @property {number} topK - Number of documents to retrieve
 * @property {boolean} useQueryExpansion - Whether to expand query
 * @property {boolean} useHyDE - Whether to use hypothetical document embedding
 * @property {boolean} useReranking - Whether to rerank results
 * @property {number} rerankTopK - Number of documents after reranking
 * @property {boolean} useCompression - Whether to compress documents
 * @property {string} retrievalMode - 'semantic', 'hybrid', 'keyword'
 */

/**
 * Retrieval strategies for each intent type
 */
const RETRIEVAL_STRATEGIES = {
  // Simple fact lookup - focused but comprehensive retrieval
  [IntentType.FACTUAL]: {
    name: 'focused_retrieval',
    config: {
      topK: 12,  // Increased from 8 for better coverage
      useQueryExpansion: true,  // Enabled for better matching
      useHyDE: false,
      useReranking: true,
      rerankTopK: 5,  // Increased from 3 for better diversity
      useCompression: true,
      retrievalMode: 'hybrid',
    },
  },

  // Comparison - multi-aspect retrieval
  [IntentType.COMPARISON]: {
    name: 'multi_aspect_retrieval',
    config: {
      topK: 15,
      useQueryExpansion: true,
      useHyDE: false,
      useReranking: true,
      rerankTopK: 8,
      useCompression: true,
      retrievalMode: 'hybrid',
      splitComparison: true, // Retrieve separately for each compared item
    },
  },

  // Explanation - deep, comprehensive retrieval
  [IntentType.EXPLANATION]: {
    name: 'deep_retrieval',
    config: {
      topK: 20,
      useQueryExpansion: true,
      useHyDE: true,
      useReranking: true,
      rerankTopK: 10,
      useCompression: true,
      retrievalMode: 'semantic',
    },
  },

  // Aggregation - broad retrieval across topics
  [IntentType.AGGREGATION]: {
    name: 'broad_retrieval',
    config: {
      topK: 25,
      useQueryExpansion: true,
      useHyDE: false,
      useReranking: true,
      rerankTopK: 15,
      useCompression: true,
      retrievalMode: 'hybrid',
      diversifyResults: true,
    },
  },

  // Procedural - step-focused retrieval
  [IntentType.PROCEDURAL]: {
    name: 'procedural_retrieval',
    config: {
      topK: 15,
      useQueryExpansion: true,
      useHyDE: true,
      useReranking: true,
      rerankTopK: 8,
      useCompression: false, // Keep full context for steps
      retrievalMode: 'semantic',
    },
  },

  // Clarification - context-focused, minimal retrieval
  [IntentType.CLARIFICATION]: {
    name: 'context_only',
    config: {
      topK: 3,
      useQueryExpansion: false,
      useHyDE: false,
      useReranking: false,
      rerankTopK: 3,
      useCompression: false,
      retrievalMode: 'semantic',
      prioritizeContext: true,
    },
  },

  // Chitchat - no retrieval
  [IntentType.CHITCHAT]: {
    name: 'no_retrieval',
    config: {
      topK: 0,
      useQueryExpansion: false,
      useHyDE: false,
      useReranking: false,
      rerankTopK: 0,
      useCompression: false,
      retrievalMode: 'none',
    },
  },

  // Out of scope - still search the workspace first, then report "not found"
  // Changed from 'decline' to 'workspace_search' - we should always try to search
  // the user's connected Notion before saying we can't help
  [IntentType.OUT_OF_SCOPE]: {
    name: 'workspace_search',
    config: {
      topK: 5, // Quick search to verify nothing matches
      useQueryExpansion: false,
      useHyDE: false,
      useReranking: true,
      rerankTopK: 3,
      useCompression: false,
      retrievalMode: 'hybrid',
    },
  },

  // Opinion - balanced retrieval for recommendations
  [IntentType.OPINION]: {
    name: 'balanced_retrieval',
    config: {
      topK: 12,
      useQueryExpansion: true,
      useHyDE: false,
      useReranking: true,
      rerankTopK: 6,
      useCompression: true,
      retrievalMode: 'hybrid',
      includeAlternatives: true,
    },
  },

  // Temporal - time-filtered retrieval
  [IntentType.TEMPORAL]: {
    name: 'temporal_retrieval',
    config: {
      topK: 15,
      useQueryExpansion: false,
      useHyDE: false,
      useReranking: true,
      rerankTopK: 8,
      useCompression: true,
      retrievalMode: 'hybrid',
      sortByDate: true,
    },
  },
};

/**
 * Response generation prompts for each intent
 */
const RESPONSE_PROMPTS = {
  [IntentType.FACTUAL]: `Answer the question directly and concisely. Cite your sources using [1], [2], etc.`,

  [IntentType.COMPARISON]: `Compare the items systematically:
1. Identify key comparison dimensions
2. Present findings in a structured format (table or bullet points)
3. Highlight key differences and similarities
4. Cite sources for each point.`,

  [IntentType.EXPLANATION]: `Provide a comprehensive explanation:
1. Start with a brief overview
2. Explain the key concepts in detail
3. Use examples where helpful
4. Build from simple to complex
5. Cite sources throughout.`,

  [IntentType.AGGREGATION]: `Summarize the information:
1. Group related items together
2. Present as a clear list or summary
3. Highlight the most important points
4. Note any patterns or themes
5. Cite sources for each major point.`,

  [IntentType.PROCEDURAL]: `Provide step-by-step instructions:
1. List prerequisites if any
2. Number each step clearly
3. Include any warnings or tips
4. Note expected outcomes
5. Cite sources for procedures.`,

  [IntentType.CLARIFICATION]: `Based on our conversation context, provide the clarification requested. Reference the previous discussion where relevant.`,

  [IntentType.CHITCHAT]: `Respond conversationally and helpfully. You are a knowledge assistant - be friendly but guide users toward using the knowledge base if they have questions.`,

  [IntentType.OUT_OF_SCOPE]: `If you found relevant information, answer the question using that information.
If no relevant information was found, explain that you searched the connected Notion workspace but didn't find information about this topic.
Offer to provide a general explanation if that would be helpful, or suggest the user rephrase their question.
Never refuse or say the question is "out of scope" - instead say "I didn't find this in your Notion pages".`,

  [IntentType.OPINION]: `Provide a balanced recommendation:
1. Present relevant options found in the knowledge base
2. List pros and cons of each
3. Avoid personal bias - base recommendations on documented information
4. Cite sources for all claims.`,

  [IntentType.TEMPORAL]: `Present information chronologically:
1. Order findings by time/date
2. Highlight recent developments
3. Note any changes over time
4. Cite sources with dates where available.`,
};

/**
 * Query Router
 * Uses Redis for distributed routing history (horizontal scaling)
 */
class QueryRouter {
  constructor() {
    this.classifier = intentClassifier;
    this.maxHistorySize = 100;
    this.redis = null;
    this._connecting = false;
  }

  /**
   * Ensure Redis connection is established
   * @private
   */
  async _ensureConnection() {
    if (this.redis?.status === 'ready') return;
    if (this._connecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this._ensureConnection();
    }

    this._connecting = true;
    try {
      this.redis = createRedisConnection();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
        this.redis.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.redis.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      logger.info('Query router Redis connection established', { service: 'query-router' });
    } catch (error) {
      logger.warn('Query router Redis connection failed', {
        service: 'query-router',
        error: error.message,
      });
      this.redis = null;
    } finally {
      this._connecting = false;
    }
  }

  /**
   * Route a query to the appropriate strategy
   *
   * @param {string} query - User query
   * @param {Object} options - Routing options
   * @returns {Promise<RoutingDecision>}
   */
  async route(query, options = {}) {
    const { conversationHistory = [], forceIntent = null } = options;
    const startTime = Date.now();

    try {
      // Classify intent (or use forced intent)
      let intentResult;
      if (forceIntent && Object.values(IntentType).includes(forceIntent)) {
        intentResult = {
          intent: forceIntent,
          confidence: 1.0,
          reasoning: 'Forced intent override',
          entities: [],
          isFollowUp: false,
        };
      } else {
        intentResult = await this.classifier.classify(query, { conversationHistory });
      }

      // Get strategy for intent
      const strategy =
        RETRIEVAL_STRATEGIES[intentResult.intent] || RETRIEVAL_STRATEGIES[IntentType.FACTUAL];

      // Get characteristics
      const characteristics =
        IntentCharacteristics[intentResult.intent] || IntentCharacteristics[IntentType.FACTUAL];

      // Build routing decision
      const decision = {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        reasoning: intentResult.reasoning,
        entities: intentResult.entities,
        isFollowUp: intentResult.isFollowUp,
        strategy: strategy.name,
        config: { ...strategy.config },
        skipRAG: !characteristics.requiresRAG,
        needsContext: characteristics.needsContext,
        responseStyle: characteristics.responseStyle,
        responsePrompt: RESPONSE_PROMPTS[intentResult.intent],
        processingTimeMs: Date.now() - startTime,
      };

      // Adjust config based on confidence
      if (intentResult.confidence < 0.7) {
        // Lower confidence - be more conservative, retrieve more
        decision.config.topK = Math.min(decision.config.topK + 5, 25);
        decision.config.useReranking = true;
      }

      // Track routing history
      this._trackRouting(query, decision);

      logger.info('Routed query to strategy', {
        service: 'query-router',
        intent: decision.intent,
        strategy: decision.strategy,
        skipRAG: decision.skipRAG,
        confidence: decision.confidence.toFixed(2),
        topK: decision.config.topK,
        processingTimeMs: decision.processingTimeMs,
      });

      return decision;
    } catch (error) {
      logger.error('Query routing failed', {
        service: 'query-router',
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      // Default to factual intent with full retrieval
      return {
        intent: IntentType.FACTUAL,
        confidence: 0.3,
        reasoning: `Routing failed: ${error.message}`,
        entities: [],
        isFollowUp: false,
        strategy: 'focused_retrieval',
        config: RETRIEVAL_STRATEGIES[IntentType.FACTUAL].config,
        skipRAG: false,
        needsContext: false,
        responseStyle: 'concise',
        responsePrompt: RESPONSE_PROMPTS[IntentType.FACTUAL],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Get comparison queries for multi-aspect retrieval
   *
   * @param {string} query - Original query
   * @param {string[]} entities - Entities to compare
   * @returns {string[]} Queries for each entity
   */
  getComparisonQueries(query, entities) {
    if (!entities || entities.length < 2) {
      return [query];
    }

    return entities.map(
      (entity) =>
        `${entity} ${query
          .replace(/\bvs\.?\b|\bversus\b/gi, '')
          .replace(entities.join('|'), '')
          .trim()}`
    );
  }

  /**
   * Track routing decision in history
   * @private
   */
  async _trackRouting(query, decision) {
    await this._ensureConnection();
    if (!this.redis) return;

    const entry = JSON.stringify({
      timestamp: Date.now(),
      query: query.substring(0, 100),
      intent: decision.intent,
      strategy: decision.strategy,
      confidence: decision.confidence,
    });

    try {
      // Use Redis list with automatic trimming
      await this.redis.lpush(REDIS_KEYS.ROUTING_HISTORY, entry);
      await this.redis.ltrim(REDIS_KEYS.ROUTING_HISTORY, 0, this.maxHistorySize - 1);

      // Update intent/strategy counters
      await this.redis.hincrby(REDIS_KEYS.ROUTING_STATS, `intent:${decision.intent}`, 1);
      await this.redis.hincrby(REDIS_KEYS.ROUTING_STATS, `strategy:${decision.strategy}`, 1);
      await this.redis.hincrby(REDIS_KEYS.ROUTING_STATS, 'total', 1);
      await this.redis.hincrbyfloat(
        REDIS_KEYS.ROUTING_STATS,
        'confidence_sum',
        decision.confidence
      );
    } catch (error) {
      logger.debug('Failed to track routing', { service: 'query-router', error: error.message });
    }
  }

  /**
   * Get routing statistics
   *
   * @returns {Promise<Object>} Routing statistics
   */
  async getStats() {
    await this._ensureConnection();

    if (!this.redis) {
      return {
        totalRouted: 0,
        intentDistribution: {},
        strategyDistribution: {},
        avgConfidence: 0,
        redisConnected: false,
      };
    }

    try {
      const stats = await this.redis.hgetall(REDIS_KEYS.ROUTING_STATS);
      const recentHistory = await this.redis.lrange(REDIS_KEYS.ROUTING_HISTORY, 0, 9);

      const intentDistribution = {};
      const strategyDistribution = {};
      let total = 0;
      let confidenceSum = 0;

      for (const [key, value] of Object.entries(stats)) {
        if (key.startsWith('intent:')) {
          intentDistribution[key.replace('intent:', '')] = parseInt(value, 10);
        } else if (key.startsWith('strategy:')) {
          strategyDistribution[key.replace('strategy:', '')] = parseInt(value, 10);
        } else if (key === 'total') {
          total = parseInt(value, 10);
        } else if (key === 'confidence_sum') {
          confidenceSum = parseFloat(value);
        }
      }

      const recentIntents = recentHistory.map((entry) => {
        try {
          return JSON.parse(entry).intent;
        } catch {
          return 'unknown';
        }
      });

      return {
        totalRouted: total,
        intentDistribution,
        strategyDistribution,
        avgConfidence: total > 0 ? (confidenceSum / total).toFixed(2) : '0',
        recentIntents,
        redisConnected: true,
      };
    } catch (error) {
      logger.warn('Failed to get routing stats', { service: 'query-router', error: error.message });
      return {
        totalRouted: 0,
        intentDistribution: {},
        strategyDistribution: {},
        avgConfidence: 0,
        redisConnected: false,
        error: error.message,
      };
    }
  }

  /**
   * Clear routing history
   */
  async clearHistory() {
    await this._ensureConnection();

    if (this.redis) {
      try {
        await this.redis.del(REDIS_KEYS.ROUTING_HISTORY);
        await this.redis.del(REDIS_KEYS.ROUTING_STATS);
        logger.debug('Cleared routing history', { service: 'query-router' });
      } catch (error) {
        logger.warn('Failed to clear history', { service: 'query-router', error: error.message });
      }
    }
  }
}

// Singleton instance
export const queryRouter = new QueryRouter();

// Export class and constants for testing
export { QueryRouter, RETRIEVAL_STRATEGIES, RESPONSE_PROMPTS };
