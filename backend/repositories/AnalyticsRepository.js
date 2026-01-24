/**
 * Analytics Repository
 *
 * Encapsulates all data access for Analytics model.
 * Complex aggregation queries extracted from model statics.
 */

import { BaseRepository } from './BaseRepository.js';
import { Analytics } from '../models/Analytics.js';

class AnalyticsRepository extends BaseRepository {
  constructor(model = Analytics) {
    super(model);
  }

  /**
   * Get analytics summary for a date range
   * @param {Date|string} startDate - Start date (optional)
   * @param {Date|string} endDate - End date (optional)
   * @returns {Promise<Object>} - Summary statistics
   */
  async getSummary(startDate = null, endDate = null) {
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
          avgResponseTime: { $avg: '$metrics.totalTime' },
          avgConfidence: { $avg: '$quality.confidence' },
          cacheHitRate: {
            $avg: { $cond: ['$metrics.cacheHit', 1, 0] },
          },
          lowQualityCount: {
            $sum: { $cond: ['$quality.isLowQuality', 1, 0] },
          },
          avgSourcesUsed: { $avg: '$metrics.sourcesUsed' },
        },
      },
    ]);

    return (
      result[0] || {
        totalRequests: 0,
        avgResponseTime: 0,
        avgConfidence: 0,
        cacheHitRate: 0,
        lowQualityCount: 0,
        avgSourcesUsed: 0,
      }
    );
  }

  /**
   * Get most frequently asked questions
   * @param {number} limit - Number of questions to return
   * @returns {Promise<Array>} - Popular questions with stats
   */
  async getPopularQuestions(limit = 10) {
    return this.aggregate([
      {
        $group: {
          _id: '$questionHash',
          question: { $first: '$question' },
          count: { $sum: 1 },
          avgConfidence: { $avg: '$quality.confidence' },
          avgResponseTime: { $avg: '$metrics.totalTime' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
  }

  /**
   * Get quality metrics over time (for charts)
   * @param {string} interval - 'hour', 'day', 'week', 'month'
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} - Time series data
   */
  async getQualityTrend(interval = 'day', startDate = null, endDate = null) {
    const match = {};
    if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) match.timestamp.$gte = new Date(startDate);
      if (endDate) match.timestamp.$lte = new Date(endDate);
    }

    const dateFormat = {
      hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
      day: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
      week: { $isoWeek: '$timestamp' },
      month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
    };

    return this.aggregate([
      { $match: match },
      {
        $group: {
          _id: dateFormat[interval] || dateFormat.day,
          avgConfidence: { $avg: '$quality.confidence' },
          avgResponseTime: { $avg: '$metrics.totalTime' },
          totalRequests: { $sum: 1 },
          cacheHits: { $sum: { $cond: ['$metrics.cacheHit', 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  /**
   * Get requests by conversation
   * @param {string} conversationId - Conversation ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Analytics for conversation
   */
  async findByConversation(conversationId, options = {}) {
    return this.find({ conversationId }, { sort: { timestamp: -1 }, ...options });
  }

  /**
   * Track a new RAG request
   * @param {Object} data - Analytics data
   * @returns {Promise<Document>}
   */
  async trackRequest(data) {
    return this.create({
      requestId: data.requestId,
      question: data.question,
      questionHash: data.questionHash,
      metrics: data.metrics,
      quality: data.quality,
      sources: data.sources,
      conversationId: data.conversationId,
      hasHistory: data.hasHistory,
      workspaceId: data.workspaceId,
      timestamp: data.timestamp || new Date(),
    });
  }

  /**
   * Submit user feedback for a request
   * @param {string} requestId - Request ID
   * @param {Object} feedback - Feedback data
   * @returns {Promise<Document>}
   */
  async submitFeedback(requestId, feedback) {
    return this.updateOne(
      { requestId },
      {
        userFeedback: {
          rating: feedback.rating,
          helpful: feedback.helpful,
          comment: feedback.comment,
          submittedAt: new Date(),
        },
      }
    );
  }

  /**
   * Get low quality requests for review
   * @param {number} limit - Number of requests
   * @returns {Promise<Array>}
   */
  async getLowQualityRequests(limit = 20) {
    return this.find(
      { 'quality.isLowQuality': true },
      {
        sort: { timestamp: -1 },
        limit,
        select: 'requestId question quality.confidence quality.qualityIssues timestamp',
      }
    );
  }

  /**
   * Get cache performance statistics
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>}
   */
  async getCacheStats(startDate = null, endDate = null) {
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
          total: { $sum: 1 },
          cacheHits: { $sum: { $cond: ['$metrics.cacheHit', 1, 0] } },
          avgTimeWithCache: {
            $avg: {
              $cond: ['$metrics.cacheHit', '$metrics.totalTime', null],
            },
          },
          avgTimeWithoutCache: {
            $avg: {
              $cond: ['$metrics.cacheHit', null, '$metrics.totalTime'],
            },
          },
        },
      },
    ]);

    const stats = result[0] || { total: 0, cacheHits: 0 };
    return {
      ...stats,
      cacheHitRate: stats.total > 0 ? stats.cacheHits / stats.total : 0,
      timeSavedPercent:
        stats.avgTimeWithoutCache > 0
          ? ((stats.avgTimeWithoutCache - stats.avgTimeWithCache) / stats.avgTimeWithoutCache) * 100
          : 0,
    };
  }
}

// Singleton instance for backward compatibility
const analyticsRepository = new AnalyticsRepository();

export { AnalyticsRepository, analyticsRepository };
