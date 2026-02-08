/**
 * Query Retrieval Module
 * Handles multi-query expansion, HyDE, document retrieval, and deduplication
 * @module services/rag/queryRetrieval
 */

import { expandQuery, generateHypotheticalDocument } from './retrievalEnhancements.js';
import { deduplicateDocuments } from '../../utils/rag/contextFormatter.js';

/**
 * @typedef {Object} FilterValidationResult
 * @property {boolean} valid - Whether the value passed validation
 * @property {*} [value] - The sanitized value (if valid)
 * @property {string} [error] - Error message (if invalid)
 */

/**
 * @typedef {Object} PageRangeFilter
 * @property {number} min - Minimum page number
 * @property {number} max - Maximum page number
 */

/**
 * @typedef {Object} QdrantFilterCondition
 * @property {string} key - Field name to filter on
 * @property {Object} [match] - Exact match condition
 * @property {number} [match.value] - Value to match
 * @property {Object} [range] - Range condition
 * @property {number} [range.gte] - Greater than or equal
 * @property {number} [range.lte] - Less than or equal
 */

/**
 * @typedef {Object} QdrantFilter
 * @property {QdrantFilterCondition[]} must - All conditions must match
 */

/**
 * @typedef {Object} DateRangeFilter
 * @property {string|Date} from - Start date (ISO string or Date)
 * @property {string|Date} to - End date (ISO string or Date)
 */

/**
 * @typedef {Object} RetrievalFilters
 * @property {string} workspaceId - Workspace ID (REQUIRED for multi-tenant isolation)
 * @property {number} [page] - Exact page number to filter
 * @property {string} [section] - Section name to filter
 * @property {PageRangeFilter} [pageRange] - Page range to filter
 * @property {DateRangeFilter} [dateRange] - Date range filter (lastModified)
 * @property {string} [author] - Author name filter
 * @property {string} [documentType] - Document type filter (page, database, file)
 * @property {string} [classification] - Exact classification filter (public, internal, confidential, restricted)
 * @property {string} [classificationLevel] - Max classification level (includes all at or below this level)
 * @property {string[]} [tags] - Tags to filter by (any match)
 */

/**
 * @typedef {Object} Document
 * @property {string} pageContent - The text content
 * @property {Object} [metadata] - Document metadata
 * @property {number} [metadata.page] - Page number
 * @property {string} [metadata.section] - Section name
 */

/**
 * @typedef {Object} RetrievalMetrics
 * @property {number} queryVariations - Number of query variations used
 * @property {number} totalRetrieved - Total documents retrieved before dedup
 * @property {number} afterDeduplication - Documents after deduplication
 * @property {string} deduplicationRate - Percentage of duplicates removed
 * @property {number} avgDocLength - Average document length in characters
 * @property {number} uniquePages - Number of unique pages retrieved
 * @property {boolean} filtersApplied - Whether filters were applied
 */

/**
 * @typedef {Object} MultiQueryRetrievalResult
 * @property {Document[]} documents - Retrieved and deduplicated documents
 * @property {string[]} allQueries - All query variations used
 * @property {RetrievalMetrics} metrics - Retrieval statistics
 */

/**
 * @typedef {Object} VectorStoreRetriever
 * @property {function(string): Promise<Document[]>} invoke - Retrieve documents
 */

/**
 * @typedef {Object} VectorStore
 * @property {function(string, number, QdrantFilter?): Promise<Document[]>} similaritySearch - Search with optional filter
 */

/**
 * @typedef {Object} Logger
 * @property {function(string, Object?): void} info - Log info message
 * @property {function(string, Object?): void} debug - Log debug message
 * @property {function(string, Object?): void} warn - Log warning message
 * @property {function(string, Object?): void} error - Log error message
 */

/**
 * Filter validation constants
 * SECURITY FIX (GAP 12): Prevent injection and abuse via filter parameters
 */
