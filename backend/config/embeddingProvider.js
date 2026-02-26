import { OpenAIEmbeddings, AzureOpenAIEmbeddings } from '@langchain/openai';
import { OllamaEmbeddings } from '@langchain/ollama';
import logger from './logger.js';

// =============================================================================
// PHASE 2: HYBRID EMBEDDING SYSTEM
// Provides cloud/local embedding routing with fallback, audit logging, and GDPR compliance
// =============================================================================

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.EMBEDDING_MODEL || 'bge-m3:latest';
const OPENAI_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Azure OpenAI Configuration
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_EMBEDDING_DEPLOYMENT =
  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT || 'text-embedding-3-small';
const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview';

// Embedding provider type (azure, openai, local)
const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'local';

// =============================================================================
// EMBEDDING PREFIX REGISTRY
// Models that require task-specific prefixes for optimal performance.
// =============================================================================

const MODEL_PREFIXES = {
  'bge-m3': { document: '', query: '' },
  'bge-m3:latest': { document: '', query: '' },
};

/**
 * Get embedding prefixes for the current model.
 * Env overrides (EMBEDDING_DOC_PREFIX, EMBEDDING_QUERY_PREFIX) take precedence,
 * then model registry, then empty strings.
 *
 * @returns {{ document: string, query: string }}
 */
export function getEmbeddingPrefixes() {
  const envDoc = process.env.EMBEDDING_DOC_PREFIX;
  const envQuery = process.env.EMBEDDING_QUERY_PREFIX;

  const modelKey = OLLAMA_MODEL;
  const registry = MODEL_PREFIXES[modelKey] || { document: '', query: '' };

  return {
    document: envDoc !== undefined ? envDoc : registry.document,
    query: envQuery !== undefined ? envQuery : registry.query,
  };
}

// Provider types
export const EmbeddingProvider = {
  LOCAL: 'local',
  CLOUD: 'cloud',
};

// Trust levels determine cloud eligibility
export const TrustLevel = {
  PUBLIC: 'public', // Can use cloud freely
  INTERNAL: 'internal', // Can use cloud with consent
  REGULATED: 'regulated', // Must use local only (GDPR, HIPAA, etc.)
};

// =============================================================================
// AUDIT LOGGING
// =============================================================================

const auditLog = {
  entries: [],
  maxEntries: 1000,

  log(entry) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    // Keep only recent entries in memory
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    // Also log to file via logger
    logger.info('Embedding audit', {
      service: 'embedding-audit',
      ...entry,
    });
  },

  getRecent(count = 100) {
    return this.entries.slice(-count);
  },

  getByWorkspace(workspaceId, count = 50) {
    return this.entries.filter((e) => e.workspaceId === workspaceId).slice(-count);
  },
};

export { auditLog };

// =============================================================================
// EMBEDDING METRICS BY PROVIDER
// =============================================================================

const providerMetrics = {
  local: {
    totalCalls: 0,
    totalChunks: 0,
    totalTimeMs: 0,
    errors: 0,
    lastError: null,
  },
  cloud: {
    totalCalls: 0,
    totalChunks: 0,
    totalTimeMs: 0,
    errors: 0,
    lastError: null,
    estimatedCost: 0, // Track OpenAI costs
  },
};

export function getProviderMetrics() {
  return {
    local: { ...providerMetrics.local },
    cloud: { ...providerMetrics.cloud },
  };
}

export function resetProviderMetrics() {
  providerMetrics.local = {
    totalCalls: 0,
    totalChunks: 0,
    totalTimeMs: 0,
    errors: 0,
    lastError: null,
  };
  providerMetrics.cloud = {
    totalCalls: 0,
    totalChunks: 0,
    totalTimeMs: 0,
    errors: 0,
    lastError: null,
    estimatedCost: 0,
  };
}

// =============================================================================
// EMBEDDING PROVIDERS
// =============================================================================

// Local Ollama provider (singleton)
let localProvider = null;
function getLocalProvider() {
  if (!localProvider) {
    localProvider = new OllamaEmbeddings({
      model: OLLAMA_MODEL,
      baseUrl: OLLAMA_BASE_URL,
    });
  }
  return localProvider;
}

