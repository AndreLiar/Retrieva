/**
 * Intent Classification Service
 *
 * Classifies user queries into intent categories for routing
 * - Uses LLM for semantic understanding
 * - Supports multiple intent types
 * - Provides confidence scores
 *
 * @module services/intent/intentClassifier
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import { createRedisConnection } from '../../config/redis.js';
import logger from '../../config/logger.js';

/**
 * Redis key prefixes for distributed caching
 */
const REDIS_KEYS = {
  INTENT_CACHE: 'intent:cache:',
  STATS: 'intent:stats',
};

/**
 * @typedef {Object} IntentResult
 * @property {string} intent - Classified intent type
 * @property {number} confidence - Confidence score (0-1)
 * @property {string} reasoning - Brief explanation of classification
 * @property {Object} metadata - Additional classification metadata
 */

/**
 * Intent Types
 */
export const IntentType = {
  FACTUAL: 'factual', // Simple fact lookup ("What is X?")
  COMPARISON: 'comparison', // Compare multiple items ("X vs Y")
  EXPLANATION: 'explanation', // Detailed explanation ("How does X work?")
  AGGREGATION: 'aggregation', // Summarize/aggregate ("List all X", "Summary of Y")
  PROCEDURAL: 'procedural', // Step-by-step instructions ("How to do X?")
  CLARIFICATION: 'clarification', // Follow-up on previous context
  CHITCHAT: 'chitchat', // Greetings, small talk
  OUT_OF_SCOPE: 'out_of_scope', // Query outside knowledge base scope
  OPINION: 'opinion', // Seeking opinion/recommendation
  TEMPORAL: 'temporal', // Time-specific queries ("What happened in X?")
};

/**
 * Intent characteristics for routing decisions
 */
export const IntentCharacteristics = {
  [IntentType.FACTUAL]: {
    requiresRAG: true,
    retrievalDepth: 'shallow', // Few highly relevant docs
    retrievalCount: 5,
    needsContext: false,
    responseStyle: 'concise',
  },
  [IntentType.COMPARISON]: {
    requiresRAG: true,
    retrievalDepth: 'multi', // Multiple doc sets for comparison
    retrievalCount: 10,
    needsContext: false,
    responseStyle: 'structured',
  },
  [IntentType.EXPLANATION]: {
    requiresRAG: true,
    retrievalDepth: 'deep', // Many docs for comprehensive answer
    retrievalCount: 15,
    needsContext: false,
    responseStyle: 'detailed',
  },
  [IntentType.AGGREGATION]: {
    requiresRAG: true,
    retrievalDepth: 'broad', // Wide retrieval across topics
    retrievalCount: 20,
    needsContext: false,
    responseStyle: 'summary',
  },
  [IntentType.PROCEDURAL]: {
    requiresRAG: true,
    retrievalDepth: 'deep',
    retrievalCount: 10,
    needsContext: false,
    responseStyle: 'step_by_step',
  },
  [IntentType.CLARIFICATION]: {
    requiresRAG: false, // Use conversation context primarily
    retrievalDepth: 'none',
    retrievalCount: 3,
    needsContext: true,
    responseStyle: 'contextual',
  },
  [IntentType.CHITCHAT]: {
    requiresRAG: false, // No retrieval needed
    retrievalDepth: 'none',
    retrievalCount: 0,
    needsContext: false,
    responseStyle: 'conversational',
  },
  [IntentType.OUT_OF_SCOPE]: {
    // Changed: Try RAG first, then report "not found" instead of refusing
    // When workspace is connected, we should search first before declining
    requiresRAG: true,
    retrievalDepth: 'shallow', // Quick search to verify nothing matches
    retrievalCount: 5,
    needsContext: false,
    responseStyle: 'not_found', // Changed from 'decline' to 'not_found'
  },
  [IntentType.OPINION]: {
    requiresRAG: true,
    retrievalDepth: 'moderate',
    retrievalCount: 8,
    needsContext: false,
    responseStyle: 'balanced',
  },
  [IntentType.TEMPORAL]: {
    requiresRAG: true,
    retrievalDepth: 'filtered', // Time-filtered retrieval
    retrievalCount: 10,
    needsContext: false,
    responseStyle: 'chronological',
  },
};