const FILTER_LIMITS = {
  page: { min: 1, max: 10000 },
  pageRange: { maxSpan: 100 },
  section: { maxLength: 200, pattern: /^[a-zA-Z0-9\s\-_.,()&]+$/ },
  dateRange: { maxSpanDays: 365 * 5 }, // Max 5 years
  author: { maxLength: 100, pattern: /^[a-zA-Z0-9\s\-_.'@]+$/ },
  documentType: { allowed: ['page', 'database', 'file', 'folder'] },
  classification: { allowed: ['public', 'internal', 'confidential', 'restricted'] },
  tags: { maxCount: 10, maxLength: 50 },
};

/**
 * Validate and sanitize a filter value
 * @param {'page'|'section'|'pageRange'} type - Type of filter
 * @param {number|string|PageRangeFilter} value - The value to validate
 * @returns {FilterValidationResult} Validation result with sanitized value or error
 * @private
 */
function validateFilterValue(type, value) {
  switch (type) {
    case 'page': {
      const page = parseInt(value, 10);
      if (isNaN(page)) {
        return { valid: false, error: 'Page must be a number' };
      }
      if (page < FILTER_LIMITS.page.min || page > FILTER_LIMITS.page.max) {
        return {
          valid: false,
          error: `Page must be between ${FILTER_LIMITS.page.min} and ${FILTER_LIMITS.page.max}`,
        };
      }
      return { valid: true, value: page };
    }

    case 'section': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Section must be a string' };
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return { valid: false, error: 'Section cannot be empty' };
      }
      if (trimmed.length > FILTER_LIMITS.section.maxLength) {
        return {
          valid: false,
          error: `Section must be under ${FILTER_LIMITS.section.maxLength} characters`,
        };
      }
      // SECURITY: Only allow safe characters to prevent injection
      if (!FILTER_LIMITS.section.pattern.test(trimmed)) {
        return { valid: false, error: 'Section contains invalid characters' };
      }
      return { valid: true, value: trimmed };
    }

    case 'pageRange': {
      if (!value || typeof value !== 'object') {
        return { valid: false, error: 'Page range must be an object with min and max' };
      }
      const min = parseInt(value.min, 10);
      const max = parseInt(value.max, 10);
      if (isNaN(min) || isNaN(max)) {
        return { valid: false, error: 'Page range min/max must be numbers' };
      }
      if (min < FILTER_LIMITS.page.min || max > FILTER_LIMITS.page.max) {
        return {
          valid: false,
          error: `Page range must be between ${FILTER_LIMITS.page.min} and ${FILTER_LIMITS.page.max}`,
        };
      }
      if (min > max) {
        return { valid: false, error: 'Page range min cannot be greater than max' };
      }
      if (max - min > FILTER_LIMITS.pageRange.maxSpan) {
        return {
          valid: false,
          error: `Page range cannot span more than ${FILTER_LIMITS.pageRange.maxSpan} pages`,
        };
      }
      return { valid: true, value: { min, max } };
    }

    case 'dateRange': {
      if (!value || typeof value !== 'object') {
        return { valid: false, error: 'Date range must be an object with from and to' };
      }
      const from = new Date(value.from);
      const to = new Date(value.to);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        return { valid: false, error: 'Date range from/to must be valid dates' };
      }
      if (from > to) {
        return { valid: false, error: 'Date range from cannot be after to' };
      }
      const daysDiff = (to - from) / (1000 * 60 * 60 * 24);
      if (daysDiff > FILTER_LIMITS.dateRange.maxSpanDays) {
        return {
          valid: false,
          error: `Date range cannot span more than ${FILTER_LIMITS.dateRange.maxSpanDays} days`,
        };
      }
      // Return as Unix timestamps for Qdrant
      return { valid: true, value: { from: from.getTime(), to: to.getTime() } };
    }

    case 'author': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Author must be a string' };
      }
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return { valid: false, error: 'Author cannot be empty' };
      }
      if (trimmed.length > FILTER_LIMITS.author.maxLength) {
        return {
          valid: false,
          error: `Author must be under ${FILTER_LIMITS.author.maxLength} characters`,
        };
      }
      if (!FILTER_LIMITS.author.pattern.test(trimmed)) {
        return { valid: false, error: 'Author contains invalid characters' };
      }
      return { valid: true, value: trimmed };
    }

    case 'documentType': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Document type must be a string' };
      }
      const trimmed = value.trim().toLowerCase();
      if (!FILTER_LIMITS.documentType.allowed.includes(trimmed)) {
        return {
          valid: false,
          error: `Document type must be one of: ${FILTER_LIMITS.documentType.allowed.join(', ')}`,
        };
      }
      return { valid: true, value: trimmed };
    }

    case 'classification': {
      if (typeof value !== 'string') {
        return { valid: false, error: 'Classification must be a string' };
      }
      const trimmed = value.trim().toLowerCase();
      if (!FILTER_LIMITS.classification.allowed.includes(trimmed)) {
        return {
          valid: false,
          error: `Classification must be one of: ${FILTER_LIMITS.classification.allowed.join(', ')}`,
        };
      }
      return { valid: true, value: trimmed };
    }

    case 'classificationLevel': {
      // Filter by classification level (includes all classifications at or below the specified level)
      // Order: public < internal < confidential < restricted
      if (typeof value !== 'string') {
        return { valid: false, error: 'Classification level must be a string' };
      }
      const trimmed = value.trim().toLowerCase();
      if (!FILTER_LIMITS.classification.allowed.includes(trimmed)) {
        return {
          valid: false,
          error: `Classification level must be one of: ${FILTER_LIMITS.classification.allowed.join(', ')}`,
        };
      }
      // Return all classifications at or below this level
      const levels = FILTER_LIMITS.classification.allowed;
      const levelIndex = levels.indexOf(trimmed);
      return { valid: true, value: levels.slice(0, levelIndex + 1) };
    }

    case 'tags': {
      if (!Array.isArray(value)) {
        return { valid: false, error: 'Tags must be an array' };
      }
      if (value.length > FILTER_LIMITS.tags.maxCount) {
        return {
          valid: false,
          error: `Cannot filter by more than ${FILTER_LIMITS.tags.maxCount} tags`,
        };
      }
      const validTags = [];
      for (const tag of value) {
        if (typeof tag !== 'string') continue;
        const trimmed = tag.trim();
        if (trimmed.length > 0 && trimmed.length <= FILTER_LIMITS.tags.maxLength) {
          validTags.push(trimmed);
        }
      }
      if (validTags.length === 0) {
        return { valid: false, error: 'At least one valid tag is required' };
      }
      return { valid: true, value: validTags };
    }

    default:
      return { valid: false, error: `Unknown filter type: ${type}` };
  }
}

