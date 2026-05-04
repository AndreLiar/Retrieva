/**
 * RAG Result Builder
 *
 * Used to be paired with a `trackQueryAnalytics` writer, but the Analytics
 * Mongoose model was removed and every call site passed `Analytics: null`,
 * making the writer a permanent noop. The writer (and its rich JSDoc typedefs)
 * have been deleted; this module now exists only to expose buildRAGResult.
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
