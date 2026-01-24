import { Analytics } from '../models/Analytics.js';
import { ragCache } from '../utils/rag/ragCache.js';
import logger from '../config/logger.js';
import { sendSuccess, sendError } from '../utils/core/responseFormatter.js';

/**
 * Analytics Controller (Simplified)
 *
 * Provides business metrics only:
 * - Cache performance
 * - Popular questions
 * - User feedback
 * - Source usage
 *
 * LLM performance metrics are now in LangSmith.
 * Quality evaluation is now in RAGAS.
 */

/**
 * Get business analytics summary
 * GET /api/v1/analytics/summary?startDate=2024-01-01&endDate=2024-12-31
 */
export const getAnalyticsSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await Analytics.getBusinessSummary(startDate, endDate);
    const cacheStatus = await ragCache.getStats();

    const result = {
      period: {
        start: startDate || 'All time',
        end: endDate || 'Now',
      },
      cache: {
        ...summary.cache,
        redisStatus: cacheStatus,
      },
      feedback: summary.feedback,
      topQuestions: summary.topQuestions,
      note: 'For LLM performance metrics, see LangSmith. For quality evaluation, use /api/v1/evaluation endpoints.',
    };

    logger.info('Analytics summary generated', {
      service: 'analytics',
      totalRequests: summary.cache.totalRequests,
    });

    sendSuccess(res, 200, 'Analytics summary retrieved successfully', result);
  } catch (error) {
    logger.error('Failed to get analytics summary', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve analytics summary');
  }
};

/**
 * Get popular questions
 * GET /api/v1/analytics/popular-questions?limit=10
 */
export const getPopularQuestions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const popularQuestions = await Analytics.getPopularQuestions(limit);

    logger.info('Popular questions retrieved', {
      service: 'analytics',
      count: popularQuestions.length,
    });

    sendSuccess(res, 200, 'Popular questions retrieved successfully', {
      questions: popularQuestions.map((q) => ({
        question: q.question,
        count: q.count,
        lastAsked: q.lastAsked,
        avgRating: q.avgRating?.toFixed(2) || null,
      })),
      total: popularQuestions.length,
    });
  } catch (error) {
    logger.error('Failed to get popular questions', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve popular questions');
  }
};

/**
 * Get feedback trends over time
 * GET /api/v1/analytics/feedback-trends?days=7
 */