/**
 * Build Qdrant filter object from filter parameters
 * SECURITY FIX (GAP 12): Validates all filter parameters before building query
 * MULTI-TENANT FIX: ALWAYS includes workspaceId for tenant isolation
 *
 * @param {RetrievalFilters|null} filters - Filter parameters (optional user filters)
 * @param {string} workspaceId - Workspace ID (REQUIRED for multi-tenant isolation)
 * @returns {QdrantFilter} Qdrant filter object (always includes workspaceId)
 * @throws {Error} If workspaceId is missing or filter validation fails
 */
export function buildQdrantFilter(filters, workspaceId) {
  // CRITICAL: workspaceId is REQUIRED for multi-tenant isolation
  if (!workspaceId || typeof workspaceId !== 'string') {
    throw new Error('workspaceId is required for vector store queries (multi-tenant isolation)');
  }

  const qdrantFilter = { must: [] };
  const errors = [];

  // ALWAYS add workspaceId filter for tenant isolation
  // This ensures queries only return documents from the user's workspace
  qdrantFilter.must.push({
    key: 'metadata.workspaceId',
    match: { value: workspaceId },
  });

  // Process optional user-provided filters
  if (filters && typeof filters === 'object') {
    // Validate and add page filter
    if (filters.page !== undefined) {
      const result = validateFilterValue('page', filters.page);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.page',
          match: { value: result.value },
        });
      }
    }

    // Validate and add section filter
    if (filters.section !== undefined) {
      const result = validateFilterValue('section', filters.section);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.section',
          match: { value: result.value },
        });
      }
    }

    // Validate and add page range filter
    if (filters.pageRange !== undefined) {
      const result = validateFilterValue('pageRange', filters.pageRange);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.page',
          range: {
            gte: result.value.min,
            lte: result.value.max,
          },
        });
      }
    }

    // Validate and add date range filter (lastModified)
    if (filters.dateRange !== undefined) {
      const result = validateFilterValue('dateRange', filters.dateRange);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.lastModified',
          range: {
            gte: result.value.from,
            lte: result.value.to,
          },
        });
      }
    }

    // Validate and add author filter
    if (filters.author !== undefined) {
      const result = validateFilterValue('author', filters.author);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.author',
          match: { value: result.value },
        });
      }
    }

    // Validate and add document type filter
    if (filters.documentType !== undefined) {
      const result = validateFilterValue('documentType', filters.documentType);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.documentType',
          match: { value: result.value },
        });
      }
    }

    // Validate and add classification filter (exact match)
    if (filters.classification !== undefined) {
      const result = validateFilterValue('classification', filters.classification);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        qdrantFilter.must.push({
          key: 'metadata.classification',
          match: { value: result.value },
        });
      }
    }

    // Validate and add classification level filter (includes all at or below level)
    // Useful for RBAC: user with 'confidential' access can see public, internal, and confidential
    if (filters.classificationLevel !== undefined) {
      const result = validateFilterValue('classificationLevel', filters.classificationLevel);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        // Use "should" with minimum_should_match for OR logic
        const classificationConditions = result.value.map((level) => ({
          key: 'metadata.classification',
          match: { value: level },
        }));

        // Add as a nested should clause
        if (classificationConditions.length === 1) {
          qdrantFilter.must.push(classificationConditions[0]);
        } else {
          // For multiple levels, we need to wrap in should
          qdrantFilter.must.push({
            should: classificationConditions,
          });
        }
      }
    }

    // Validate and add tags filter (any match)
    if (filters.tags !== undefined) {
      const result = validateFilterValue('tags', filters.tags);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        // Use "should" for OR logic - document must match at least one tag
        if (!qdrantFilter.should) {
          qdrantFilter.should = [];
        }
        for (const tag of result.value) {
          qdrantFilter.should.push({
            key: 'metadata.tags',
            match: { value: tag },
          });
        }
      }
    }
  }

  // If there are validation errors, throw
  if (errors.length > 0) {
    throw new Error(`Filter validation failed: ${errors.join('; ')}`);
  }

  // Always return filter (workspaceId is always present)
  return qdrantFilter;
}

