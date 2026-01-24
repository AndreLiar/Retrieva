/**
 * Activity Feed Routes
 *
 * Provides API routes for workspace activity feeds:
 * - Recent activity stream
 * - Activity statistics
 * - Active users
 * - Trending questions
 *
 * @module routes/activityRoutes
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { activityController } from '../controllers/activityController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route GET /api/v1/activity/me/history
 * @description Get current user's activity history across all workspaces
 * @access Private
 */
router.get('/me/history', activityController.getUserActivityHistory);

/**
 * @route GET /api/v1/activity/:workspaceId
 * @description Get activity feed for a workspace
 * @access Private (workspace members only)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} type - Filter by activity type
 */
router.get('/:workspaceId', activityController.getWorkspaceActivity);

/**
 * @route GET /api/v1/activity/:workspaceId/stats
 * @description Get activity statistics for a workspace
 * @access Private (workspace members only)
 * @query {string} timeRange - Time range: 1h, 24h, 7d, 30d (default: 24h)
 */
router.get('/:workspaceId/stats', activityController.getActivityStats);

/**
 * @route GET /api/v1/activity/:workspaceId/users
 * @description Get active users in a workspace
 * @access Private (workspace members only)
 * @query {string} timeRange - Time range: 1h, 24h, 7d (default: 24h)
 */
router.get('/:workspaceId/users', activityController.getActiveUsers);

/**
 * @route GET /api/v1/activity/:workspaceId/trending
 * @description Get trending questions in a workspace
 * @access Private (workspace members only)
 * @query {number} limit - Number of questions to return (default: 10)
 */
router.get('/:workspaceId/trending', activityController.getTrendingQuestions);

/**
 * @route POST /api/v1/activity/:activityId/hide
 * @description Hide an activity (only owner can hide their own activities)
 * @access Private
 */
router.post('/:activityId/hide', activityController.hideActivity);

export default router;
