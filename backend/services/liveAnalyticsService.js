/**
 * Live Analytics Service
 *
 * Provides real-time analytics for dashboards:
 * - Query metrics (QPM, response times)
 * - User activity (active users, sessions)
 * - System health (sync status, queue depths)
 * - Workspace statistics
 *
 * @module services/liveAnalyticsService
 */

import { emitToUser, emitToWorkspace, broadcast } from './socketService.js';
import { presenceService } from './presenceService.js';
import { getStats as getSocketStats } from './socketService.js';
import { QueryActivity } from '../models/QueryActivity.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { SyncJob } from '../models/SyncJob.js';
import { Conversation } from '../models/Conversation.js';
import { User } from '../models/User.js';
import { notionSyncQueue, documentIndexQueue } from '../config/queue.js';
import logger from '../config/logger.js';

// ============================================================================
// Analytics Event Types
// ============================================================================

export const AnalyticsEventTypes = {
  METRICS_UPDATE: 'analytics:metrics-update',
  QUERY_METRICS: 'analytics:query-metrics',
  SYSTEM_HEALTH: 'analytics:system-health',
  WORKSPACE_STATS: 'analytics:workspace-stats',
  USER_ACTIVITY: 'analytics:user-activity',
};

// ============================================================================
// In-Memory Metrics Store
// ============================================================================

// Rolling window for query metrics (last 60 minutes, per minute)
const queryMetrics = {
  minutelyQueries: new Array(60).fill(0),
  minutelyResponseTimes: new Array(60).fill([]),
  currentMinuteIndex: 0,
  lastRotation: Date.now(),
  totalQueries: 0,
  totalResponseTime: 0,
};

// Track active analytics subscribers
const analyticsSubscribers = new Set();

// ============================================================================
// Metric Recording
// ============================================================================

/**
 * Record a query for analytics
 *
 * @param {Object} queryData - Query data
 * @param {string} queryData.workspaceId - Workspace ID
 * @param {number} queryData.responseTimeMs - Response time in ms
 * @param {number} queryData.sourcesCount - Number of sources used
 * @param {number} queryData.confidence - Confidence score
 */
export function recordQuery(queryData) {
  rotateMinuteIfNeeded();

  const idx = queryMetrics.currentMinuteIndex;
  queryMetrics.minutelyQueries[idx]++;
  queryMetrics.minutelyResponseTimes[idx].push(queryData.responseTimeMs || 0);
  queryMetrics.totalQueries++;
  queryMetrics.totalResponseTime += queryData.responseTimeMs || 0;

  // Broadcast to subscribers
  if (analyticsSubscribers.size > 0) {
    const currentMetrics = getCurrentQueryMetrics();
    for (const userId of analyticsSubscribers) {
      emitToUser(userId, AnalyticsEventTypes.QUERY_METRICS, currentMetrics, false);
    }
  }
}

/**
 * Rotate to next minute bucket if needed
 */
function rotateMinuteIfNeeded() {
  const now = Date.now();
  const minutesSinceRotation = Math.floor((now - queryMetrics.lastRotation) / 60000);

  if (minutesSinceRotation >= 1) {
    // Advance by the number of minutes that passed
    for (let i = 0; i < minutesSinceRotation && i < 60; i++) {
      queryMetrics.currentMinuteIndex = (queryMetrics.currentMinuteIndex + 1) % 60;
      queryMetrics.minutelyQueries[queryMetrics.currentMinuteIndex] = 0;
      queryMetrics.minutelyResponseTimes[queryMetrics.currentMinuteIndex] = [];
    }
    queryMetrics.lastRotation = now;
  }
}

// ============================================================================
// Metric Retrieval
// ============================================================================

/**
 * Get current query metrics
 *
 * @returns {Object} Query metrics
 */
