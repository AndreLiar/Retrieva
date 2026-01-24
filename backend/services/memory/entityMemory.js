/**
 * Entity Memory Service
 *
 * M3 COMPRESSED MEMORY + M4 WORKING MEMORY: Manages entity memory for conversations
 * - Tracks entities mentioned in conversations
 * - Provides entity context for better responses
 * - Links conversation entities to document entities
 * - Uses Redis for distributed/scalable caching
 *
 * @module services/memory/entityMemory
 */

import { Entity } from '../../models/Entity.js';
import { DocumentSummary } from '../../models/DocumentSummary.js';
import {
  extractMessageEntities,
  buildEntityContext,
  getRelatedEntities,
} from './entityExtraction.js';
import { getRelevantSummaries, buildSummaryContext } from './summarization.js';
import { redisConnection } from '../../config/redis.js';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} MemoryContext
 * @property {string} entityContext - Formatted entity context
 * @property {string} summaryContext - Relevant document summaries
 * @property {Entity[]} mentionedEntities - Entities mentioned in conversation
 * @property {DocumentSummary[]} relevantSummaries - Related document summaries
 */

// Redis key prefixes
const REDIS_KEYS = {
  CONVERSATION_ENTITIES: 'memory:conv:entities:', // Set of entity IDs per conversation
  ENTITY_CACHE: 'memory:entity:cache:', // Cached entity data
  STATS: 'memory:stats', // Global stats hash
};

// TTL for conversation entity tracking (24 hours)
const CONVERSATION_ENTITY_TTL = 24 * 60 * 60;
// TTL for entity cache (1 hour)
const ENTITY_CACHE_TTL = 60 * 60;

/**
 * Entity Memory Manager
 * Uses Redis for distributed caching and horizontal scaling
 */
class EntityMemoryManager {
  constructor() {
    this.redis = redisConnection;
    this.initialized = false;
  }

  /**
   * Ensure Redis connection is ready
   */
  async ensureConnection() {
    if (this.redis.status !== 'ready') {
      await new Promise((resolve) => {
        if (this.redis.status === 'ready') {
          resolve();
        } else {
          this.redis.once('ready', resolve);
        }
      });
    }
    this.initialized = true;
  }

  /**
   * Get Redis key for conversation entities
   */
  getConversationKey(conversationId) {
    return `${REDIS_KEYS.CONVERSATION_ENTITIES}${conversationId}`;
  }