// Classification LLM
const classifierLlm = new ChatOllama({
  model: process.env.CLASSIFIER_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.1,
  numPredict: 300,
  format: 'json',
});

// Intent classification prompt
const INTENT_CLASSIFICATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an intent classifier for a RAG (Retrieval-Augmented Generation) system.
Classify the user's query into one of these intent categories:

INTENT TYPES:
- factual: Simple fact lookup questions ("What is X?", "Who is Y?", "When did Z happen?")
- comparison: Comparing multiple items ("X vs Y", "Difference between X and Y", "Compare X to Y")
- explanation: Requests for detailed explanations ("How does X work?", "Why does X happen?", "Explain X")
- aggregation: Summarization or listing requests ("List all X", "Summary of Y", "What are the main X?")
- procedural: Step-by-step instructions ("How to do X?", "Steps to accomplish Y", "Guide for X")
- clarification: Follow-up questions referencing previous context ("What did you mean by that?", "Can you elaborate?", "More details on that")
- chitchat: Greetings, small talk, non-informational queries ("Hello", "Thanks", "How are you?")
- out_of_scope: Queries clearly outside a knowledge base (personal requests, real-time data, harmful content)
- opinion: Seeking recommendations or opinions ("Should I use X?", "What's the best Y?", "Is X good?")
- temporal: Time-specific queries ("What happened last week?", "Recent updates on X", "History of Y")

CLASSIFICATION RULES:
1. Choose the MOST specific intent that matches
2. If query references "that", "this", "it", "above", "previous" → likely clarification
3. Single-word greetings or thanks → chitchat
4. Questions with "vs", "versus", "compare", "difference" → comparison
5. Questions with "how to", "steps", "guide" → procedural
6. Questions with "list", "all", "summary", "overview" → aggregation

Respond with valid JSON only:
{{
  "intent": "intent_type",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "entities": ["key", "entities", "mentioned"],
  "isFollowUp": true/false
}}`,
  ],
  [
    'user',
    `Conversation Context (last 3 messages):
{conversationContext}

Current Query: {query}

Classify this query's intent as JSON.`,
  ],
]);

// Quick pattern-based pre-classifier for obvious cases
const QUICK_PATTERNS = {
  chitchat: [
    /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening))[\s!.]*$/i,
    /^(thanks|thank\s*you|thx|ty)[\s!.]*$/i,
    /^(bye|goodbye|see\s*you|later)[\s!.]*$/i,
    /^(how\s*are\s*you|what'?s\s*up)[\s?!.]*$/i,
  ],
  clarification: [
    /^(what\s*(do\s*you\s*mean|did\s*you\s*mean)|can\s*you\s*explain|elaborate|more\s*(details?|info))[\s?]*$/i,
    /^(tell\s*me\s*more|go\s*on|continue|and\s*then)[\s?]*$/i,
  ],
  comparison: [/\bvs\.?\b|\bversus\b|\bcompare\b|\bdifference\s*(between|of)\b/i],
  procedural: [
    /^how\s*(do\s*i|to|can\s*i)\b/i,
    /\b(steps?\s*(to|for)|guide\s*(to|for)|tutorial)\b/i,
  ],
  aggregation: [/^(list|show|give\s*me)\s*(all|the)\b/i, /\b(summary|overview|summarize)\b/i],
};

// Short affirmations that are context-dependent: chitchat if first message, clarification if in conversation
const SHORT_AFFIRMATION_PATTERN = /^(ok|okay|sure|yes|no|alright|yeah|yep|nope|nah)[\s!.]*$/i;

/**
 * Keyword-based scoring for intents not covered by quick regex patterns.
 * Runs between regex and LLM to reduce LLM calls for common patterns.
 * @private
 */
