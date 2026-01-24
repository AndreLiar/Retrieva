/**
 * Analytics Model
 * Tracks business metrics for RAG system performance
 * @module models/Analytics
 */

import mongoose from 'mongoose';

/**
 * @typedef {Object} SourceInfo
 * @property {string} sourceId - Notion page/database ID
 * @property {string} title - Document title
 * @property {string} documentType - Type of document (page, database)
 */

/**
 * @typedef {Object} UserFeedback
 * @property {number} [rating] - User rating (1-5)
 * @property {boolean} [helpful] - Whether answer was helpful
 * @property {string} [comment] - User comment
 * @property {Date} [submittedAt] - When feedback was submitted
 */

/**
 * @typedef {Object} AnalyticsMetrics
 * @property {boolean} cacheHit - Whether response came from cache
 * @property {number} [sourcesUsed] - Number of sources cited
 */

/**
 * @typedef {Object} AnalyticsDocument
 * @property {mongoose.Types.ObjectId} _id - Unique identifier
 * @property {string} requestId - Unique request identifier
 * @property {string} [langsmithRunId] - LangSmith trace ID
 * @property {string} question - User question
 * @property {string} [questionHash] - Hash for duplicate detection
 * @property {AnalyticsMetrics} metrics - Business metrics
 * @property {SourceInfo[]} sources - Sources used in response
 * @property {UserFeedback} [userFeedback] - User feedback data
 * @property {mongoose.Types.ObjectId} [conversationId] - Related conversation
 * @property {string} [workspaceId] - Workspace identifier
 * @property {string} [userId] - User identifier
 * @property {Date} timestamp - Request timestamp
 */

/**
 * @typedef {Object} CacheStats
 * @property {number} totalRequests - Total number of requests
 * @property {number} cacheHits - Number of cache hits
 * @property {number} cacheMisses - Number of cache misses
 * @property {string} cacheHitRate - Cache hit rate as percentage
 */

/**
 * @typedef {Object} PopularQuestion
 * @property {string} _id - Question hash
 * @property {string} question - Question text
 * @property {number} count - Number of times asked
 * @property {Date} lastAsked - Last time question was asked
 * @property {number} [avgRating] - Average user rating
 */

/**
 * @typedef {Object} SourceUsage
 * @property {string} _id - Source ID
 * @property {string} title - Source title
 * @property {string} documentType - Document type
 * @property {number} usageCount - Number of times source was cited
 */

/**
 * @typedef {Object} FeedbackSummary
 * @property {number} totalFeedback - Total feedback entries
 * @property {string|null} avgRating - Average rating
 * @property {string} helpfulRate - Percentage of helpful responses
 * @property {Object<number, number>} ratingDistribution - Rating counts by value
 */

/**
 * @typedef {Object} BusinessSummary
 * @property {CacheStats} cache - Cache performance stats
 * @property {FeedbackSummary} feedback - Feedback summary
 * @property {PopularQuestion[]} topQuestions - Top 5 questions
 */

/**
 * Analytics Model (Simplified)
 *
 * Focuses on BUSINESS metrics only:
 * - Cache performance
 * - Popular questions
 * - User feedback
 * - Source usage
 *
 * LLM performance metrics (latency, tokens, traces) are handled by LangSmith.
 * Quality evaluation (faithfulness, relevancy) is handled by RAGAS.
 */