export const getFeedbackTrends = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await Analytics.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
          },
          totalRequests: { $sum: 1 },
          cacheHits: { $sum: { $cond: ['$metrics.cacheHit', 1, 0] } },
          feedbackCount: {
            $sum: { $cond: [{ $ifNull: ['$userFeedback.rating', false] }, 1, 0] },
          },
          avgRating: { $avg: '$userFeedback.rating' },
          helpfulCount: {
            $sum: { $cond: ['$userFeedback.helpful', 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    logger.info('Feedback trends retrieved', {
      service: 'analytics',
      days,
      dataPoints: trends.length,
    });

    sendSuccess(res, 200, 'Feedback trends retrieved successfully', {
      period: `Last ${days} days`,
      trends: trends.map((t) => ({
        date: t._id,
        totalRequests: t.totalRequests,
        cacheHitRate: ((t.cacheHits / t.totalRequests) * 100).toFixed(1) + '%',
        feedbackCount: t.feedbackCount,
        avgRating: t.avgRating?.toFixed(2) || null,
        helpfulCount: t.helpfulCount,
      })),
    });
  } catch (error) {
    logger.error('Failed to get feedback trends', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve feedback trends');
  }
};

/**
 * Get source usage statistics
 * GET /api/v1/analytics/source-stats?limit=20
 */
export const getSourceStats = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const sourceStats = await Analytics.getSourceUsage(limit);

    logger.info('Source statistics retrieved', {
      service: 'analytics',
      count: sourceStats.length,
    });

    sendSuccess(res, 200, 'Source statistics retrieved successfully', {
      sources: sourceStats.map((s) => ({
        sourceId: s._id,
        title: s.title,
        documentType: s.documentType,
        usageCount: s.usageCount,
      })),
      total: sourceStats.length,
    });
  } catch (error) {
    logger.error('Failed to get source stats', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve source statistics');
  }
};

/**
 * Get cache performance statistics
 * GET /api/v1/analytics/cache-stats
 */
export const getCacheStats = async (req, res) => {
  try {
    const [cacheStats, redisStatus] = await Promise.all([
      Analytics.getCacheStats(),
      ragCache.getStats(),
    ]);

    const result = {
      performance: {
        totalRequests: cacheStats.totalRequests,
        cacheHits: cacheStats.cacheHits,
        cacheMisses: cacheStats.cacheMisses,
        hitRate: cacheStats.cacheHitRate,
      },
      redisStatus,
    };

    logger.info('Cache statistics retrieved', {
      service: 'analytics',
      hitRate: result.performance.hitRate,
    });

    sendSuccess(res, 200, 'Cache statistics retrieved successfully', result);
  } catch (error) {
    logger.error('Failed to get cache stats', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve cache statistics');
  }
};

/**
 * Get user feedback summary
 * GET /api/v1/analytics/feedback-summary?startDate=...&endDate=...
 */
export const getFeedbackSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await Analytics.getFeedbackSummary(startDate, endDate);

    logger.info('Feedback summary retrieved', {
      service: 'analytics',
      totalFeedback: summary.totalFeedback,
    });

    sendSuccess(res, 200, 'Feedback summary retrieved successfully', summary);
  } catch (error) {
    logger.error('Failed to get feedback summary', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to retrieve feedback summary');
  }
};

/**
 * Submit user feedback for a request
 * POST /api/v1/analytics/feedback
 *
 * SECURITY FIX (API3): Only return submitted feedback fields, not internal record structure
 */
export const submitFeedback = async (req, res) => {
  try {
    const { requestId, rating, helpful, comment } = req.body;

    if (!requestId) {
      return sendError(res, 400, 'requestId is required');
    }

    if (rating !== undefined && (rating < 1 || rating > 5)) {
      return sendError(res, 400, 'Rating must be between 1 and 5');
    }

    // SECURITY FIX (API3): Use projection to only return necessary fields
    const submittedAt = new Date();
    const analytics = await Analytics.findOneAndUpdate(
      { requestId },
      {
        $set: {
          'userFeedback.rating': rating,
          'userFeedback.helpful': helpful,
          'userFeedback.comment': comment,
          'userFeedback.submittedAt': submittedAt,
        },
      },
      {
        new: true,
        // Only select requestId to confirm update, not internal fields
        projection: { requestId: 1, userFeedback: 1 },
      }
    );

    if (!analytics) {
      return sendError(res, 404, 'Request not found');
    }

    logger.info('User feedback submitted', {
      service: 'analytics',
      requestId,
      rating,
      helpful,
    });

    // SECURITY FIX (API3): Only return the fields that were actually submitted
    // Don't expose internal analytics structure
    sendSuccess(res, 200, 'Feedback submitted successfully', {
      requestId,
      feedback: {
        rating: rating !== undefined ? rating : null,
        helpful: helpful !== undefined ? helpful : null,
        commentReceived: !!comment,
        submittedAt,
      },
    });
  } catch (error) {
    logger.error('Failed to submit feedback', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to submit feedback');
  }
};

/**
 * Clear cache (admin endpoint)
 * DELETE /api/v1/analytics/cache
 */
export const clearCache = async (req, res) => {
  try {
    await ragCache.clearAll();

    logger.info('Cache cleared by admin', {
      service: 'analytics',
    });

    sendSuccess(res, 200, 'Cache cleared successfully');
  } catch (error) {
    logger.error('Failed to clear cache', {
      service: 'analytics',
      error: error.message,
    });
    sendError(res, 500, 'Failed to clear cache');
  }
};
