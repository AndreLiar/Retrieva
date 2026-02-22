/**
 * Coreference Resolution Service
 *
 * CONVERSATIONAL CONTEXT: Resolves pronouns and references
 * - Handles "it", "that", "this", "they", "the previous one"
 * - Tracks mentioned entities and topics
 * - Resolves references to conversation context
 *
 * @module services/context/coreferenceResolver
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOllama } from '@langchain/ollama';
import logger from '../../config/logger.js';

/**
 * @typedef {Object} ResolvedQuery
 * @property {string} originalQuery - Original user query
 * @property {string} resolvedQuery - Query with resolved references
 * @property {boolean} hadReferences - Whether references were found
 * @property {Array} resolvedReferences - List of resolved references
 * @property {number} confidence - Resolution confidence
 */

/**
 * @typedef {Object} ConversationContext
 * @property {Array} messages - Recent messages
 * @property {Array} entities - Mentioned entities
 * @property {Array} topics - Discussed topics
 * @property {Object} lastAnswer - Last assistant response details
 */

// Coreference patterns to detect
const COREFERENCE_PATTERNS = {
  pronouns: /\b(it|its|they|them|their|this|that|these|those|he|she|him|her|his|hers)\b/gi,
  references:
    /\b(the (same|previous|last|above|mentioned|first|second|third)|that one|this one|the one|which one)\b/gi,
  ellipsis: /\b(also|too|as well|same|again|more|another|other)\b/gi,
  comparatives: /\b(better|worse|more|less|similar|different|like that|like this)\b/gi,
};

// LLM for complex resolution
const resolverLlm = new ChatOllama({
  model: process.env.RESOLVER_MODEL || 'mistral:latest',
  baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  temperature: 0.1,
  numPredict: 500,
  format: 'json',
});

// Resolution prompt
const RESOLUTION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a coreference resolution expert. Your task is to resolve pronouns and references in user queries based on conversation context.

Given the conversation history and current query, identify and resolve:
1. Pronouns (it, they, this, that, etc.)
2. Demonstratives (this one, that thing, the previous)
3. Implicit references (also, same, another)

Rules:
- Only resolve references that are CLEARLY referring to something in the context
- Keep the query natural and readable after resolution
- If uncertain, keep the original reference
- Maintain the user's intent

Respond with valid JSON:
{{
  "resolvedQuery": "The query with pronouns/references replaced with actual referents",
  "hadReferences": true/false,
  "resolvedReferences": [
    {{"original": "it", "resolved": "the API endpoint", "confidence": 0.9}}
  ],
  "confidence": 0.0-1.0
}}`,
  ],
  [
    'user',
    `Conversation History:
{conversationHistory}

Mentioned Entities: {entities}
Recent Topics: {topics}
Last Answer Topic: {lastAnswerTopic}

Current Query: {query}

