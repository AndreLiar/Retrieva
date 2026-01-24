/**
 * Service Container - Dependency Injection Container
 *
 * Provides:
 * - Centralized dependency management
 * - Easy mocking for unit tests
 * - Lazy singleton initialization
 * - Thread-safe for concurrent requests
 *
 * Usage:
 *   // Production
 *   const ragService = await container.resolve('ragService');
 *   const analyticsRepo = container.get('analyticsRepository');
 *
 *   // Testing
 *   container.register('analyticsRepository', mockRepo, { instance: true });
 *   const service = await container.resolve('ragService');
 */

import { llm } from '../config/llm.js';
import { getVectorStore } from '../config/vectorStore.js';
import { ragCache } from '../utils/rag/ragCache.js';
import { answerFormatter } from './answerFormatter.js';
import { Analytics } from '../models/Analytics.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { SyncJob } from '../models/SyncJob.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import logger from '../config/logger.js';

// Repositories
import {
  AnalyticsRepository,
  SyncJobRepository,
  DocumentSourceRepository,
  MessageRepository,
  ConversationRepository,
  NotionWorkspaceRepository,
} from '../repositories/index.js';

class ServiceContainer {
  constructor() {
    // Registry of factory functions
    this.factories = new Map();
    // Singleton instances
    this.instances = new Map();
    // Initialization promises (prevents race conditions)
    this.pending = new Map();
    // Whether container is in test mode
    this.testMode = false;
  }

  /**
   * Register a factory function or instance for a service
   * @param {string} name - Service name
   * @param {Function|Object} factoryOrInstance - Factory function or direct instance
   * @param {Object} options - Registration options
   */
  register(name, factoryOrInstance, options = {}) {
    const { singleton = true, instance = false } = options;

    if (instance) {
      // Direct instance registration (useful for mocks)
      this.instances.set(name, factoryOrInstance);
    } else {
      this.factories.set(name, { factory: factoryOrInstance, singleton });
      // Clear any existing instance when re-registering
      this.instances.delete(name);
      this.pending.delete(name);
    }

    return this;
  }

  /**
   * Resolve a service by name
   * @param {string} name - Service name
   * @returns {Promise<any>} - Resolved service instance
   */
  async resolve(name) {
    // Check for existing instance
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // Check for pending initialization (prevents duplicate init in concurrent requests)
    if (this.pending.has(name)) {
      return this.pending.get(name);
    }

    // Get factory
    const registration = this.factories.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' not registered in container`);
    }

    const { factory, singleton } = registration;

    // Create instance
    const initPromise = (async () => {
      const instance = await factory(this);

      if (singleton) {
        this.instances.set(name, instance);
      }

      this.pending.delete(name);
      return instance;
    })();

    // Store pending promise to handle concurrent requests
    if (singleton) {
      this.pending.set(name, initPromise);
    }

    return initPromise;
  }

  /**
   * Get a service synchronously (throws if not initialized)
   * @param {string} name - Service name
   * @returns {any} - Service instance
   */
  get(name) {
    if (!this.instances.has(name)) {
      throw new Error(`Service '${name}' not initialized. Call resolve() first.`);
    }
    return this.instances.get(name);
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.factories.has(name) || this.instances.has(name);
  }

  /**
   * Clear all instances (useful for testing)
   */
  clear() {
    this.instances.clear();
    this.pending.clear();
  }

  /**
   * Reset container to initial state
   */
  reset() {
    this.factories.clear();
    this.instances.clear();
    this.pending.clear();
    this.testMode = false;
    registerDefaults(this);
  }

  /**
   * Enable test mode - clears singletons between tests
   */
  enableTestMode() {
    this.testMode = true;
    this.clear();
    return this;
  }

  /**
   * Create a scoped container for request isolation
   * Inherits factories but has separate instances
   */
  createScope() {
    const scoped = new ServiceContainer();
    scoped.factories = new Map(this.factories);
    return scoped;
  }
}

/**
 * Register default services
 */
function registerDefaults(container) {
  // Core dependencies (infrastructure)
  container.register('llm', () => llm, { instance: true });
  container.register('logger', () => logger, { instance: true });
  container.register('vectorStoreFactory', () => getVectorStore, { instance: true });

  // Models (data access) - kept for backward compatibility
  container.register('Analytics', () => Analytics, { instance: true });
  container.register('Message', () => Message, { instance: true });
  container.register('Conversation', () => Conversation, { instance: true });
  container.register('SyncJob', () => SyncJob, { instance: true });
  container.register('DocumentSource', () => DocumentSource, { instance: true });
  container.register('NotionWorkspace', () => NotionWorkspace, { instance: true });

  // Repositories (data access layer)
  container.register('analyticsRepository', () => new AnalyticsRepository(), { instance: true });
  container.register('syncJobRepository', () => new SyncJobRepository(), { instance: true });
  container.register('documentSourceRepository', () => new DocumentSourceRepository(), {
    instance: true,
  });
  container.register('messageRepository', () => new MessageRepository(), { instance: true });
  container.register('conversationRepository', () => new ConversationRepository(), {
    instance: true,
  });
  container.register('notionWorkspaceRepository', () => new NotionWorkspaceRepository(), {
    instance: true,
  });

  // Services (business logic)
  container.register('cache', () => ragCache, { instance: true });
  container.register('answerFormatter', () => answerFormatter, { instance: true });

  // RAG Service (main service with dependencies)
  container.register('ragService', async (c) => {
    // Lazy import to avoid circular dependency
    const { createRAGService } = await import('./rag.js');
    return createRAGService({
      llm: c.get('llm'),
      vectorStoreFactory: c.get('vectorStoreFactory'),
      cache: c.get('cache'),
      answerFormatter: c.get('answerFormatter'),
      logger: c.get('logger'),
      models: {
        Analytics: c.get('Analytics'),
        Message: c.get('Message'),
        Conversation: c.get('Conversation'),
      },
      repositories: {
        analytics: c.get('analyticsRepository'),
        message: c.get('messageRepository'),
        conversation: c.get('conversationRepository'),
      },
    });
  });

  return container;
}

// Create and export singleton container
const container = new ServiceContainer();
registerDefaults(container);

export { container, ServiceContainer };