  /**
   * Process a user message and extract entity mentions
   *
   * @param {string} message - User message
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Entity[]>} Mentioned entities
   */
  async processMessage(message, workspaceId, conversationId) {
    try {
      await this.ensureConnection();
      const entities = await extractMessageEntities(message, workspaceId);

      // Track entities in Redis Set
      const key = this.getConversationKey(conversationId);

      if (entities.length > 0) {
        const entityIds = entities.map((e) => e._id.toString());
        await this.redis.sadd(key, ...entityIds);
        await this.redis.expire(key, CONVERSATION_ENTITY_TTL);

        // Update stats
        await this.redis.hincrby(REDIS_KEYS.STATS, 'entitiesProcessed', entities.length);
        await this.redis.hincrby(REDIS_KEYS.STATS, 'messagesProcessed', 1);
      }

      logger.debug('Processed message entities', {
        service: 'entity-memory',
        conversationId,
        entitiesFound: entities.length,
        entityNames: entities.map((e) => e.name),
      });

      return entities;
    } catch (error) {
      logger.error('Failed to process message entities', {
        service: 'entity-memory',
        conversationId,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get conversation entity context
   * Returns entities mentioned in this conversation
   *
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Entity[]>} Conversation entities
   */
  async getConversationEntities(conversationId) {
    try {
      await this.ensureConnection();

      const key = this.getConversationKey(conversationId);
      const entityIds = await this.redis.smembers(key);

      if (!entityIds || entityIds.length === 0) {
        return [];
      }

      // Refresh TTL on access
      await this.redis.expire(key, CONVERSATION_ENTITY_TTL);

      return Entity.find({
        _id: { $in: entityIds },
      }).select('name type description documentSources relationships stats');
    } catch (error) {
      logger.error('Failed to get conversation entities', {
        service: 'entity-memory',
        conversationId,
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Build comprehensive memory context for a question
   * Combines entity memory with relevant summaries
   *
   * @param {string} question - User question
   * @param {string} workspaceId - Workspace ID
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<MemoryContext>} Memory context
   */
  async buildMemoryContext(question, workspaceId, conversationId) {
    const startTime = Date.now();

    try {
      await this.ensureConnection();

      // Track context build
      await this.redis.hincrby(REDIS_KEYS.STATS, 'contextBuilds', 1);

      // 1. Extract entities from current question
      const questionEntities = await extractMessageEntities(question, workspaceId);

      // Track in conversation memory
      await this.processMessage(question, workspaceId, conversationId);

      // 2. Get conversation entities (from past messages)
      const conversationEntities = await this.getConversationEntities(conversationId);

      // 3. Combine and deduplicate entities
      const allEntities = [...questionEntities];
      const entityIds = new Set(questionEntities.map((e) => e._id.toString()));

      for (const entity of conversationEntities) {
        if (!entityIds.has(entity._id.toString())) {
          allEntities.push(entity);
          entityIds.add(entity._id.toString());
        }
      }

      // 4. Get related entities for richer context
      const entityNames = allEntities.map((e) => e.name);
      const relatedEntities = await getRelatedEntities(workspaceId, entityNames, { limit: 5 });

      for (const entity of relatedEntities) {
        if (!entityIds.has(entity._id.toString())) {
          allEntities.push(entity);
        }
      }

      // 5. Extract topics from entities for summary retrieval
      const topics = this.extractTopics(allEntities, question);

      // 6. Get relevant document summaries
      const relevantSummaries = await getRelevantSummaries(workspaceId, topics, { limit: 3 });

      // 7. Build formatted contexts
      const entityContext = buildEntityContext(allEntities.slice(0, 10));
      const summaryContext = buildSummaryContext(relevantSummaries);

      const processingTime = Date.now() - startTime;

      // Track timing
      await this.redis.lpush('memory:timing:contextBuild', processingTime);
      await this.redis.ltrim('memory:timing:contextBuild', 0, 999); // Keep last 1000

      logger.info('Built memory context', {
        service: 'entity-memory',
        conversationId,
        entitiesCount: allEntities.length,
        summariesCount: relevantSummaries.length,
        processingTimeMs: processingTime,
      });

      return {
        entityContext,
        summaryContext,
        mentionedEntities: allEntities,
        relevantSummaries,
      };
    } catch (error) {
      logger.error('Failed to build memory context', {
        service: 'entity-memory',
        conversationId,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      return {
        entityContext: '',
        summaryContext: '',
        mentionedEntities: [],
        relevantSummaries: [],
      };
    }
  }

  /**
   * Extract topics from entities and question for summary matching
   *
   * @param {Entity[]} entities - Entities to extract topics from
   * @param {string} question - User question
   * @returns {string[]} Extracted topics
   */
  extractTopics(entities, question) {
    const topics = new Set();

    // Add entity names and types as topics
    for (const entity of entities) {
      topics.add(entity.name.toLowerCase());
      if (entity.type !== 'other') {
        topics.add(entity.type);
      }
    }

    // Extract key words from question (simple approach)
    const stopWords = new Set([
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'it',
      'this',
      'that',
      'these',
      'those',
      'can',
      'could',
      'would',
      'should',
      'will',
      'about',
      'into',
      'through',
      'during',
    ]);

    const questionWords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const word of questionWords) {
      topics.add(word);
    }

    return Array.from(topics).slice(0, 10);
  }

  /**
   * Clear conversation memory
   *
   * @param {string} conversationId - Conversation ID
   */
  async clearConversation(conversationId) {
    try {
      await this.ensureConnection();
      const key = this.getConversationKey(conversationId);
      await this.redis.del(key);

      logger.debug('Cleared conversation entity memory', {
        service: 'entity-memory',
        conversationId,
      });
    } catch (error) {
      logger.error('Failed to clear conversation memory', {
        service: 'entity-memory',
        conversationId,
        error: error.message,
      });
    }
  }

  /**
   * Get memory statistics from Redis
   *
   * @returns {Promise<Object>} Memory statistics
   */
  async getStats() {
    try {
      await this.ensureConnection();

      // Get all conversation keys
      const keys = await this.redis.keys(`${REDIS_KEYS.CONVERSATION_ENTITIES}*`);

      // Get global stats
      const stats = (await this.redis.hgetall(REDIS_KEYS.STATS)) || {};

      // Get timing stats
      const timings = await this.redis.lrange('memory:timing:contextBuild', 0, 99);
      const avgTiming =
        timings.length > 0 ? timings.reduce((a, b) => a + parseInt(b), 0) / timings.length : 0;

      // Count total tracked entities across all conversations
      let totalTrackedEntities = 0;
      for (const key of keys.slice(0, 100)) {
        // Sample first 100
        const count = await this.redis.scard(key);
        totalTrackedEntities += count;
      }

      return {
        activeConversations: keys.length,
        totalTrackedEntities,
        messagesProcessed: parseInt(stats.messagesProcessed) || 0,
        entitiesProcessed: parseInt(stats.entitiesProcessed) || 0,
        contextBuilds: parseInt(stats.contextBuilds) || 0,
        avgContextBuildTimeMs: Math.round(avgTiming),
        cacheType: 'redis',
        redisStatus: this.redis.status,
      };
    } catch (error) {
      logger.error('Failed to get memory stats', {
        service: 'entity-memory',
        error: error.message,
      });
      return {
        activeConversations: 0,
        totalTrackedEntities: 0,
        error: error.message,
        cacheType: 'redis',
        redisStatus: this.redis.status,
      };
    }
  }

  /**
   * Clear all memory caches (for maintenance)
   */
  async clearAllCaches() {
    try {
      await this.ensureConnection();

      const keys = await this.redis.keys('memory:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }

      logger.info('Cleared all entity memory caches', {
        service: 'entity-memory',
        keysCleared: keys.length,
      });

      return { cleared: keys.length };
    } catch (error) {
      logger.error('Failed to clear memory caches', {
        service: 'entity-memory',
        error: error.message,
      });
      throw error;
    }
  }
}

// Singleton instance
export const entityMemory = new EntityMemoryManager();

/**
 * Get top entities for a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} options - Query options
 * @returns {Promise<Entity[]>} Top entities
 */
export async function getTopEntities(workspaceId, options = {}) {
  const { limit = 20, type = null } = options;

  const query = { workspaceId };
  if (type) {
    query.type = type;
  }

  return Entity.find(query)
    .sort({ 'stats.totalMentions': -1 })
    .limit(limit)
    .select('name type description stats.totalMentions stats.documentCount');
}

/**
 * Search entities by query
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} searchQuery - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Entity[]>} Matching entities
 */
export async function searchEntities(workspaceId, searchQuery, options = {}) {
  const { limit = 10, types = null } = options;

  return Entity.searchByName(workspaceId, searchQuery, { limit, types });
}

/**
 * Get entity relationships graph
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} entityId - Center entity ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Graph data
 */
export async function getEntityGraph(workspaceId, entityId, options = {}) {
  const { depth = 1, limit = 20 } = options;

  const centerEntity = await Entity.findById(entityId).populate(
    'relationships.entityId',
    'name type'
  );

  if (!centerEntity) {
    return { nodes: [], edges: [] };
  }

  const nodes = [
    {
      id: centerEntity._id.toString(),
      name: centerEntity.name,
      type: centerEntity.type,
      isCenter: true,
    },
  ];

  const edges = [];
  const visitedIds = new Set([centerEntity._id.toString()]);

  for (const rel of centerEntity.relationships.slice(0, limit)) {
    if (rel.entityId) {
      const relatedId = rel.entityId._id.toString();
      if (!visitedIds.has(relatedId)) {
        nodes.push({
          id: relatedId,
          name: rel.entityId.name,
          type: rel.entityId.type,
          isCenter: false,
        });
        visitedIds.add(relatedId);
      }

      edges.push({
        source: centerEntity._id.toString(),
        target: relatedId,
        type: rel.type,
        strength: rel.strength,
      });
    }
  }

  return { nodes, edges };
}
