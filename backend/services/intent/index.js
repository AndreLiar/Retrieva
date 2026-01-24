/**
 * Intent Services Index
 *
 * Intent-aware query routing for RAG
 * - Query intent classification
 * - Strategy-based routing
 * - Optimized retrieval per intent type
 *
 * @module services/intent
 */

// Intent Classifier
export {
  intentClassifier,
  IntentClassifier,
  IntentType,
  IntentCharacteristics,
} from './intentClassifier.js';

// Query Router
export { queryRouter, QueryRouter, RETRIEVAL_STRATEGIES, RESPONSE_PROMPTS } from './queryRouter.js';

// Retrieval Strategies
export {
  executeStrategy,
  focusedRetrieval,
  multiAspectRetrieval,
  deepRetrieval,
  broadRetrieval,
  contextOnlyRetrieval,
  noRetrieval,
} from './retrievalStrategies.js';