// Cloud provider (singleton) - supports Azure OpenAI or OpenAI
let cloudProvider = null;
function getCloudProvider() {
  if (cloudProvider) return cloudProvider;

  // Prefer Azure OpenAI if configured
  if (EMBEDDING_PROVIDER === 'azure' || (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT)) {
    if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT) {
      logger.warn('Azure OpenAI embeddings requested but missing credentials');
      return null;
    }

    cloudProvider = new AzureOpenAIEmbeddings({
      azureOpenAIApiKey: AZURE_OPENAI_API_KEY,
      azureOpenAIEndpoint: AZURE_OPENAI_ENDPOINT,
      azureOpenAIApiDeploymentName: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
      azureOpenAIApiVersion: AZURE_OPENAI_API_VERSION,
      maxConcurrency: 5,
    });

    logger.info('Azure OpenAI embeddings initialized', {
      service: 'embedding-provider',
      deployment: AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    });
    return cloudProvider;
  }

  // Fallback to OpenAI if configured
  if (OPENAI_API_KEY) {
    cloudProvider = new OpenAIEmbeddings({
      openAIApiKey: OPENAI_API_KEY,
      modelName: OPENAI_MODEL,
      maxConcurrency: 5,
    });

    logger.info('OpenAI embeddings initialized', {
      service: 'embedding-provider',
      model: OPENAI_MODEL,
    });
    return cloudProvider;
  }

  return null;
}

// Check if cloud is available (Azure or OpenAI)
export function isCloudAvailable() {
  return !!(AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT) || !!OPENAI_API_KEY;
}

// Get the current cloud provider type
export function getCloudProviderType() {
  if (EMBEDDING_PROVIDER === 'azure' || (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT)) {
    return 'azure';
  }
  if (OPENAI_API_KEY) {
    return 'openai';
  }
  return null;
}

// =============================================================================
// EMBEDDING ROUTER
// =============================================================================

/**
 * Embedding context for routing decisions
 * @typedef {Object} EmbeddingContext
 * @property {string} workspaceId - Workspace ID
 * @property {string} trustLevel - Trust level (public, internal, regulated)
 * @property {boolean} cloudConsent - User has consented to cloud processing
 * @property {boolean} preferCloud - User prefers cloud for speed
 * @property {boolean} fallbackToCloud - Allow cloud fallback on local failure
 */

/**
 * Determine which provider to use based on context
 * @param {EmbeddingContext} context - Embedding context
 * @returns {string} Provider type (local or cloud)
 */
export function selectProvider(context) {
  const { trustLevel, cloudConsent, preferCloud, _fallbackToCloud } = context;

  // Regulated data must always use local
  if (trustLevel === TrustLevel.REGULATED) {
    return EmbeddingProvider.LOCAL;
  }

  // Cloud requires API key
  if (!isCloudAvailable()) {
    return EmbeddingProvider.LOCAL;
  }

  // Public data with cloud preference
  if (trustLevel === TrustLevel.PUBLIC && preferCloud) {
    return EmbeddingProvider.CLOUD;
  }

  // Internal data requires explicit consent
  if (trustLevel === TrustLevel.INTERNAL && cloudConsent && preferCloud) {
    return EmbeddingProvider.CLOUD;
  }

  // Default to local
  return EmbeddingProvider.LOCAL;
}

/**
 * Embed texts using the appropriate provider
 * @param {string[]} texts - Texts to embed
 * @param {EmbeddingContext} context - Embedding context
 * @returns {Promise<Object>} Embedding result with metadata
 */
