/**
 * Memory System Controller
 *
 * Handles API endpoints for memory monitoring, metrics, and administration
 *
 * @module controllers/memoryController
 */

import { memoryMonitor } from '../services/memory/memoryMonitor.js';
import { memoryDecay, triggerMemoryDecay } from '../services/memory/memoryDecay.js';
import { entityMemory } from '../services/memory/entityMemory.js';
import { memoryDecayQueue } from '../config/queue.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Get memory system dashboard
 * GET /api/v1/memory/dashboard
 */
export const getDashboard = catchAsync(async (req, res) => {
  const dashboard = await memoryMonitor.getDashboard();

  sendSuccess(res, 200, 'Memory dashboard retrieved', dashboard);
});

/**
 * Get cache statistics
 * GET /api/v1/memory/cache
 */
export const getCacheStats = catchAsync(async (req, res) => {
  const cacheType = req.query.type || 'total';
  const stats = await memoryMonitor.getCacheHitRate(cacheType);

  sendSuccess(res, 200, 'Cache statistics retrieved', stats);
});

/**
 * Get memory build statistics
 * GET /api/v1/memory/builds
 */
export const getMemoryBuildStats = catchAsync(async (req, res) => {
  const stats = await memoryMonitor.getMemoryBuildStats();

  sendSuccess(res, 200, 'Memory build statistics retrieved', stats);
});

/**
 * Get decay process statistics
 * GET /api/v1/memory/decay/stats
 *
 * SECURITY FIX (BOLA): Users can only query their own data or workspaces they belong to
 */
export const getDecayStats = catchAsync(async (req, res) => {
  const requestingUserId = req.user?.userId;
  const isAdmin = req.user?.role === 'admin';
  const { userId: queryUserId, workspaceId: queryWorkspaceId } = req.query;

  // SECURITY: Require authentication
  if (!requestingUserId) {
    return sendError(res, 401, 'Authentication required');
  }

  // SECURITY FIX (BOLA): Non-admins can only query their own data
  let effectiveUserId = queryUserId;
  const effectiveWorkspaceId = queryWorkspaceId;

  if (!isAdmin) {
    // If querying a specific user, must be own user
    if (queryUserId && queryUserId.toString() !== requestingUserId.toString()) {
      logger.warn('Unauthorized decay stats query for other user', {
        service: 'memory-controller',
        requestingUserId,
        queryUserId,
      });
      return sendError(res, 403, 'Cannot query decay stats for other users');
    }

    // If querying a workspace, verify membership
    if (queryWorkspaceId) {
      const { WorkspaceMember } = await import('../models/WorkspaceMember.js');
      const membership = await WorkspaceMember.findOne({
        workspaceId: queryWorkspaceId,
        userId: requestingUserId,
        status: 'active',
      });

      if (!membership) {
        logger.warn('Unauthorized decay stats query for workspace', {
          service: 'memory-controller',
          requestingUserId,
          queryWorkspaceId,
        });
        return sendError(res, 403, 'Access denied to this workspace');
      }
    }

    // Default to own user if no params specified
    if (!queryUserId && !queryWorkspaceId) {
      effectiveUserId = requestingUserId;
    }
  }

  const stats = await memoryMonitor.getDecayStats();
  const memoryStats = await memoryDecay.getMemoryStats({
    userId: effectiveUserId,
    workspaceId: effectiveWorkspaceId,
  });

  sendSuccess(res, 200, 'Decay statistics retrieved', {
    ...stats,
    memoryStats,
  });
});

/**
 * Trigger manual memory decay
 * POST /api/v1/memory/decay/trigger
 *
 * SECURITY FIX (API3): Restrict to admin role OR own workspace/user data only
 */
export const triggerDecay = catchAsync(async (req, res) => {
  const { dryRun = false, workspaceId, userId: targetUserId } = req.body;
  const requestingUserId = req.user?.userId;
  const isAdmin = req.user?.role === 'admin';

  // SECURITY: Require authentication
  if (!requestingUserId) {
    return sendError(res, 401, 'Authentication required');
  }

  // SECURITY FIX (API3): Non-admins can only trigger decay for their own data
  if (!isAdmin) {
    // If workspaceId provided, verify membership
    if (workspaceId) {
      const { WorkspaceMember } = await import('../models/WorkspaceMember.js');
      const membership = await WorkspaceMember.findOne({
        workspaceId,
        userId: requestingUserId,
        status: 'active',
      });

      if (!membership) {
        logger.warn('Unauthorized memory decay trigger attempt', {
          service: 'memory-controller',
          requestingUserId,
          targetWorkspaceId: workspaceId,
        });
        return sendError(res, 403, 'Access denied to this workspace');
      }
    }

    // If userId provided, must be own userId
    if (targetUserId && targetUserId.toString() !== requestingUserId.toString()) {
      logger.warn('Unauthorized memory decay trigger attempt for other user', {
        service: 'memory-controller',
        requestingUserId,
        targetUserId,
      });
      return sendError(res, 403, 'Cannot trigger decay for other users');
    }
  }

  // For non-admins without explicit params, default to their own data
  const effectiveWorkspaceId = workspaceId || null;
  const effectiveUserId = isAdmin ? targetUserId : targetUserId || requestingUserId;

  const result = await triggerMemoryDecay({
    dryRun,
    workspaceId: effectiveWorkspaceId,
    userId: effectiveUserId,
  });

  logger.info('Memory decay triggered', {
    service: 'memory-controller',
    requestingUserId,
    targetWorkspaceId: effectiveWorkspaceId,
    targetUserId: effectiveUserId,
    dryRun,
    isAdmin,
  });

  sendSuccess(res, 202, 'Memory decay job queued', result);
});

