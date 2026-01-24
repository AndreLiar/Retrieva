/**
 * Analytics Tracker Module
 * Centralized analytics tracking for RAG queries
 * @module services/rag/analyticsTracker
 */

/**
 * @typedef {Object} CitedSource
 * @property {string} [url] - Source URL
 * @property {string} title - Source title
 * @property {string} [type] - Document type
 */

/**
 * @typedef {Object} ValidationResult
 * @property {number} confidence - Confidence score (0-1)
 * @property {number} citationCount - Number of citations
 * @property {string[]} issues - Quality issues detected
 */

/**
 * @typedef {Object} RetrievalMetrics
 * @property {number} queryVariations - Number of query variations
 * @property {number} totalRetrieved - Total documents retrieved
 * @property {number} afterDeduplication - Documents after deduplication
 */

/**
 * @typedef {Object} AnalyticsModel
 * @property {function(Object): Promise<Object>} create - Create analytics record
 */

/**
 * @typedef {Object} CacheService
 * @property {function(string): string} getQuestionHash - Hash a question string
 */

/**
 * @typedef {Object} Logger
 * @property {function(string, Object?): void} error - Log error message
 */

/**
 * @typedef {Object} TrackingParams
 * @property {AnalyticsModel} Analytics - Analytics Mongoose model
 * @property {CacheService} cache - Cache service with hash function
 * @property {Logger} logger - Logger instance
 * @property {string} requestId - Unique request ID
 * @property {string} question - User question
 * @property {boolean} cacheHit - Whether cache was hit
 * @property {CitedSource[]} [citedSources=[]] - Sources cited in answer
 * @property {string} [conversationId=null] - Optional conversation ID
 */

/**
 * Track RAG query analytics (business metrics)
 * LangSmith handles LLM performance metrics separately
 *
 * @param {TrackingParams} params - Tracking parameters
 * @returns {Promise<void>}
 */
export async function trackQueryAnalytics({
  Analytics,
  cache,
  logger,
  requestId,
  question,
  cacheHit,
  citedSources = [],
  conversationId = null,
}) {
  try {
    const analyticsData = {
      requestId,
      question,
      questionHash: cache.getQuestionHash(question),
      metrics: {
        cacheHit,
        sourcesUsed: citedSources.length,
      },
      timestamp: new Date(),
    };

    if (conversationId) {
      analyticsData.conversationId = conversationId;
    }

    if (citedSources.length > 0) {
      analyticsData.sources = citedSources.map((s) => ({
        sourceId: s.url || s.title,
        title: s.title,
        documentType: s.type || 'page',
      }));
    }

    await Analytics.create(analyticsData);
  } catch (err) {
    logger.error('Analytics tracking failed', { error: err.message });
  }
}

/**
 * @typedef {Object} FormattedAnswer
 * @property {string} markdown - Answer in markdown format
 * @property {string} [html] - Answer in HTML format
 */

/**
 * @typedef {Object} RAGResultMetadata
 * @property {number} confidence - Confidence score
 * @property {number} citationCount - Number of citations
 * @property {CitedSource[]} citedSources - Sources that were cited
 * @property {string[]} qualityIssues - Quality issues detected
 * @property {number} totalTime - Total processing time in ms
 * @property {RetrievalMetrics} [retrievalMetrics] - Retrieval statistics
 * @property {string} [conversationId] - Conversation ID if applicable
 * @property {boolean} [retriedWithMoreContext] - Whether retry was performed
 */

/**
 * @typedef {Object} RAGResult
 * @property {string} answer - Generated answer text
 * @property {FormattedAnswer} formatted - Formatted answer object
 * @property {CitedSource[]} sources - All available sources
 * @property {RAGResultMetadata} metadata - Result metadata
 */

/**
 * @typedef {Object} BuildRAGResultParams
 * @property {string} answer - Generated answer text
 * @property {FormattedAnswer} formattedAnswer - Formatted answer
 * @property {CitedSource[]} sources - All available sources
 * @property {ValidationResult} validation - Validation results
 * @property {CitedSource[]} citedSources - Sources that were cited
 * @property {RetrievalMetrics} [retrievalMetrics=null] - Retrieval metrics
 * @property {string} [conversationId=null] - Conversation ID
 * @property {boolean} [retriedWithMoreContext=false] - Whether retry occurred
 * @property {number} totalTime - Total processing time in ms
 */

/**
 * Build result object for RAG response
 * @param {BuildRAGResultParams} params - Result parameters
 * @returns {RAGResult} Formatted result object for API response
 */
export function buildRAGResult({
  answer,
  formattedAnswer,
  sources,
  validation,
  citedSources,
  retrievalMetrics = null,
  conversationId = null,
  retriedWithMoreContext = false,
  totalTime,
}) {
  const result = {
    answer: answer || '',
    formatted: formattedAnswer,
    sources: sources,
    metadata: {
      confidence: validation.confidence,
      citationCount: validation.citationCount,
      citedSources: citedSources,
      qualityIssues: validation.issues,
      totalTime: totalTime,
    },
  };

  if (retrievalMetrics) {
    result.metadata.retrievalMetrics = retrievalMetrics;
  }

  if (conversationId) {
    result.metadata.conversationId = conversationId;
  }

  if (retriedWithMoreContext) {
    result.metadata.retriedWithMoreContext = true;
  }

  return result;
}