const analyticsSchema = new mongoose.Schema(
  {
    // Request identification
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Link to LangSmith for detailed tracing
    langsmithRunId: {
      type: String,
      index: true,
    },

    // Question details (for popular questions tracking)
    question: {
      type: String,
      required: true,
    },
    questionHash: {
      type: String,
      index: true, // For detecting duplicate questions
    },

    // Business metrics only
    metrics: {
      cacheHit: {
        type: Boolean,
        default: false,
      },
      sourcesUsed: Number, // How many sources were cited
    },

    // Sources used (for source usage analytics)
    sources: [
      {
        sourceId: String, // Notion page/database ID
        title: String,
        documentType: String, // page, database
      },
    ],

    // User feedback (critical business metric)
    userFeedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      helpful: Boolean,
      comment: String,
      submittedAt: Date,
    },

    // Context
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true,
    },
    workspaceId: {
      type: String,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for business analytics queries
analyticsSchema.index({ timestamp: -1 });
analyticsSchema.index({ 'metrics.cacheHit': 1, timestamp: -1 });
analyticsSchema.index({ 'userFeedback.rating': 1 });
analyticsSchema.index({ questionHash: 1, timestamp: -1 });

/**
 * Get cache performance statistics
 * @param {Date|string|null} [startDate=null] - Start of date range
 * @param {Date|string|null} [endDate=null] - End of date range
 * @returns {Promise<CacheStats>} Cache performance statistics
 */
analyticsSchema.statics.getCacheStats = async function (startDate = null, endDate = null) {
  const match = {};
  if (startDate || endDate) {
    match.timestamp = {};
    if (startDate) match.timestamp.$gte = new Date(startDate);
    if (endDate) match.timestamp.$lte = new Date(endDate);
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        cacheHits: { $sum: { $cond: ['$metrics.cacheHit', 1, 0] } },
        cacheMisses: { $sum: { $cond: ['$metrics.cacheHit', 0, 1] } },
      },
    },
  ]);

  const stats = result[0] || { totalRequests: 0, cacheHits: 0, cacheMisses: 0 };
  return {
    ...stats,
    cacheHitRate:
      stats.totalRequests > 0
        ? ((stats.cacheHits / stats.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
  };
};

/**
 * Get popular questions (most frequently asked)
 * @param {number} [limit=10] - Maximum number of questions to return
 * @returns {Promise<PopularQuestion[]>} Array of popular questions
 */
analyticsSchema.statics.getPopularQuestions = async function (limit = 10) {
  return this.aggregate([
    {
      $group: {
        _id: '$questionHash',
        question: { $first: '$question' },
        count: { $sum: 1 },
        lastAsked: { $max: '$timestamp' },
        avgRating: { $avg: '$userFeedback.rating' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);
};

/**
 * Get source usage statistics (which Notion docs are most helpful)
 * @param {number} [limit=20] - Maximum number of sources to return
 * @returns {Promise<SourceUsage[]>} Array of source usage stats
 */
analyticsSchema.statics.getSourceUsage = async function (limit = 20) {
  return this.aggregate([
    { $unwind: '$sources' },
    {
      $group: {
        _id: '$sources.sourceId',
        title: { $first: '$sources.title' },
        documentType: { $first: '$sources.documentType' },
        usageCount: { $sum: 1 },
      },
    },
    { $sort: { usageCount: -1 } },
    { $limit: limit },
  ]);
};

/**
 * Get user feedback summary
 * @param {Date|string|null} [startDate=null] - Start of date range
 * @param {Date|string|null} [endDate=null] - End of date range
 * @returns {Promise<FeedbackSummary>} Feedback summary statistics
 */
analyticsSchema.statics.getFeedbackSummary = async function (startDate = null, endDate = null) {
  const match = { 'userFeedback.rating': { $exists: true } };
  if (startDate || endDate) {
    match.timestamp = {};
    if (startDate) match.timestamp.$gte = new Date(startDate);
    if (endDate) match.timestamp.$lte = new Date(endDate);
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalFeedback: { $sum: 1 },
        avgRating: { $avg: '$userFeedback.rating' },
        helpfulCount: { $sum: { $cond: ['$userFeedback.helpful', 1, 0] } },
        notHelpfulCount: { $sum: { $cond: ['$userFeedback.helpful', 0, 1] } },
        ratingDistribution: {
          $push: '$userFeedback.rating',
        },
      },
    },
  ]);

  if (!result[0]) {
    return {
      totalFeedback: 0,
      avgRating: null,
      helpfulRate: '0%',
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  // Calculate rating distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of result[0].ratingDistribution) {
    if (rating >= 1 && rating <= 5) {
      distribution[Math.floor(rating)]++;
    }
  }

  return {
    totalFeedback: result[0].totalFeedback,
    avgRating: result[0].avgRating?.toFixed(2),
    helpfulRate:
      result[0].totalFeedback > 0
        ? ((result[0].helpfulCount / result[0].totalFeedback) * 100).toFixed(2) + '%'
        : '0%',
    ratingDistribution: distribution,
  };
};

/**
 * Get requests without feedback (for follow-up)
 * @param {number} [limit=50] - Maximum number of requests to return
 * @returns {Promise<AnalyticsDocument[]>} Requests missing feedback
 */
analyticsSchema.statics.getRequestsWithoutFeedback = async function (limit = 50) {
  return this.find({
    'userFeedback.rating': { $exists: false },
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('requestId question timestamp conversationId');
};

/**
 * Get complete business summary
 * Combines cache stats, feedback summary, and popular questions
 * @param {Date|string|null} [startDate=null] - Start of date range
 * @param {Date|string|null} [endDate=null] - End of date range
 * @returns {Promise<BusinessSummary>} Complete business metrics summary
 */
analyticsSchema.statics.getBusinessSummary = async function (startDate = null, endDate = null) {
  const [cacheStats, feedbackSummary, popularQuestions] = await Promise.all([
    this.getCacheStats(startDate, endDate),
    this.getFeedbackSummary(startDate, endDate),
    this.getPopularQuestions(5),
  ]);

  return {
    cache: cacheStats,
    feedback: feedbackSummary,
    topQuestions: popularQuestions,
  };
};

export const Analytics = mongoose.model('Analytics', analyticsSchema);