Resolve any references in the current query as JSON.`,
  ],
]);

/**
 * Check if query likely contains coreferences
 * @private
 */
function hasLikelyReferences(query) {
  for (const [_type, pattern] of Object.entries(COREFERENCE_PATTERNS)) {
    if (pattern.test(query)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract potential referents from messages
 * @private
 */
function extractReferents(messages) {
  const entities = new Set();
  const topics = new Set();
  let lastAnswerTopic = '';

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = msg.content || '';

    // Extract quoted terms
    const quoted = content.match(/"([^"]+)"|'([^']+)'|`([^`]+)`/g);
    if (quoted) {
      quoted.forEach((q) => entities.add(q.replace(/["'`]/g, '')));
    }

    // Extract capitalized terms (potential named entities)
    const capitalized = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (capitalized) {
      capitalized.forEach((c) => {
        if (
          c.length > 2 &&
          !['The', 'This', 'That', 'What', 'How', 'Why', 'When', 'Where'].includes(c)
        ) {
          entities.add(c);
        }
      });
    }

    // Extract technical terms (camelCase, snake_case, etc.)
    const technical = content.match(/\b[a-z]+[A-Z][a-zA-Z]*\b|\b[a-z]+_[a-z_]+\b/g);
    if (technical) {
      technical.forEach((t) => entities.add(t));
    }

    // Extract topics from assistant responses
    if (msg.role === 'assistant' && i === messages.length - 1) {
      // Last assistant message - extract main topic
      const sentences = content.split(/[.!?]+/);
      if (sentences[0]) {
        lastAnswerTopic = sentences[0].substring(0, 100);
      }
    }
  }

  return {
    entities: Array.from(entities).slice(0, 15),
    topics: Array.from(topics).slice(0, 10),
    lastAnswerTopic,
  };
}

/**
 * Simple rule-based resolution for obvious cases
 * @private
 */
function simpleResolve(query, context) {
  const { entities, lastAnswerTopic, _messages } = context;

  if (entities.length === 0 && !lastAnswerTopic) {
    return null;
  }

  let resolved = query;
  const resolutions = [];

  // Get last mentioned entity for "it", "this", "that"
  const lastEntity = entities[0];

  // Simple pronoun replacement for obvious cases
  if (lastEntity) {
    // "What is it?" -> "What is [lastEntity]?"
    if (
      /^(what|how|why|where|when|who)\s+(is|are|was|were|does|do|did|can|could|should|would)\s+(it|this|that)\??$/i.test(
        query
      )
    ) {
      resolved = query.replace(/\b(it|this|that)\b/i, lastEntity);
      resolutions.push({
        original: query.match(/\b(it|this|that)\b/i)[0],
        resolved: lastEntity,
        confidence: 0.8,
      });
    }

    // "Tell me more about it" -> "Tell me more about [lastEntity]"
    if (/more\s+(about|on)\s+(it|this|that)/i.test(query)) {
      resolved = query.replace(/\b(it|this|that)\b/i, lastEntity);
      resolutions.push({
        original: query.match(/\b(it|this|that)\b/i)[0],
        resolved: lastEntity,
        confidence: 0.85,
      });
    }

    // "How does it work?" -> "How does [lastEntity] work?"
    if (/how\s+(does|do|did|can|could)\s+(it|this|that)\s+work/i.test(query)) {
      resolved = query.replace(/\b(it|this|that)\b/i, lastEntity);
      resolutions.push({
        original: query.match(/\b(it|this|that)\b/i)[0],
        resolved: lastEntity,
        confidence: 0.85,
      });
    }
  }

  if (resolutions.length > 0) {
    return {
      resolvedQuery: resolved,
      hadReferences: true,
      resolvedReferences: resolutions,
      confidence: Math.max(...resolutions.map((r) => r.confidence)),
    };
  }

  return null;
}

/**
 * Coreference Resolver
 */
class CoreferenceResolver {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 200;
  }

  /**
   * Resolve coreferences in a query
   *
   * @param {string} query - User query
   * @param {ConversationContext} context - Conversation context
   * @returns {Promise<ResolvedQuery>}
   */
  async resolve(query, context = {}) {
    const startTime = Date.now();
    const { messages = [], entities = [], topics = [] } = context;

    // Quick check - if no likely references, return original
    if (!hasLikelyReferences(query)) {
      return {
        originalQuery: query,
        resolvedQuery: query,
        hadReferences: false,
        resolvedReferences: [],
        confidence: 1.0,
      };
    }

    // No context to resolve against
    if (messages.length === 0) {
      return {
        originalQuery: query,
        resolvedQuery: query,
        hadReferences: false,
        resolvedReferences: [],
        confidence: 1.0,
      };
    }

    try {
      // Extract referents from messages
      const extracted = extractReferents(messages);
      const allEntities = [...new Set([...entities, ...extracted.entities])];
      const allTopics = [...new Set([...topics, ...extracted.topics])];

      // Try simple rule-based resolution first
      const simpleResult = simpleResolve(query, {
        entities: allEntities,
        topics: allTopics,
        lastAnswerTopic: extracted.lastAnswerTopic,
        messages,
      });

      if (simpleResult && simpleResult.confidence >= 0.8) {
        logger.debug('Coreference resolved via rules', {
          service: 'coreference',
          original: query,
          resolved: simpleResult.resolvedQuery,
          confidence: simpleResult.confidence,
          processingTimeMs: Date.now() - startTime,
        });

        return {
          originalQuery: query,
          ...simpleResult,
        };
      }

      // Use LLM for complex resolution
      const conversationHistory = messages
        .slice(-6)
        .map((m) => `${m.role.toUpperCase()}: ${m.content?.substring(0, 200) || ''}`)
        .join('\n');

      const chain = RESOLUTION_PROMPT.pipe(resolverLlm).pipe(new StringOutputParser());

      const response = await chain.invoke({
        conversationHistory,
        entities: allEntities.join(', ') || 'None',
        topics: allTopics.join(', ') || 'None',
        lastAnswerTopic: extracted.lastAnswerTopic || 'None',
        query,
      });

      const result = this._parseResponse(response, query);

      logger.info('Coreference resolved via LLM', {
        service: 'coreference',
        original: query,
        resolved: result.resolvedQuery,
        hadReferences: result.hadReferences,
        confidence: result.confidence.toFixed(2),
        processingTimeMs: Date.now() - startTime,
      });

      return {
        originalQuery: query,
        ...result,
      };
    } catch (error) {
      logger.error('Coreference resolution failed', {
        service: 'coreference',
        query,
        error: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      // Return original on error
      return {
        originalQuery: query,
        resolvedQuery: query,
        hadReferences: false,
        resolvedReferences: [],
        confidence: 0.5,
      };
    }
  }

  /**
   * Parse LLM response
   * @private
   */
  _parseResponse(response, originalQuery) {
    try {
      const parsed = JSON.parse(response);
      return {
        resolvedQuery: parsed.resolvedQuery || originalQuery,
        hadReferences: parsed.hadReferences || false,
        resolvedReferences: parsed.resolvedReferences || [],
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      };
    } catch {
      // Try to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            resolvedQuery: parsed.resolvedQuery || originalQuery,
            hadReferences: parsed.hadReferences || false,
            resolvedReferences: parsed.resolvedReferences || [],
            confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
          };
        } catch {
          // Fall through
        }
      }

      return {
        resolvedQuery: originalQuery,
        hadReferences: false,
        resolvedReferences: [],
        confidence: 0.3,
      };
    }
  }

  /**
   * Check if query needs resolution
   *
   * @param {string} query - User query
   * @returns {boolean}
   */
  needsResolution(query) {
    return hasLikelyReferences(query);
  }
}

// Singleton
export const coreferenceResolver = new CoreferenceResolver();
export { CoreferenceResolver };
