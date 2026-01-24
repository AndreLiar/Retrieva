/**
 * Activity Feed Service
 *
 * Manages workspace activity feeds including:
 * - Query activity logging and broadcasting
 * - Activity aggregation and stats
 * - Real-time activity streaming
 * - Anonymization support
 *
 * @module services/activityFeedService
 */

import { QueryActivity, ActivityTypes } from '../models/QueryActivity.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { emitToWorkspace } from './socketService.js';
import logger from '../config/logger.js';

// ============================================================================
// Event Types for Activity Feed
// ============================================================================

export const ActivityEventTypes = {
  ACTIVITY_NEW: 'activity:new',
  ACTIVITY_QUERY: 'activity:query',
  ACTIVITY_SYNC: 'activity:sync',
  ACTIVITY_MEMBER: 'activity:member',
};

// ============================================================================
// Activity Logging Functions
// ============================================================================

/**
 * Log a query activity and broadcast to workspace
 *
 * @param {Object} params - Query parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.userId - User who made the query
 * @param {string} params.question - The question asked
 * @param {string} [params.conversationId] - Associated conversation
 * @param {Object} [params.metrics] - Query metrics
 * @param {boolean} [params.isAnonymous=false] - Whether to anonymize
 * @returns {Promise<Object>} Created activity
 */
export async function logQueryActivity({
  workspaceId,
  userId,
  question,
  conversationId,
  metrics = {},
  isAnonymous = false,
}) {
  try {
    // Create activity record
    const activity = await QueryActivity.logQuery({
      workspaceId,
      userId,
      question,
      conversationId,
      metrics,
      isAnonymous,
    });

    // Get user info for broadcast (unless anonymous)
    let userInfo = { name: 'Anonymous', email: null };
    if (!isAnonymous) {
      const member = await WorkspaceMember.findOne({
        workspaceId,
        userId,
        status: 'active',
      }).populate('userId', 'name email');

      if (member?.userId) {
        userInfo = {
          name: member.userId.name || 'Unknown User',
          email: member.userId.email,
        };
      }
    }

    // Broadcast to workspace members
    const broadcastData = {
      id: activity._id,
      type: ActivityTypes.QUERY,
      questionPreview: activity.questionPreview,
      userName: userInfo.name,
      isAnonymous,
      metrics: {
        responseTimeMs: metrics.responseTimeMs,
        confidence: metrics.confidence,
      },
      timestamp: activity.createdAt,
    };

    emitToWorkspace(workspaceId.toString(), ActivityEventTypes.ACTIVITY_QUERY, broadcastData);

    logger.debug('Query activity logged and broadcast', {
      service: 'activity-feed',
      workspaceId: workspaceId.toString(),
      activityId: activity._id.toString(),
    });

    return activity;
  } catch (error) {
    logger.error('Failed to log query activity', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    // Don't throw - activity logging should not break the main flow
    return null;
  }
}

/**
 * Log a sync activity
 *
 * @param {Object} params - Sync parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.userId - User who initiated sync
 * @param {string} params.activityType - Type of sync activity
 * @param {Object} [params.data] - Additional data
 * @returns {Promise<Object>} Created activity
 */
export async function logSyncActivity({ workspaceId, userId, activityType, data = {} }) {
  try {
    const activity = await QueryActivity.logActivity({
      workspaceId,
      userId,
      activityType,
      data,
    });

    // Get user info
    const member = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
    }).populate('userId', 'name');

    const userName = member?.userId?.name || 'System';

    // Broadcast sync activity
    const broadcastData = {
      id: activity._id,
      type: activityType,
      userName,
      data,
      timestamp: activity.createdAt,
    };

    emitToWorkspace(workspaceId.toString(), ActivityEventTypes.ACTIVITY_SYNC, broadcastData);

    return activity;
  } catch (error) {
    logger.error('Failed to log sync activity', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    return null;
  }
}

/**
 * Log a member activity (join/leave)
 *
 * @param {Object} params - Member activity parameters
 * @param {string} params.workspaceId - Workspace ID
 * @param {string} params.userId - User ID
 * @param {string} params.activityType - MEMBER_JOINED or MEMBER_LEFT
 * @param {string} [params.memberName] - Name of the member
 * @returns {Promise<Object>} Created activity
 */
