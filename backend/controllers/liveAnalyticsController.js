/**
 * Live Analytics Controller
 *
 * Handles real-time analytics API endpoints:
 * - GET /live/metrics - Current query metrics
 * - GET /live/health - System health status
 * - GET /live/platform - Platform statistics
 * - GET /live/workspace/:workspaceId - Workspace statistics
 * - POST /live/subscribe - Subscribe to real-time updates
 * - POST /live/unsubscribe - Unsubscribe from updates
 *
 * @module controllers/liveAnalyticsController
 */

import { liveAnalyticsService } from '../services/liveAnalyticsService.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import logger from '../config/logger.js';

/**
 * Get current query metrics
 *
 * @route GET /api/v1/analytics/live/metrics
 */
export async function getQueryMetrics(req, res) {
  try {
    const metrics = liveAnalyticsService.getCurrentQueryMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get query metrics', {
      controller: 'live-analytics',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get query metrics',
    });
  }
}

/**
 * Get system health status
 *
 * @route GET /api/v1/analytics/live/health
 */
export async function getSystemHealth(req, res) {
  try {
    const health = await liveAnalyticsService.getSystemHealth();

    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    logger.error('Failed to get system health', {
      controller: 'live-analytics',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get system health',
    });
  }
}

/**
 * Get platform statistics (admin only)
 *
 * @route GET /api/v1/analytics/live/platform
 */
export async function getPlatformStats(req, res) {
  try {
    const stats = await liveAnalyticsService.getPlatformStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get platform stats', {
      controller: 'live-analytics',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get platform statistics',
    });
  }
}

/**
 * Get workspace statistics
 * SECURITY FIX (BOLA): Verify user is owner OR member of workspace
 *
 * @route GET /api/v1/analytics/live/workspace/:workspaceId
 */
export async function getWorkspaceStats(req, res) {
  try {
    const { workspaceId } = req.params;
    const userId = req.user.userId;

    // SECURITY FIX (BOLA): Check workspace membership OR ownership
    const [membership, workspace] = await Promise.all([
      WorkspaceMember.findOne({
        workspaceId,
        userId,
        status: 'active',
      }),
      // Import NotionWorkspace to check ownership
      import('../models/NotionWorkspace.js').then((m) =>
        m.NotionWorkspace.findById(workspaceId).select('userId')
      ),
    ]);

    // Check if user is owner
    const isOwner =
      workspace && workspace.userId && workspace.userId.toString() === userId.toString();

    if (!membership && !isOwner) {
      logger.warn('Unauthorized workspace stats access attempt', {
        controller: 'live-analytics',
        workspaceId,
        requestUserId: userId,
        ownerUserId: workspace?.userId,
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied to this workspace',
      });
    }

    const stats = await liveAnalyticsService.getWorkspaceStats(workspaceId);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get workspace stats', {
      controller: 'live-analytics',
      error: error.message,
      workspaceId: req.params.workspaceId,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get workspace statistics',
    });
  }
}

/**
 * Subscribe to real-time analytics updates
 *
 * @route POST /api/v1/analytics/live/subscribe
 */
export async function subscribeToAnalytics(req, res) {
  try {
    const userId = req.user.userId;

    liveAnalyticsService.subscribeToAnalytics(userId);

    res.json({
      success: true,
      message: 'Subscribed to real-time analytics updates',
      data: {
        userId,
        subscribedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to subscribe to analytics', {
      controller: 'live-analytics',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to subscribe',
    });
  }
}

/**
 * Unsubscribe from real-time analytics updates
 *
 * @route POST /api/v1/analytics/live/unsubscribe
 */
export async function unsubscribeFromAnalytics(req, res) {
  try {
    const userId = req.user.userId;

    liveAnalyticsService.unsubscribeFromAnalytics(userId);

    res.json({
      success: true,
      message: 'Unsubscribed from real-time analytics updates',
    });
  } catch (error) {
    logger.error('Failed to unsubscribe from analytics', {
      controller: 'live-analytics',
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to unsubscribe',
    });
  }
}

export const liveAnalyticsController = {
  getQueryMetrics,
  getSystemHealth,
  getPlatformStats,
  getWorkspaceStats,
  subscribeToAnalytics,
  unsubscribeFromAnalytics,
};

export default liveAnalyticsController;