const KEYWORD_SIGNALS = {
  [IntentType.EXPLANATION]: [
    { phrase: 'explain', weight: 2.0 },
    { phrase: 'why does', weight: 2.0 },
    { phrase: 'why do', weight: 2.0 },
    { phrase: 'why is', weight: 1.5 },
    { phrase: 'why are', weight: 1.5 },
    { phrase: 'how does', weight: 1.5 },
    { phrase: 'what causes', weight: 1.5 },
    { phrase: 'reason for', weight: 1.5 },
    { phrase: 'mechanism', weight: 1.0 },
  ],
  [IntentType.FACTUAL]: [
    { phrase: 'what is', weight: 2.0 },
    { phrase: 'what are', weight: 2.0 },
    { phrase: 'who is', weight: 2.0 },
    { phrase: 'who are', weight: 2.0 },
    { phrase: 'where is', weight: 2.0 },
    { phrase: 'define', weight: 2.0 },
    { phrase: 'meaning of', weight: 2.0 },
    { phrase: 'definition of', weight: 2.0 },
  ],
  [IntentType.OPINION]: [
    { phrase: 'should i', weight: 2.0 },
    { phrase: 'should we', weight: 2.0 },
    { phrase: 'do you recommend', weight: 2.0 },
    { phrase: 'is it worth', weight: 1.5 },
    { phrase: 'pros and cons', weight: 2.0 },
    { phrase: 'which is better', weight: 2.0 },
    { phrase: 'best practice', weight: 1.5 },
    { phrase: 'recommend', weight: 1.0 },
  ],
  [IntentType.TEMPORAL]: [
    { phrase: 'last week', weight: 2.0 },
    { phrase: 'last month', weight: 2.0 },
    { phrase: 'last year', weight: 2.0 },
    { phrase: 'recently', weight: 1.5 },
    { phrase: 'latest', weight: 1.5 },
    { phrase: 'what changed', weight: 1.5 },
    { phrase: 'history of', weight: 1.5 },
    { phrase: 'timeline', weight: 1.5 },
    { phrase: 'recent update', weight: 2.0 },
    { phrase: 'recent change', weight: 2.0 },
  ],
};

/**
 * Quick pattern-based classification for obvious intents.
 * Context-aware: short affirmations in active conversations become clarifications.
 * @private
 */
function quickClassify(query, conversationHistory = []) {
  const trimmedQuery = query.trim();

  // Handle short affirmations with context awareness
  if (SHORT_AFFIRMATION_PATTERN.test(trimmedQuery)) {
    if (conversationHistory.length > 0) {
      return {
        intent: IntentType.CLARIFICATION,
        confidence: 0.85,
        reasoning: 'Short affirmation in active conversation treated as continuation',
        entities: [],
        isFollowUp: true,
        quickMatch: true,
      };
    }
    return {
      intent: IntentType.CHITCHAT,
      confidence: 0.95,
      reasoning: 'Pattern-matched quick classification',
      entities: [],
      isFollowUp: false,
      quickMatch: true,
    };
  }

  for (const [intent, patterns] of Object.entries(QUICK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmedQuery)) {
        return {
          intent,
          confidence: 0.95,
          reasoning: 'Pattern-matched quick classification',
          entities: [],
          isFollowUp: false,
          quickMatch: true,
        };
      }
    }
  }

  return null;
}

/**
 * Keyword-based scoring classification for intents missed by regex.
 * Reduces LLM calls for common query patterns.
 * @private
 */
function keywordScoreClassify(query) {
  const lower = query.toLowerCase().trim();

  let bestIntent = null;
  let bestScore = 0;

  for (const [intent, signals] of Object.entries(KEYWORD_SIGNALS)) {
    let score = 0;
    for (const { phrase, weight } of signals) {
      if (lower.includes(phrase)) {
        score += weight;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  }

  // Require minimum score threshold (at least one strong match)
  if (bestIntent && bestScore >= 1.5) {
    return {
      intent: bestIntent,
      confidence: Math.min(0.85, 0.65 + bestScore * 0.05),
      reasoning: `Keyword-scored classification (score: ${bestScore.toFixed(1)})`,
      entities: [],
      isFollowUp: false,
      quickMatch: false,
    };
  }

  return null;
}

/**
 * Parse LLM classification response
 * @private
 */
function parseClassificationResponse(response) {
  try {
    const parsed = JSON.parse(response);
    return {
      intent: parsed.intent || IntentType.FACTUAL,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reasoning: parsed.reasoning || 'No reasoning provided',
      entities: parsed.entities || [],
      isFollowUp: parsed.isFollowUp || false,
    };
  } catch {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || IntentType.FACTUAL,
          confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
          reasoning: parsed.reasoning || 'Extracted from response',
          entities: parsed.entities || [],
          isFollowUp: parsed.isFollowUp || false,
        };
      } catch {
        // Fall through
      }
    }

    logger.warn('Failed to parse intent classification response', {
      service: 'intent-classifier',
      response: response.substring(0, 200),
    });

    return {
      intent: IntentType.FACTUAL,
      confidence: 0.3,
      reasoning: 'Failed to parse, defaulting to factual',
      entities: [],
      isFollowUp: false,
    };
  }
}

