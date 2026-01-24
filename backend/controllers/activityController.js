/**
 * Activity Feed Controller
 *
 * Handles activity feed API endpoints:
 * - GET /activity/:workspaceId - Get workspace activity feed
 * - GET /activity/:workspaceId/stats - Get activity statistics
 * - GET /activity/:workspaceId/users - Get active users
 * - GET /activity/:workspaceId/trending - Get trending questions
 * - POST /activity/:activityId/hide - Hide an activity
 * - GET /activity/me/history - Get user's own activity history
 *
 * @module controllers/activityController
 */

import { activityFeedService } from '../services/activityFeedService.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import logger from '../config/logger.js';

/**
 * Get workspace activity feed
 *
 * @route GET /api/v1/activity/:workspaceId
 */
export async function getWorkspaceActivity(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;
    const { page = 1, limit = 20, type } = req.query;

    // Check workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const result = await activityFeedService.getWorkspaceActivity(workspaceId, {
      page: parseInt(page),
      limit: parseInt(limit),
      activityType: type || null,
    });

    // Format activities for display
    const formattedActivities = result.activities.map((activity) =>
      activityFeedService.formatActivityForDisplay(activity)
    );

    res.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    logger.error('Failed to get workspace activity', {
      controller: 'activity',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity feed',
    });
  }
}

/**
 * Get activity statistics for a workspace
 *
 * @route GET /api/v1/activity/:workspaceId/stats
 */
export async function getActivityStats(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;
    const { timeRange = '24h' } = req.query;

    // Check workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const stats = await activityFeedService.getActivityStats(workspaceId, timeRange);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get activity stats', {
      controller: 'activity',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity statistics',
    });
  }
}

/**
 * Get active users in a workspace
 *
 * @route GET /api/v1/activity/:workspaceId/users
 */
export async function getActiveUsers(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;
    const { timeRange = '24h' } = req.query;

    // Check workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const users = await activityFeedService.getActiveUsers(workspaceId, timeRange);

    res.json({
      success: true,
      data: {
        users,
        timeRange,
        totalActiveUsers: users.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get active users', {
      controller: 'activity',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch active users',
    });
  }
}

/**
 * Get trending questions in a workspace
 *
 * @route GET /api/v1/activity/:workspaceId/trending
 */
export async function getTrendingQuestions(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;
    const { limit = 10 } = req.query;

    // Check workspace membership
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'Not a member of this workspace',
      });
    }

    const questions = await activityFeedService.getTrendingQuestions(workspaceId, parseInt(limit));

    res.json({
      success: true,
      data: {
        questions,
        totalQuestions: questions.length,
      },
    });
  } catch (error) {
    logger.error('Failed to get trending questions', {
      controller: 'activity',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending questions',
    });
  }
}

/**
 * Hide an activity (user can hide their own activities)
 *
 * @route POST /api/v1/activity/:activityId/hide
 */
export async function hideActivity(req, res) {
  try {
    const { activityId } = req.params;
    const userId = req.user.userId;

    await activityFeedService.hideActivity(activityId, userId);

    res.json({
      success: true,
      message: 'Activity hidden successfully',
    });
  } catch (error) {
    logger.error('Failed to hide activity', {
      controller: 'activity',
      error: error.message,
      activityId: req.params.activityId,
    });

    if (error.message === 'Activity not found or unauthorized') {
      return res.status(404).json({
        success: false,
        error: 'Activity not found or you are not authorized to hide it',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to hide activity',
    });
  }
}

/**
 * Get user's own activity history
 *
 * @route GET /api/v1/activity/me/history
 */
export async function getUserActivityHistory(req, res) {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 50 } = req.query;

    const result = await activityFeedService.getUserActivityHistory(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    // Format activities for display
    const formattedActivities = result.activities.map((activity) => ({
      ...activityFeedService.formatActivityForDisplay(activity),
      workspaceName: activity.workspaceId?.workspaceName || 'Unknown Workspace',
    }));

    res.json({
      success: true,
      data: {
        activities: formattedActivities,
        pagination: result.pagination,
      },
    });
  } catch (error) {
    logger.error('Failed to get user activity history', {
      controller: 'activity',
      error: error.message,
      userId: req.user.userId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to fetch activity history',
    });
  }
}

export const activityController = {
  getWorkspaceActivity,
  getActivityStats,
  getActiveUsers,
  getTrendingQuestions,
  hideActivity,
  getUserActivityHistory,
};

export default activityController;
