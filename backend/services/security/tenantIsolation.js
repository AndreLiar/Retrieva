/**
 * Tenant Isolation Security Layer
 * Defense-in-depth: Enforces workspaceId filtering at the vector store level
 *
 * Even if higher-level code bypasses buildQdrantFilter(), this layer
 * ensures that NO Qdrant search can execute without workspace isolation.
 *
 * @module services/security/tenantIsolation
 */

import logger from '../../config/logger.js';

/**
 * Error thrown when a search is attempted without workspace isolation
 */
export class TenantIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantIsolationError';
    this.statusCode = 403;
    this.isSecurityError = true;
  }
}

/**
 * Validate that a Qdrant filter includes workspaceId
 * @param {Object} filter - Qdrant filter object
 * @returns {{ valid: boolean, workspaceId: string|null }} Validation result
 */
export function validateWorkspaceFilter(filter) {
  if (!filter) {
    return { valid: false, workspaceId: null };
  }

  // Check 'must' array for workspaceId filter
  const mustConditions = filter.must || [];
  for (const condition of mustConditions) {
    if (
      condition.key === 'metadata.workspaceId' &&
      condition.match?.value &&
      typeof condition.match.value === 'string'
    ) {
      return { valid: true, workspaceId: condition.match.value };
    }
  }

  // Check if filter itself is a simple match (less common)
  if (
    filter.key === 'metadata.workspaceId' &&
    filter.match?.value &&
    typeof filter.match.value === 'string'
  ) {
    return { valid: true, workspaceId: filter.match.value };
  }

  return { valid: false, workspaceId: null };
}

/**
 * Wrap a vector store with tenant isolation enforcement
 * All search methods will be intercepted and validated
 *
 * @param {Object} vectorStore - LangChain vector store instance
 * @returns {Object} Wrapped vector store with enforced isolation
 */
export function wrapWithTenantIsolation(vectorStore) {
  if (!vectorStore) {
    throw new Error('Vector store is required for tenant isolation wrapper');
  }

  // Mark as wrapped to prevent double-wrapping
  if (vectorStore._tenantIsolationEnabled) {
    return vectorStore;
  }

  const originalSimilaritySearch = vectorStore.similaritySearch.bind(vectorStore);
  const originalSimilaritySearchWithScore = vectorStore.similaritySearchWithScore?.bind(vectorStore);
  const originalMaxMarginalRelevanceSearch = vectorStore.maxMarginalRelevanceSearch?.bind(vectorStore);

  /**
   * Enforce workspace isolation before any search
   * @param {string} methodName - Name of the search method
   * @param {Object} filter - The filter being used
   */
  function enforceIsolation(methodName, filter) {
    const validation = validateWorkspaceFilter(filter);

    if (!validation.valid) {
      const errorMsg = `SECURITY: ${methodName} rejected - missing workspaceId filter (tenant isolation violation)`;
      logger.error(errorMsg, {
        service: 'tenant-isolation',
        method: methodName,
        filterProvided: !!filter,
        filterKeys: filter ? Object.keys(filter) : [],
      });
      throw new TenantIsolationError(
        'Search rejected: workspace isolation required. All queries must include metadata.workspaceId filter.'
      );
    }

    logger.debug(`Tenant isolation validated for ${methodName}`, {
      service: 'tenant-isolation',
      workspaceId: validation.workspaceId,
    });

    return validation.workspaceId;
  }

  // Wrap similaritySearch
  vectorStore.similaritySearch = async function (query, k, filter) {
    enforceIsolation('similaritySearch', filter);
    return originalSimilaritySearch(query, k, filter);
  };

  // Wrap similaritySearchWithScore if it exists
  if (originalSimilaritySearchWithScore) {
    vectorStore.similaritySearchWithScore = async function (query, k, filter) {
      enforceIsolation('similaritySearchWithScore', filter);
      return originalSimilaritySearchWithScore(query, k, filter);
    };
  }

  // Wrap maxMarginalRelevanceSearch if it exists
  if (originalMaxMarginalRelevanceSearch) {
    vectorStore.maxMarginalRelevanceSearch = async function (query, options) {
      enforceIsolation('maxMarginalRelevanceSearch', options?.filter);
      return originalMaxMarginalRelevanceSearch(query, options);
    };
  }

  // Wrap asRetriever to return an isolated retriever
  const originalAsRetriever = vectorStore.asRetriever.bind(vectorStore);
  vectorStore.asRetriever = function (options = {}) {
    // If no filter is provided, the retriever CANNOT be used safely
    // Log a warning - actual enforcement happens at search time
    if (!options.filter) {
      logger.warn('Creating retriever without filter - searches will fail tenant isolation check', {
        service: 'tenant-isolation',
      });
    }

    const retriever = originalAsRetriever(options);

    // Wrap the retriever's invoke method
    const originalInvoke = retriever.invoke?.bind(retriever);
    if (originalInvoke) {
      retriever.invoke = async function (query) {
        // Check if retriever has a filter set
        if (!options.filter) {
          throw new TenantIsolationError(
            'Retriever invoked without workspace filter. Use vectorStore.similaritySearch with explicit filter instead.'
          );
        }
        enforceIsolation('retriever.invoke', options.filter);
        return originalInvoke(query);
      };
    }

    // Also wrap _getRelevantDocuments for LangChain compatibility
    const originalGetRelevantDocs = retriever._getRelevantDocuments?.bind(retriever);
    if (originalGetRelevantDocs) {
      retriever._getRelevantDocuments = async function (query, runManager) {
        if (!options.filter) {
          throw new TenantIsolationError(
            'Retriever invoked without workspace filter. Use vectorStore.similaritySearch with explicit filter instead.'
          );
        }
        enforceIsolation('retriever._getRelevantDocuments', options.filter);
        return originalGetRelevantDocs(query, runManager);
      };
    }

    return retriever;
  };

  // Mark as wrapped
  vectorStore._tenantIsolationEnabled = true;
  vectorStore._tenantIsolationVersion = '1.0.0';

  logger.info('Vector store wrapped with tenant isolation enforcement', {
    service: 'tenant-isolation',
  });

  return vectorStore;
}

/**
 * Check if a vector store has tenant isolation enabled
 * @param {Object} vectorStore - Vector store to check
 * @returns {boolean} True if isolation is enabled
 */
export function hasTenantIsolation(vectorStore) {
  return vectorStore?._tenantIsolationEnabled === true;
}

/**
 * Create a workspace-scoped filter that can be used with isolated vector stores
 * @param {string} workspaceId - The workspace ID to scope to
 * @param {Object} additionalFilters - Optional additional filter conditions
 * @returns {Object} Qdrant filter object
 */
export function createWorkspaceScopedFilter(workspaceId, additionalFilters = {}) {
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new TenantIsolationError('workspaceId is required to create workspace-scoped filter');
  }

  const filter = {
    must: [
      {
        key: 'metadata.workspaceId',
        match: { value: workspaceId },
      },
    ],
  };

  // Merge additional filters
  if (additionalFilters.must && Array.isArray(additionalFilters.must)) {
    filter.must.push(...additionalFilters.must);
  }

  return filter;
}