/**
 * Get decay job status
 * GET /api/v1/memory/decay/jobs
 */
export const getDecayJobs = catchAsync(async (req, res) => {
  const [waiting, active, completed, failed] = await Promise.all([
    memoryDecayQueue.getWaiting(0, 10),
    memoryDecayQueue.getActive(0, 10),
    memoryDecayQueue.getCompleted(0, 10),
    memoryDecayQueue.getFailed(0, 10),
  ]);

  const formatJob = (job) => ({
    id: job.id,
    name: job.name,
    data: job.data,
    timestamp: job.timestamp,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
  });

  sendSuccess(res, 200, 'Decay jobs retrieved', {
    waiting: waiting.map(formatJob),
    active: active.map(formatJob),
    completed: completed.map(formatJob),
    failed: failed.map(formatJob),
    counts: {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
    },
  });
});

/**
 * Get entity memory statistics
 * GET /api/v1/memory/entities
 */
export const getEntityMemoryStats = catchAsync(async (req, res) => {
  const stats = await entityMemory.getStats();

  sendSuccess(res, 200, 'Entity memory statistics retrieved', stats);
});

/**
 * Get database statistics
 * GET /api/v1/memory/database
 */
export const getDatabaseStats = catchAsync(async (req, res) => {
  const stats = await memoryMonitor.getDatabaseStats();

  sendSuccess(res, 200, 'Database statistics retrieved', stats);
});

/**
 * Get hourly metrics
 * GET /api/v1/memory/hourly
 */
export const getHourlyMetrics = catchAsync(async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const metrics = await memoryMonitor.getHourlyMetrics(Math.min(hours, 168)); // Max 1 week

  sendSuccess(res, 200, 'Hourly metrics retrieved', { metrics });
});

/**
 * Get Redis memory usage
 * GET /api/v1/memory/redis
 */
export const getRedisStats = catchAsync(async (req, res) => {
  const stats = await memoryMonitor.getRedisMemoryUsage();

  sendSuccess(res, 200, 'Redis statistics retrieved', stats);
});

/**
 * Clear conversation memory
 * DELETE /api/v1/memory/conversation/:conversationId
 * SECURITY FIX (BOLA): Verify user owns the conversation
 */
export const clearConversationMemory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId;

  // SECURITY: Require authentication
  if (!userId) {
    return sendError(res, 401, 'Authentication required');
  }

  // SECURITY FIX (BOLA): Import Conversation model and verify ownership
  const { Conversation } = await import('../models/Conversation.js');
  const conversation = await Conversation.findById(conversationId);

  if (!conversation) {
    return sendError(res, 404, 'Conversation not found');
  }

  // Verify ownership
  if (conversation.userId !== userId.toString() && conversation.userId !== userId) {
    logger.warn('Unauthorized conversation memory clear attempt', {
      service: 'memory-controller',
      conversationId,
      requestUserId: userId,
      ownerUserId: conversation.userId,
    });
    return sendError(res, 403, 'Access denied to this conversation');
  }

  await entityMemory.clearConversation(conversationId);

  logger.info('Conversation memory cleared', {
    service: 'memory-controller',
    conversationId,
    userId,
  });

  sendSuccess(res, 200, 'Conversation memory cleared', { conversationId });
});

/**
 * Clear all memory caches (admin only)
 * DELETE /api/v1/memory/caches
 */
export const clearAllCaches = catchAsync(async (req, res) => {
  // Only allow admins
  if (req.user?.role !== 'admin') {
    return sendError(res, 403, 'Admin access required');
  }

  const result = await entityMemory.clearAllCaches();

  logger.warn('All memory caches cleared by admin', {
    service: 'memory-controller',
    userId: req.user?.userId,
  });

  sendSuccess(res, 200, 'All memory caches cleared', result);
});

/**
 * Reset all metrics (admin only)
 * DELETE /api/v1/memory/metrics
 */
export const resetMetrics = catchAsync(async (req, res) => {
  // Only allow admins
  if (req.user?.role !== 'admin') {
    return sendError(res, 403, 'Admin access required');
  }

  const result = await memoryMonitor.resetMetrics();

  logger.warn('All memory metrics reset by admin', {
    service: 'memory-controller',
    userId: req.user?.userId,
  });

  sendSuccess(res, 200, 'All metrics reset', result);
});

/**
 * Update decay configuration
 * PATCH /api/v1/memory/decay/config
 */
export const updateDecayConfig = catchAsync(async (req, res) => {
  // Only allow admins
  if (req.user?.role !== 'admin') {
    return sendError(res, 403, 'Admin access required');
  }

  const { conversationMaxAgeDays, messageRetentionDays, entityDecayRate, summaryRetentionDays } =
    req.body;

  const config = {};
  if (conversationMaxAgeDays !== undefined) config.conversationMaxAgeDays = conversationMaxAgeDays;
  if (messageRetentionDays !== undefined) config.messageRetentionDays = messageRetentionDays;
  if (entityDecayRate !== undefined) config.entityDecayRate = entityDecayRate;
  if (summaryRetentionDays !== undefined) config.summaryRetentionDays = summaryRetentionDays;

  memoryDecay.setConfig(config);

  sendSuccess(res, 200, 'Decay configuration updated', {
    config: memoryDecay.config,
  });
});

export default {
  getDashboard,
  getCacheStats,
  getMemoryBuildStats,
  getDecayStats,
  triggerDecay,
  getDecayJobs,
  getEntityMemoryStats,
  getDatabaseStats,
  getHourlyMetrics,
  getRedisStats,
  clearConversationMemory,
  clearAllCaches,
  resetMetrics,
  updateDecayConfig,
};
