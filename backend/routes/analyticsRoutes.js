import express from 'express';
import {
  getAnalyticsSummary,
  getPopularQuestions,
  getFeedbackTrends,
  getSourceStats,
  getCacheStats,
  getFeedbackSummary,
  getUsageData,
  getFeedbackDistribution,
  submitFeedback,
  clearCache,
} from '../controllers/analyticsController.js';
import { liveAnalyticsController } from '../controllers/liveAnalyticsController.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { feedbackSubmitSchema } from '../validators/schemas.js';

const router = express.Router();

/**
 * @route   GET /api/v1/analytics/summary
 * @desc    Get business analytics summary (cache, feedback, top questions)
 * @query   startDate, endDate (optional)
 * @access  Private (authenticated users)
 *
 * SECURITY FIX (API5): All analytics routes now require authentication
 */
// Note: Query validation temporarily disabled for Express 5 compatibility
// Controllers handle defaults/parsing internally
router.get('/summary', authenticate, getAnalyticsSummary);
router.get('/usage', authenticate, getUsageData);
router.get('/popular-questions', authenticate, getPopularQuestions);
router.get('/feedback-trends', authenticate, getFeedbackTrends);
router.get('/feedback-distribution', authenticate, getFeedbackDistribution);
router.get('/source-stats', authenticate, getSourceStats);
router.get('/cache-stats', authenticate, getCacheStats);
router.get('/feedback-summary', authenticate, getFeedbackSummary);

/**
 * @route   POST /api/v1/analytics/feedback
 * @desc    Submit user feedback for a request
 * @body    requestId, rating (1-5), helpful (boolean), comment (optional)
 * @access  Public
 */
router.post('/feedback', validateBody(feedbackSubmitSchema), submitFeedback);

/**
 * @route   DELETE /api/v1/analytics/cache
 * @desc    Clear all cached responses (admin only)
 * @access  Private (Admin)
 */
router.delete('/cache', authenticate, authorize('admin'), clearCache);

// ============================================================================
// Live Analytics Routes (Real-time Dashboard)
// ============================================================================

/**
 * @route   GET /api/v1/analytics/live/metrics
 * @desc    Get current real-time query metrics
 * @access  Private
 */
router.get('/live/metrics', authenticate, liveAnalyticsController.getQueryMetrics);

/**
 * @route   GET /api/v1/analytics/live/health
 * @desc    Get system health status
 * @access  Private
 */
router.get('/live/health', authenticate, liveAnalyticsController.getSystemHealth);

/**
 * @route   GET /api/v1/analytics/live/platform
 * @desc    Get platform-wide statistics
 * @access  Private (Admin only)
 */
router.get(
  '/live/platform',
  authenticate,
  authorize('admin'),
  liveAnalyticsController.getPlatformStats
);

/**
 * @route   GET /api/v1/analytics/live/workspace/:workspaceId
 * @desc    Get real-time workspace statistics
 * @access  Private (workspace members only)
 */
router.get('/live/workspace/:workspaceId', authenticate, liveAnalyticsController.getWorkspaceStats);

/**
 * @route   POST /api/v1/analytics/live/subscribe
 * @desc    Subscribe to real-time analytics WebSocket updates
 * @access  Private
 */
router.post('/live/subscribe', authenticate, liveAnalyticsController.subscribeToAnalytics);

/**
 * @route   POST /api/v1/analytics/live/unsubscribe
 * @desc    Unsubscribe from real-time analytics updates
 * @access  Private
 */
router.post('/live/unsubscribe', authenticate, liveAnalyticsController.unsubscribeFromAnalytics);

export default router;