export async function embedTexts(texts, context) {
  const startTime = Date.now();
  const selectedProvider = selectProvider(context);
  let usedProvider = selectedProvider;
  let embeddings;
  let error = null;

  try {
    if (selectedProvider === EmbeddingProvider.CLOUD) {
      embeddings = await embedWithCloud(texts, context);
    } else {
      embeddings = await embedWithLocal(texts, context);
    }
  } catch (err) {
    error = err;

    // Fallback logic
    if (
      selectedProvider === EmbeddingProvider.LOCAL &&
      context.fallbackToCloud &&
      context.trustLevel !== TrustLevel.REGULATED &&
      isCloudAvailable()
    ) {
      logger.warn('Local embedding failed, falling back to cloud', {
        service: 'embedding-router',
        workspaceId: context.workspaceId,
        error: err.message,
      });

      usedProvider = EmbeddingProvider.CLOUD;
      embeddings = await embedWithCloud(texts, context);
      error = null;
    } else if (selectedProvider === EmbeddingProvider.CLOUD && context.fallbackToCloud !== false) {
      logger.warn('Cloud embedding failed, falling back to local', {
        service: 'embedding-router',
        workspaceId: context.workspaceId,
        error: err.message,
      });

      usedProvider = EmbeddingProvider.LOCAL;
      embeddings = await embedWithLocal(texts, context);
      error = null;
    } else {
      throw err;
    }
  }

  const totalTime = Date.now() - startTime;

  // Determine model name based on provider
  const cloudProviderType = getCloudProviderType();
  const cloudModelName =
    cloudProviderType === 'azure' ? AZURE_OPENAI_EMBEDDING_DEPLOYMENT : OPENAI_MODEL;

  // Create embedding metadata
  const metadata = {
    provider: usedProvider,
    cloudProviderType: usedProvider === EmbeddingProvider.CLOUD ? cloudProviderType : null,
    model: usedProvider === EmbeddingProvider.CLOUD ? cloudModelName : OLLAMA_MODEL,
    timestamp: new Date().toISOString(),
    chunkCount: texts.length,
    totalTimeMs: totalTime,
    version: '2.0', // Phase 2 version
    dimensions: embeddings[0]?.length || 0,
    fallbackUsed: usedProvider !== selectedProvider,
  };

  // Audit log
  auditLog.log({
    workspaceId: context.workspaceId,
    provider: usedProvider,
    chunkCount: texts.length,
    totalTimeMs: totalTime,
    trustLevel: context.trustLevel,
    fallbackUsed: metadata.fallbackUsed,
    error: error?.message || null,
  });

  return {
    embeddings,
    metadata,
  };
}

/**
 * Embed texts using local Ollama
 */
async function embedWithLocal(texts, context) {
  const startTime = Date.now();
  const provider = getLocalProvider();

  try {
    const embeddings = await provider.embedDocuments(texts);
    const timeMs = Date.now() - startTime;

    // Update metrics
    providerMetrics.local.totalCalls++;
    providerMetrics.local.totalChunks += texts.length;
    providerMetrics.local.totalTimeMs += timeMs;

    logger.debug('Local embedding complete', {
      service: 'embedding-local',
      workspaceId: context.workspaceId,
      chunks: texts.length,
      timeMs,
    });

    return embeddings;
  } catch (error) {
    providerMetrics.local.errors++;
    providerMetrics.local.lastError = error.message;
    throw error;
  }
}

/**
 * Embed texts using cloud OpenAI
 */
async function embedWithCloud(texts, context) {
  const startTime = Date.now();
  const provider = getCloudProvider();

  if (!provider) {
    throw new Error('Cloud embedding provider not available (missing API key)');
  }

  try {
    const embeddings = await provider.embedDocuments(texts);
    const timeMs = Date.now() - startTime;

    // Estimate cost (text-embedding-3-small: $0.02 per 1M tokens)
    const estimatedTokens = texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);
    const estimatedCost = (estimatedTokens / 1000000) * 0.02;

    // Update metrics
    providerMetrics.cloud.totalCalls++;
    providerMetrics.cloud.totalChunks += texts.length;
    providerMetrics.cloud.totalTimeMs += timeMs;
    providerMetrics.cloud.estimatedCost += estimatedCost;

    logger.debug('Cloud embedding complete', {
      service: 'embedding-cloud',
      workspaceId: context.workspaceId,
      chunks: texts.length,
      timeMs,
      estimatedCost: estimatedCost.toFixed(6),
    });

    return embeddings;
  } catch (error) {
    providerMetrics.cloud.errors++;
    providerMetrics.cloud.lastError = error.message;
    throw error;
  }
}