/**
 * Intent Classifier
 * Uses Redis for distributed caching (horizontal scaling)
 */
class IntentClassifier {
  constructor() {
    this.redis = null;
    this.cacheMaxSize = 500;
    this.cacheTTLSeconds = 5 * 60; // 5 minutes in seconds
    this._connecting = false;
  }

  /**
   * Ensure Redis connection is established
   * @private
   */
  async _ensureConnection() {
    if (this.redis?.status === 'ready') return;
    if (this._connecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this._ensureConnection();
    }

    this._connecting = true;
    try {
      this.redis = createRedisConnection();
      // Wait for ready state
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
      logger.info('Intent classifier Redis connection established', {
        service: 'intent-classifier',
      });
    } catch (error) {
      logger.warn('Intent classifier Redis connection failed, falling back to no-cache mode', {
        service: 'intent-classifier',
        error: error.message,
      });
      this.redis = null;
    } finally {
      this._connecting = false;
    }
  }

  /**
   * Get cache key for query (includes Redis prefix)
   * @private
   */
  _getCacheKey(query, contextHash) {
    const baseKey = `${query.toLowerCase().trim()}:${contextHash}`;
    // Create a simple hash to avoid overly long keys
    const hash = Buffer.from(baseKey).toString('base64').substring(0, 64);
    return `${REDIS_KEYS.INTENT_CACHE}${hash}`;
  }

  /**
   * Hash conversation context for caching
   * @private
   */
  _hashContext(context) {
    if (!context || context.length === 0) return 'no_context';
    return context
      .map((m) => m.content?.substring(0, 50) || '')
      .join('|')
      .substring(0, 100);
  }

  /**
   * Format conversation context for prompt
   * @private
   */
  _formatContext(messages) {
    if (!messages || messages.length === 0) {
      return 'No previous context.';
    }

    return messages
      .slice(-3)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');
  }