export async function logMemberActivity({ workspaceId, userId, activityType, memberName }) {
  try {
    const activity = await QueryActivity.logActivity({
      workspaceId,
      userId,
      activityType,
      data: { memberName },
    });

    // Broadcast member activity
    const broadcastData = {
      id: activity._id,
      type: activityType,
      memberName,
      timestamp: activity.createdAt,
    };

    emitToWorkspace(workspaceId.toString(), ActivityEventTypes.ACTIVITY_MEMBER, broadcastData);

    return activity;
  } catch (error) {
    logger.error('Failed to log member activity', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    return null;
  }
}

// ============================================================================
// Activity Retrieval Functions
// ============================================================================

/**
 * Get recent activity for a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=20] - Number of activities to return
 * @param {number} [options.page=1] - Page number
 * @param {string} [options.activityType] - Filter by type
 * @param {boolean} [options.includeHidden=false] - Include hidden activities
 * @returns {Promise<Object>} Activities with pagination
 */
export async function getWorkspaceActivity(workspaceId, options = {}) {
  try {
    return await QueryActivity.getWorkspaceActivity(workspaceId, options);
  } catch (error) {
    logger.error('Failed to get workspace activity', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get activity statistics for a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} [timeRange='24h'] - Time range (1h, 24h, 7d, 30d)
 * @returns {Promise<Object>} Activity statistics
 */
export async function getActivityStats(workspaceId, timeRange = '24h') {
  try {
    return await QueryActivity.getActivityStats(workspaceId, timeRange);
  } catch (error) {
    logger.error('Failed to get activity stats', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get active users in a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} [timeRange='24h'] - Time range
 * @returns {Promise<Array>} Active users with query counts
 */
export async function getActiveUsers(workspaceId, timeRange = '24h') {
  try {
    return await QueryActivity.getActiveUsers(workspaceId, timeRange);
  } catch (error) {
    logger.error('Failed to get active users', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get trending questions in a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {number} [limit=10] - Number of questions to return
 * @returns {Promise<Array>} Trending questions
 */
export async function getTrendingQuestions(workspaceId, limit = 10) {
  try {
    return await QueryActivity.getTrendingQuestions(workspaceId, limit);
  } catch (error) {
    logger.error('Failed to get trending questions', {
      service: 'activity-feed',
      workspaceId: workspaceId?.toString(),
      error: error.message,
    });
    throw error;
  }
}

// ============================================================================
// Activity Management Functions
// ============================================================================

/**
 * Hide an activity (user can hide their own activities)
 *
 * @param {string} activityId - Activity ID
 * @param {string} userId - User requesting the hide
 * @returns {Promise<Object>} Updated activity
 */
export async function hideActivity(activityId, userId) {
  try {
    const activity = await QueryActivity.findOneAndUpdate(
      { _id: activityId, userId },
      { isHidden: true },
      { new: true }
    );

    if (!activity) {
      throw new Error('Activity not found or unauthorized');
    }

    logger.info('Activity hidden', {
      service: 'activity-feed',
      activityId,
      userId: userId.toString(),
    });

    return activity;
  } catch (error) {
    logger.error('Failed to hide activity', {
      service: 'activity-feed',
      activityId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get user's own activity history
 *
 * @param {string} userId - User ID
 * @param {Object} [options] - Query options
 * @param {number} [options.limit=50] - Number of activities
 * @param {number} [options.page=1] - Page number
 * @returns {Promise<Object>} User's activities with pagination
 */
export async function getUserActivityHistory(userId, options = {}) {
  const { limit = 50, page = 1 } = options;
  const skip = (page - 1) * limit;

  try {
    const [activities, total] = await Promise.all([
      QueryActivity.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('workspaceId', 'workspaceName')
        .lean(),
      QueryActivity.countDocuments({ userId }),
    ]);

    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + activities.length < total,
      },
    };
  } catch (error) {
    logger.error('Failed to get user activity history', {
      service: 'activity-feed',
      userId: userId?.toString(),
      error: error.message,
    });
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format activity for display
 *
 * @param {Object} activity - Raw activity object
 * @returns {Object} Formatted activity
 */
export function formatActivityForDisplay(activity) {
  const timeAgo = getTimeAgo(activity.createdAt);

  let displayText = '';
  switch (activity.activityType) {
    case ActivityTypes.QUERY:
      displayText = activity.isAnonymous
        ? `Someone asked: "${activity.questionPreview}"`
        : `${activity.userName} asked: "${activity.questionPreview}"`;
      break;
    case ActivityTypes.SYNC_STARTED:
      displayText = `${activity.userName || 'System'} started syncing`;
      break;
    case ActivityTypes.SYNC_COMPLETED:
      displayText = `Sync completed - ${activity.data?.pagesIndexed || 0} pages indexed`;
      break;
    case ActivityTypes.MEMBER_JOINED:
      displayText = `${activity.data?.memberName || 'A new member'} joined the workspace`;
      break;
    case ActivityTypes.MEMBER_LEFT:
      displayText = `${activity.data?.memberName || 'A member'} left the workspace`;
      break;
    case ActivityTypes.DOCUMENT_INDEXED:
      displayText = `Document "${activity.data?.documentTitle || 'Unknown'}" was indexed`;
      break;
    default:
      displayText = `Activity: ${activity.activityType}`;
  }

  return {
    id: activity._id,
    type: activity.activityType,
    displayText,
    timeAgo,
    timestamp: activity.createdAt,
    metrics: activity.metrics,
    isAnonymous: activity.isAnonymous,
  };
}

/**
 * Get human-readable time ago string
 *
 * @param {Date} date - Date to format
 * @returns {string} Time ago string
 */
function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(date).toLocaleDateString();
}

// Export service
export const activityFeedService = {
  ActivityEventTypes,
  ActivityTypes,
  // Logging
  logQueryActivity,
  logSyncActivity,
  logMemberActivity,
  // Retrieval
  getWorkspaceActivity,
  getActivityStats,
  getActiveUsers,
  getTrendingQuestions,
  // Management
  hideActivity,
  getUserActivityHistory,
  // Utilities
  formatActivityForDisplay,
};

export default activityFeedService;