/**
 * Embed a single query
 */
export async function embedQuery(text, context) {
  const selectedProvider = selectProvider(context);
  const provider =
    selectedProvider === EmbeddingProvider.CLOUD ? getCloudProvider() : getLocalProvider();

  if (!provider) {
    throw new Error('No embedding provider available');
  }

  const startTime = Date.now();
  const embedding = await provider.embedQuery(text);
  const timeMs = Date.now() - startTime;

  // Update metrics
  const metrics = providerMetrics[selectedProvider];
  metrics.totalCalls++;
  metrics.totalChunks++;
  metrics.totalTimeMs += timeMs;

  const cloudProviderType = getCloudProviderType();
  const cloudModelName =
    cloudProviderType === 'azure' ? AZURE_OPENAI_EMBEDDING_DEPLOYMENT : OPENAI_MODEL;

  return {
    embedding,
    metadata: {
      provider: selectedProvider,
      cloudProviderType: selectedProvider === EmbeddingProvider.CLOUD ? cloudProviderType : null,
      model: selectedProvider === EmbeddingProvider.CLOUD ? cloudModelName : OLLAMA_MODEL,
      timestamp: new Date().toISOString(),
      totalTimeMs: timeMs,
    },
  };
}

// =============================================================================
// GDPR COMPLIANCE HELPERS
// =============================================================================

/**
 * Get disclosure text for cloud embedding consent
 */
export function getCloudConsentDisclosure() {
  const cloudType = getCloudProviderType();
  const isAzure = cloudType === 'azure';

  return {
    title: 'Cloud Embedding Processing',
    description: isAzure
      ? 'Your document content is processed using Azure OpenAI for embedding generation. ' +
        'This means your text data will be processed on Microsoft Azure servers with enterprise-grade security.'
      : 'To improve processing speed, your document content can be sent to OpenAI for embedding generation. ' +
        'This means your text data will be processed on external servers.',
    dataProcessed: [
      'Document text content (anonymized chunks)',
      'No personal identifiers are sent',
      isAzure
        ? 'Data is processed in Azure with enterprise security and compliance'
        : 'Data is not stored by OpenAI after processing',
    ],
    benefits: [
      'Fast document processing with cloud infrastructure',
      'Higher throughput for large workspaces',
      isAzure ? 'Enterprise-grade security and compliance' : 'Reliable cloud processing',
    ],
    optOut:
      'You can manage data classification settings in your workspace. ' +
      'Regulated data will be flagged for additional review.',
    provider: isAzure ? 'Azure OpenAI' : 'OpenAI',
    model: isAzure ? AZURE_OPENAI_EMBEDDING_DEPLOYMENT : OPENAI_MODEL,
  };
}

/**
 * Check if workspace can use cloud embeddings
 */
export function canUseCloudEmbeddings(workspace) {
  if (!workspace) return false;
  if (!isCloudAvailable()) return false;
  if (workspace.trustLevel === TrustLevel.REGULATED) return false;
  if (workspace.trustLevel === TrustLevel.INTERNAL && !workspace.embeddingSettings?.cloudConsent) {
    return false;
  }
  return true;
}

/**
 * Create embedding context from workspace
 */
export function createEmbeddingContext(workspace) {
  return {
    workspaceId: workspace.workspaceId || workspace._id?.toString(),
    trustLevel: workspace.trustLevel || TrustLevel.INTERNAL,
    cloudConsent: workspace.embeddingSettings?.cloudConsent || false,
    preferCloud: workspace.embeddingSettings?.preferCloud || false,
    fallbackToCloud: workspace.embeddingSettings?.fallbackToCloud ?? true,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  embedTexts,
  embedQuery,
  selectProvider,
  isCloudAvailable,
  getCloudProviderType,
  canUseCloudEmbeddings,
  createEmbeddingContext,
  getCloudConsentDisclosure,
  getProviderMetrics,
  resetProviderMetrics,
  auditLog,
  getEmbeddingPrefixes,
  EmbeddingProvider,
  TrustLevel,
};