  /**
   * Classify query intent
   *
   * @param {string} query - User query
   * @param {Object} options - Classification options
   * @param {Array} [options.conversationHistory] - Previous messages for context
   * @param {boolean} [options.useCache=true] - Whether to use caching
   * @returns {Promise<IntentResult>}
   */
  async classify(query, options = {}) {
    const { conversationHistory = [], useCache = true } = options;
    const startTime = Date.now();

    // Tier 1: Quick pattern matching (regex)
    const quickResult = quickClassify(query, conversationHistory);
    if (quickResult) {
      logger.debug('Quick classified intent', {
        service: 'intent-classifier',
        intent: quickResult.intent,
        confidence: quickResult.confidence,
        processingTimeMs: Date.now() - startTime,
      });
      return quickResult;
    }

    // Tier 2: Keyword scoring (catches common patterns without LLM cost)
    const keywordResult = keywordScoreClassify(query);
    if (keywordResult) {
      logger.debug('Keyword-scored intent', {
        service: 'intent-classifier',
        intent: keywordResult.intent,
        confidence: keywordResult.confidence,
        processingTimeMs: Date.now() - startTime,
      });
      return keywordResult;
    }

    // Tier 3: LLM classification (check Redis cache first)
    const contextHash = this._hashContext(conversationHistory);
    const cacheKey = this._getCacheKey(query, contextHash);

    if (useCache) {
      await this._ensureConnection();
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            const result = JSON.parse(cached);
            logger.debug('Returning cached intent classification', {
              service: 'intent-classifier',
              intent: result.intent,
              source: 'redis',
            });
            // Track cache hit
            await this.redis.hincrby(REDIS_KEYS.STATS, 'cache_hits', 1).catch(() => {});
            return result;
          }
        } catch (error) {
          logger.debug('Cache lookup failed', {
            service: 'intent-classifier',
            error: error.message,
          });
        }
      }
    }

    try {
      // Use LLM for classification
      const chain = INTENT_CLASSIFICATION_PROMPT.pipe(classifierLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        query,
        conversationContext: this._formatContext(conversationHistory),
      });

      const result = parseClassificationResponse(response);

      // Validate intent type
      if (!Object.values(IntentType).includes(result.intent)) {
        result.intent = IntentType.FACTUAL;
        result.confidence *= 0.8;
      }

      // Cache result in Redis with TTL (auto-expires, no manual eviction needed)
      if (useCache && this.redis) {
        try {
          await this.redis.setex(cacheKey, this.cacheTTLSeconds, JSON.stringify(result));
          // Track cache miss (new classification)
          await this.redis.hincrby(REDIS_KEYS.STATS, 'cache_misses', 1).catch(() => {});
          await this.redis.hincrby(REDIS_KEYS.STATS, 'total_classifications', 1).catch(() => {});
        } catch (error) {
          logger.debug('Cache write failed', {
            service: 'intent-classifier',
            error: error.message,
          });
        }
      }

      logger.info('Classified query intent', {
        service: 'intent-classifier',
        intent: result.intent,
        confidence: result.confidence.toFixed(2),
        isFollowUp: result.isFollowUp,
        processingTimeMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      logger.error('Intent classification failed', {
        service: 'intent-classifier',
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      // Default to factual with low confidence
      return {
        intent: IntentType.FACTUAL,
        confidence: 0.3,
        reasoning: `Classification failed: ${error.message}`,
        entities: [],
        isFollowUp: false,
      };
    }
  }

  /**
   * Get retrieval characteristics for an intent
   *
   * @param {string} intent - Intent type
   * @returns {Object} Intent characteristics
   */
  getCharacteristics(intent) {
    return IntentCharacteristics[intent] || IntentCharacteristics[IntentType.FACTUAL];
  }

  /**
   * Check if intent requires RAG retrieval
   *
   * @param {string} intent - Intent type
   * @returns {boolean}
   */
  requiresRAG(intent) {
    const chars = this.getCharacteristics(intent);
    return chars.requiresRAG;
  }

  /**
   * Clear classification cache
   */
  async clearCache() {
    if (!this.redis) {
      await this._ensureConnection();
    }

    if (this.redis) {
      try {
        // Find and delete all intent cache keys
        const keys = await this.redis.keys(`${REDIS_KEYS.INTENT_CACHE}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        // Reset stats
        await this.redis.del(REDIS_KEYS.STATS);
        logger.debug('Cleared intent classification cache', {
          service: 'intent-classifier',
          keysCleared: keys.length,
        });
      } catch (error) {
        logger.warn('Failed to clear cache', {
          service: 'intent-classifier',
          error: error.message,
        });
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    if (!this.redis) {
      await this._ensureConnection();
    }

    if (!this.redis) {
      return {
        size: 0,
        maxSize: this.cacheMaxSize,
        ttlSeconds: this.cacheTTLSeconds,
        cacheHits: 0,
        cacheMisses: 0,
        hitRate: '0%',
        redisConnected: false,
      };
    }

    try {
      // Count cache keys
      const keys = await this.redis.keys(`${REDIS_KEYS.INTENT_CACHE}*`);
      const stats = await this.redis.hgetall(REDIS_KEYS.STATS);

      const hits = parseInt(stats.cache_hits || '0', 10);
      const misses = parseInt(stats.cache_misses || '0', 10);
      const total = hits + misses;

      return {
        size: keys.length,
        maxSize: this.cacheMaxSize,
        ttlSeconds: this.cacheTTLSeconds,
        cacheHits: hits,
        cacheMisses: misses,
        totalClassifications: parseInt(stats.total_classifications || '0', 10),
        hitRate: total > 0 ? `${((hits / total) * 100).toFixed(1)}%` : '0%',
        redisConnected: true,
      };
    } catch (error) {
      logger.warn('Failed to get cache stats', {
        service: 'intent-classifier',
        error: error.message,
      });
      return {
        size: 0,
        maxSize: this.cacheMaxSize,
        ttlSeconds: this.cacheTTLSeconds,
        redisConnected: false,
        error: error.message,
      };
    }
  }
}

// Singleton instance
export const intentClassifier = new IntentClassifier();

// Export class and types for testing
export { IntentClassifier };
