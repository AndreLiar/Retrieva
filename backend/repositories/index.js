/**
 * Repository Layer - Barrel Export
 *
 * Implements the Repository Pattern for clean data access abstraction.
 *
 * Benefits:
 * - Decouples business logic from data access
 * - Centralizes complex queries
 * - Makes database switching easier
 * - Enables unit testing with mock repositories
 *
 * Usage:
 *   // Import specific repository
 *   import { analyticsRepository } from './repositories';
 *
 *   // Or import class for custom instances
 *   import { AnalyticsRepository } from './repositories';
 *   const repo = new AnalyticsRepository(mockModel);
 */

// Base class
export { BaseRepository } from './BaseRepository.js';

// Repository classes and singleton instances
export { SyncJobRepository, syncJobRepository } from './SyncJobRepository.js';
export { DocumentSourceRepository, documentSourceRepository } from './DocumentSourceRepository.js';
export { MessageRepository, messageRepository } from './MessageRepository.js';
export { ConversationRepository, conversationRepository } from './ConversationRepository.js';