export function getCurrentQueryMetrics() {
  rotateMinuteIfNeeded();

  // Calculate queries per minute (average over last 5 minutes)
  let last5MinQueries = 0;
  const last5MinResponseTimes = [];
  for (let i = 0; i < 5; i++) {
    const idx = (queryMetrics.currentMinuteIndex - i + 60) % 60;
    last5MinQueries += queryMetrics.minutelyQueries[idx];
    last5MinResponseTimes.push(...queryMetrics.minutelyResponseTimes[idx]);
  }

  const avgResponseTime =
    last5MinResponseTimes.length > 0
      ? Math.round(last5MinResponseTimes.reduce((a, b) => a + b, 0) / last5MinResponseTimes.length)
      : 0;

  // Calculate total queries in last hour
  const lastHourQueries = queryMetrics.minutelyQueries.reduce((a, b) => a + b, 0);

  return {
    queriesPerMinute: Math.round((last5MinQueries / 5) * 10) / 10,
    queriesLastHour: lastHourQueries,
    averageResponseTimeMs: avgResponseTime,
    totalQueries: queryMetrics.totalQueries,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get system health metrics
 *
 * @returns {Promise<Object>} System health data
 */
export async function getSystemHealth() {
  try {
    // Get queue stats
    let syncQueueStats = { waiting: 0, active: 0 };
    let indexQueueStats = { waiting: 0, active: 0 };

    try {
      const [syncWaiting, syncActive, indexWaiting, indexActive] = await Promise.all([
        notionSyncQueue.getWaitingCount(),
        notionSyncQueue.getActiveCount(),
        documentIndexQueue.getWaitingCount(),
        documentIndexQueue.getActiveCount(),
      ]);

      syncQueueStats = { waiting: syncWaiting, active: syncActive };
      indexQueueStats = { waiting: indexWaiting, active: indexActive };
    } catch (queueError) {
      logger.warn('Failed to get queue stats', { error: queueError.message });
    }

    // Get socket stats
    const socketStats = getSocketStats();

    // Get presence stats
    const presenceStats = presenceService.getPresenceStats();

    // Get active sync jobs
    const activeSyncs = await SyncJob.countDocuments({ status: 'processing' });

    // Get workspaces with errors
    const errorWorkspaces = await NotionWorkspace.countDocuments({ syncStatus: 'error' });

    return {
      status: errorWorkspaces > 0 ? 'degraded' : 'healthy',
      queues: {
        sync: syncQueueStats,
        index: indexQueueStats,
      },
      connections: {
        websocket: socketStats.totalConnections,
        uniqueUsers: socketStats.uniqueUsers,
      },
      presence: presenceStats,
      syncs: {
        active: activeSyncs,
        errorWorkspaces,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Failed to get system health', { error: error.message });
    return {
      status: 'unknown',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Get workspace statistics
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<Object>} Workspace stats
 */
export async function getWorkspaceStats(workspaceId) {
  try {
    const workspace = await NotionWorkspace.findOne({ workspaceId });
    if (!workspace) {
      return null;
    }

    // Get activity stats for last 24h
    const activityStats = await QueryActivity.getActivityStats(workspace._id, '24h');

    // Get active users
    const activeUsers = await QueryActivity.getActiveUsers(workspace._id, '24h');

    // Get sync job status
    const lastSync = await SyncJob.findOne({ workspaceId }).sort({ createdAt: -1 }).lean();

    // Get online presence
    const presence = presenceService.getWorkspacePresence(workspaceId);

    return {
      workspaceId,
      workspaceName: workspace.workspaceName,
      syncStatus: workspace.syncStatus,
      lastSyncAt: workspace.lastSuccessfulSyncAt,
      documents: {
        total: workspace.stats?.totalDocuments || 0,
        pages: workspace.stats?.totalPages || 0,
        databases: workspace.stats?.totalDatabases || 0,
      },
      activity: {
        queriesLast24h: activityStats.totals?.queries || 0,
        activitiesLast24h: activityStats.totals?.activities || 0,
        avgResponseTime: activityStats.byType?.query?.avgResponseTime || null,
      },
      users: {
        active24h: activeUsers.length,
        onlineNow: presence.onlineCount,
      },
      lastSync: lastSync
        ? {
            status: lastSync.status,
            completedAt: lastSync.completedAt,
            documentsProcessed: lastSync.progress?.processedDocuments,
          }
        : null,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Failed to get workspace stats', {
      error: error.message,
      workspaceId,
    });
    throw error;
  }
}

/**
 * Get global platform statistics
 *
 * @returns {Promise<Object>} Platform stats
 */
export async function getPlatformStats() {
  try {
    const [totalUsers, activeUsers, totalWorkspaces, activeWorkspaces, totalConversations] =
      await Promise.all([
        User.countDocuments(),
        User.countDocuments({
          lastLoginAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
        NotionWorkspace.countDocuments(),
        NotionWorkspace.countDocuments({ syncStatus: 'active' }),
        Conversation.countDocuments(),
      ]);

    const queryMetrics = getCurrentQueryMetrics();
    const systemHealth = await getSystemHealth();

    return {
      users: {
        total: totalUsers,
        activeLastWeek: activeUsers,
        onlineNow: systemHealth.presence?.totalOnline || 0,
      },
      workspaces: {
        total: totalWorkspaces,
        active: activeWorkspaces,
      },
      conversations: {
        total: totalConversations,
      },
      queries: queryMetrics,
      health: systemHealth,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Failed to get platform stats', { error: error.message });
    throw error;
  }
}

// ============================================================================
// Real-time Analytics Broadcasting
// ============================================================================

/**
 * Subscribe user to analytics updates
 *
 * @param {string} userId - User ID
 */
export function subscribeToAnalytics(userId) {
  analyticsSubscribers.add(userId);
  logger.debug('User subscribed to analytics', { userId });
}

/**
 * Unsubscribe user from analytics updates
 *
 * @param {string} userId - User ID
 */
export function unsubscribeFromAnalytics(userId) {
  analyticsSubscribers.delete(userId);
  logger.debug('User unsubscribed from analytics', { userId });
}

/**
 * Broadcast analytics update to all subscribers
 */
export async function broadcastAnalyticsUpdate() {
  if (analyticsSubscribers.size === 0) return;

  try {
    const [queryMetrics, systemHealth] = await Promise.all([
      getCurrentQueryMetrics(),
      getSystemHealth(),
    ]);

    const update = {
      queries: queryMetrics,
      health: systemHealth,
      timestamp: new Date().toISOString(),
    };

    for (const userId of analyticsSubscribers) {
      emitToUser(userId, AnalyticsEventTypes.METRICS_UPDATE, update, false);
    }
  } catch (error) {
    logger.error('Failed to broadcast analytics update', { error: error.message });
  }
}

// Broadcast analytics every 10 seconds
setInterval(broadcastAnalyticsUpdate, 10000);

// ============================================================================
// Workspace Analytics Broadcasting
// ============================================================================

/**
 * Broadcast workspace stats update
 *
 * @param {string} workspaceId - Workspace ID
 */
export async function broadcastWorkspaceStats(workspaceId) {
  try {
    const stats = await getWorkspaceStats(workspaceId);
    if (stats) {
      emitToWorkspace(workspaceId, AnalyticsEventTypes.WORKSPACE_STATS, stats);
    }
  } catch (error) {
    logger.error('Failed to broadcast workspace stats', {
      error: error.message,
      workspaceId,
    });
  }
}

// Export service
export const liveAnalyticsService = {
  AnalyticsEventTypes,
  // Recording
  recordQuery,
  // Retrieval
  getCurrentQueryMetrics,
  getSystemHealth,
  getWorkspaceStats,
  getPlatformStats,
  // Subscriptions
  subscribeToAnalytics,
  unsubscribeFromAnalytics,
  broadcastAnalyticsUpdate,
  broadcastWorkspaceStats,
};

export default liveAnalyticsService;