/**
 * Perform multi-query retrieval with query expansion and HyDE
 * Expands the query into variations and retrieves documents for each
 *
 * @param {string} searchQuery - The search query
 * @param {VectorStoreRetriever} retriever - Vector store retriever
 * @param {VectorStore} vectorStore - Vector store instance
 * @param {QdrantFilter|null} qdrantFilter - Optional Qdrant filter
 * @param {Logger} logger - Logger instance
 * @returns {Promise<MultiQueryRetrievalResult>} Retrieved documents, queries, and metrics
 */
export async function performMultiQueryRetrieval(
  searchQuery,
  retriever,
  vectorStore,
  qdrantFilter,
  logger
) {
  // Multi-query retrieval with query expansion + HyDE
  const queryVariations = await expandQuery(searchQuery);
  const hypotheticalDoc = await generateHypotheticalDocument(searchQuery);
  const allQueries = [...queryVariations, hypotheticalDoc];

  logger.info(`Expanded query into ${allQueries.length} variations (including HyDE)`, {
    service: 'rag',
    queries: allQueries.map((q) => q.substring(0, 50) + '...'),
  });

  // Retrieve documents for each query variation
  const allRetrievedDocs = [];
  for (const qVariation of allQueries) {
    let docs;
    if (qdrantFilter) {
      docs = await vectorStore.similaritySearch(qVariation, 15, qdrantFilter);
    } else {
      docs = await retriever.invoke(qVariation);
    }
    allRetrievedDocs.push(...docs);
  }

  // Deduplicate documents
  const retrievedDocs = deduplicateDocuments(allRetrievedDocs);

  // Calculate retrieval metrics
  const metrics = {
    queryVariations: allQueries.length,
    totalRetrieved: allRetrievedDocs.length,
    afterDeduplication: retrievedDocs.length,
    deduplicationRate:
      (((allRetrievedDocs.length - retrievedDocs.length) / allRetrievedDocs.length) * 100).toFixed(
        1
      ) + '%',
    avgDocLength:
      retrievedDocs.length > 0
        ? Math.round(
            retrievedDocs.reduce((sum, d) => sum + d.pageContent.length, 0) / retrievedDocs.length
          )
        : 0,
    uniquePages: [...new Set(retrievedDocs.map((d) => d.metadata?.page).filter(Boolean))].length,
    filtersApplied: !!qdrantFilter,
  };

  logger.info(`Retrieved ${retrievedDocs.length} unique documents from multi-query`, {
    service: 'rag',
    ...metrics,
  });

  return {
    documents: retrievedDocs,
    allQueries,
    metrics,
  };
}

/**
 * Retrieve additional documents for retry with more context
 * Used when initial retrieval doesn't produce sufficient results
 *
 * @param {string[]} allQueries - Query variations to use
 * @param {VectorStoreRetriever} retriever - Vector store retriever
 * @param {VectorStore} vectorStore - Vector store instance
 * @param {QdrantFilter|null} qdrantFilter - Optional Qdrant filter
 * @param {Document[]} existingDocs - Already retrieved documents
 * @returns {Promise<Document[]>} Combined unique documents (existing + additional)
 */
export async function retrieveAdditionalDocuments(
  allQueries,
  retriever,
  vectorStore,
  qdrantFilter,
  existingDocs
) {
  const additionalDocs = [];

  for (const qVariation of allQueries.slice(0, 2)) {
    const moreDocs = qdrantFilter
      ? await vectorStore.similaritySearch(qVariation, 20, qdrantFilter)
      : await retriever.invoke(qVariation);
    additionalDocs.push(...moreDocs);
  }

  // Deduplicate combined docs
  const combinedDocs = [...existingDocs, ...additionalDocs];
  return deduplicateDocuments(combinedDocs);
}
