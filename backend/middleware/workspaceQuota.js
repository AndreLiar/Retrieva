/**
 * Workspace Quota Middleware
 *
 * SECURITY FIX (API6:2023): Workspace-level quotas to prevent:
 * - Excessive LLM costs per workspace
 * - Resource abuse by individual workspaces
 * - Notion API quota exhaustion
 *
 * @module middleware/workspaceQuota
 */

import { TokenUsage } from '../models/TokenUsage.js';
import { Conversation } from '../models/Conversation.js';
import logger from '../config/logger.js';

/**
 * Default workspace quotas (can be overridden via environment)
 */
const WORKSPACE_QUOTAS = {
  // Daily token limit per workspace (default: 500K tokens)
  dailyTokenLimit: parseInt(process.env.WORKSPACE_DAILY_TOKEN_LIMIT, 10) || 500000,
  // Daily query limit per workspace (default: 1000 queries)
  dailyQueryLimit: parseInt(process.env.WORKSPACE_DAILY_QUERY_LIMIT, 10) || 1000,
  // Monthly token limit per workspace (default: 10M tokens)
  monthlyTokenLimit: parseInt(process.env.WORKSPACE_MONTHLY_TOKEN_LIMIT, 10) || 10000000,
};

/**
 * In-memory cache for workspace usage (refreshed periodically)
 * In production, consider using Redis for multi-instance deployments
 */
const usageCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get workspace usage from cache or database
 * @param {string} workspaceId - Workspace ID
 * @returns {Promise<{dailyTokens: number, dailyQueries: number, monthlyTokens: number}>}
 * @private
 */
async function getWorkspaceUsage(workspaceId) {
  const cacheKey = `workspace:${workspaceId}`;
  const cached = usageCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Aggregate usage across all users in the workspace
  const [dailyUsage, monthlyUsage] = await Promise.all([
    TokenUsage.aggregate([
      {
        $match: {
          date: today,
          period: 'daily',
          'workspaceUsage.workspaceId': workspaceId,
        },
      },
      { $unwind: '$workspaceUsage' },
      { $match: { 'workspaceUsage.workspaceId': workspaceId } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$workspaceUsage.tokens' },
          totalQueries: { $sum: '$workspaceUsage.requests' },
        },
      },
    ]),
    TokenUsage.aggregate([
      {
        $match: {
          date: monthStart,
          period: 'monthly',
          'workspaceUsage.workspaceId': workspaceId,
        },
      },
      { $unwind: '$workspaceUsage' },
      { $match: { 'workspaceUsage.workspaceId': workspaceId } },
      {
        $group: {
          _id: null,
          totalTokens: { $sum: '$workspaceUsage.tokens' },
        },
      },
    ]),
  ]);

  const usage = {
    dailyTokens: dailyUsage[0]?.totalTokens || 0,
    dailyQueries: dailyUsage[0]?.totalQueries || 0,
    monthlyTokens: monthlyUsage[0]?.totalTokens || 0,
  };

  usageCache.set(cacheKey, { data: usage, timestamp: Date.now() });

  return usage;
}

/**
 * Middleware to check workspace quotas before processing RAG requests
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next middleware
 */
export async function checkWorkspaceQuota(req, res, next) {
  const conversationId = req.body?.conversationId;

  if (!conversationId) {
    return next();
  }

  try {
    // Get workspace from conversation
    const conversation = await Conversation.findById(conversationId).lean();

    if (!conversation?.workspaceId || conversation.workspaceId === 'default') {
      return next();
    }

    const workspaceId = conversation.workspaceId;
    const usage = await getWorkspaceUsage(workspaceId);

    // Check daily token limit
    if (usage.dailyTokens >= WORKSPACE_QUOTAS.dailyTokenLimit) {
      logger.warn('Workspace daily token quota exceeded', {
        workspaceId,
        usage: usage.dailyTokens,
        limit: WORKSPACE_QUOTAS.dailyTokenLimit,
        guardrail: 'workspace_quota',
      });

      return res.status(429).json({
        status: 'error',
        message: 'Workspace daily token limit exceeded. Please try again tomorrow.',
        quota: {
          type: 'daily_tokens',
          used: usage.dailyTokens,
          limit: WORKSPACE_QUOTAS.dailyTokenLimit,
          percentUsed: ((usage.dailyTokens / WORKSPACE_QUOTAS.dailyTokenLimit) * 100).toFixed(1),
        },
        guardrail: 'workspace_quota',
      });
    }

    // Check daily query limit
    if (usage.dailyQueries >= WORKSPACE_QUOTAS.dailyQueryLimit) {
      logger.warn('Workspace daily query quota exceeded', {
        workspaceId,
        usage: usage.dailyQueries,
        limit: WORKSPACE_QUOTAS.dailyQueryLimit,
        guardrail: 'workspace_quota',
      });

      return res.status(429).json({
        status: 'error',
        message: 'Workspace daily query limit exceeded. Please try again tomorrow.',
        quota: {
          type: 'daily_queries',
          used: usage.dailyQueries,
          limit: WORKSPACE_QUOTAS.dailyQueryLimit,
          percentUsed: ((usage.dailyQueries / WORKSPACE_QUOTAS.dailyQueryLimit) * 100).toFixed(1),
        },
        guardrail: 'workspace_quota',
      });
    }

    // Check monthly token limit
    if (usage.monthlyTokens >= WORKSPACE_QUOTAS.monthlyTokenLimit) {
      logger.warn('Workspace monthly token quota exceeded', {
        workspaceId,
        usage: usage.monthlyTokens,
        limit: WORKSPACE_QUOTAS.monthlyTokenLimit,
        guardrail: 'workspace_quota',
      });

      return res.status(429).json({
        status: 'error',
        message: 'Workspace monthly token limit exceeded. Please contact support.',
        quota: {
          type: 'monthly_tokens',
          used: usage.monthlyTokens,
          limit: WORKSPACE_QUOTAS.monthlyTokenLimit,
          percentUsed: ((usage.monthlyTokens / WORKSPACE_QUOTAS.monthlyTokenLimit) * 100).toFixed(
            1
          ),
        },
        guardrail: 'workspace_quota',
      });
    }

    // Attach usage info to request for downstream use
    req.workspaceQuota = {
      workspaceId,
      usage,
      limits: WORKSPACE_QUOTAS,
      percentUsed: {
        dailyTokens: ((usage.dailyTokens / WORKSPACE_QUOTAS.dailyTokenLimit) * 100).toFixed(1),
        dailyQueries: ((usage.dailyQueries / WORKSPACE_QUOTAS.dailyQueryLimit) * 100).toFixed(1),
        monthlyTokens: ((usage.monthlyTokens / WORKSPACE_QUOTAS.monthlyTokenLimit) * 100).toFixed(
          1
        ),
      },
    };

    next();
  } catch (error) {
    logger.error('Error checking workspace quota', { error: error.message });
    // Don't block on error, just continue
    next();
  }
}

/**
 * Get current workspace quota configuration
 * @returns {typeof WORKSPACE_QUOTAS}
 */
export function getWorkspaceQuotaConfig() {
  return { ...WORKSPACE_QUOTAS };
}

/**
 * Clear the usage cache (useful for testing or admin operations)
 */
export function clearUsageCache() {
  usageCache.clear();
}
