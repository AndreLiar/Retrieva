/**
 * Memory Services Index
 *
 * M3 COMPRESSED MEMORY + M4 WORKING MEMORY
 * Production-grade memory layer with:
 * - Document summarization
 * - Entity extraction & knowledge graph
 * - Conversation summarization
 * - Memory decay & archival
 *
 * @module services/memory
 */

// Document Summarization
export {
  summarizeDocument,
  createOrUpdateSummary,
  getRelevantSummaries,
  getWorkspaceTopics,
  buildSummaryContext,
} from './summarization.js';

// Entity Extraction
export {
  extractEntities,
  processDocumentEntities,
  extractMessageEntities,
  buildEntityContext,
  getRelatedEntities,
} from './entityExtraction.js';

// Entity Memory
export { entityMemory, getTopEntities, searchEntities, getEntityGraph } from './entityMemory.js';

// Conversation Summarization
export {
  summarizeConversation,
  getConversationContext,
  buildCompressedContext,
  getCrossConversationKnowledge,
  summarizeUserConversations,
} from './conversationSummarization.js';

// Knowledge Graph
export { knowledgeGraph, KnowledgeGraph } from './knowledgeGraph.js';

// Memory Decay & Archival
export { memoryDecay, MemoryDecayManager, scheduleMemoryDecay } from './memoryDecay.js';

// Entity Resolution
export { entityResolution, EntityResolutionManager } from './entityResolution.js';

// Smart Context Pruning
export { contextPruning, ContextPruningManager } from './contextPruning.js';
