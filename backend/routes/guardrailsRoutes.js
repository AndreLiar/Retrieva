/**
 * Guardrails Monitoring Routes
 *
 * Admin endpoints for monitoring guardrails, costs, and security
 */

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireWorkspaceOwner } from '../middleware/workspaceAuth.js';
import { getSecurityDashboard, getSecurityEventModel } from '../services/securityLogger.js';
import {
  getCostStats,
  getCurrentCostStatus,
  getHighCostQueries,
} from '../services/costAlerting.js';
import { getAuditLogs, getAuditSummary } from '../middleware/auditTrail.js';
import { getAbuseStats } from '../middleware/abuseDetection.js';
import { TokenUsage } from '../models/TokenUsage.js';
import { AuditLog } from '../models/AuditLog.js';
import { guardrailsConfig } from '../config/guardrails.js';
import { getPIIMaskingConfig } from '../utils/security/piiMasker.js';
import logger from '../config/logger.js';

const router = express.Router();

// All guardrails routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/guardrails/status
 * @desc    Get overall guardrails status and configuration
 * @access  Authenticated
 */
router.get('/status', async (req, res) => {
  try {
    const [costStatus, abuseStats] = await Promise.all([getCurrentCostStatus(), getAbuseStats()]);

    res.json({
      status: 'success',
      data: {
        guardrailsEnabled: true,
        config: {
          input: {
            questionMinLength: guardrailsConfig.input.question.minLength,
            questionMaxLength: guardrailsConfig.input.question.maxLength,
          },
          output: {
            minConfidence: guardrailsConfig.output.minConfidence,
            requireCitation: guardrailsConfig.output.requireCitation,
            piiMaskingEnabled: guardrailsConfig.output.piiMasking.enabled,
          },
          generation: {
            temperature: guardrailsConfig.generation.temperature,
            maxTokens: guardrailsConfig.generation.maxTokens,
            timeout: guardrailsConfig.generation.timeout,
          },
          rateLimits: guardrailsConfig.rateLimits,
        },
        costStatus,
        abuseStats,
      },
    });
  } catch (error) {
    logger.error('Failed to get guardrails status', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve guardrails status',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/security
 * @desc    Get security dashboard
 * @access  Workspace Owner
 */
router.get('/security', requireWorkspaceOwner, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const dashboard = await getSecurityDashboard(hours);

    res.json({
      status: 'success',
      data: dashboard,
    });
  } catch (error) {
    logger.error('Failed to get security dashboard', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve security dashboard',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/security/events
 * @desc    Get security events
 * @access  Workspace Owner
 */
router.get('/security/events', requireWorkspaceOwner, async (req, res) => {
  try {
    const { type, hours = 24, limit = 100 } = req.query;
    const SecurityEvent = getSecurityEventModel();

    const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    const query = { timestamp: { $gte: since } };

    if (type) {
      query.eventType = type;
    }

    const events = await SecurityEvent.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(parseInt(limit) || 100, 500));

    res.json({
      status: 'success',
      data: {
        events,
        count: events.length,
        periodHours: parseInt(hours),
      },
    });
  } catch (error) {
    logger.error('Failed to get security events', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve security events',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/costs
 * @desc    Get cost statistics
 * @access  Workspace Owner
 */
router.get('/costs', requireWorkspaceOwner, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const [stats, currentStatus, highCostQueries] = await Promise.all([
      getCostStats(days),
      getCurrentCostStatus(),
      getHighCostQueries(days, 10),
    ]);

    res.json({
      status: 'success',
      data: {
        statistics: stats,
        currentStatus,
        highCostQueries,
      },
    });
  } catch (error) {
    logger.error('Failed to get cost stats', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve cost statistics',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/tokens
 * @desc    Get token usage for current user
 * @access  Authenticated
 */
router.get('/tokens', async (req, res) => {
  try {
    const userId = req.user.userId;
    const [limits, stats, trends] = await Promise.all([
      TokenUsage.checkLimits(userId),
      TokenUsage.getUserStats(userId, 30),
      TokenUsage.getUsageTrends(userId, 7),
    ]);

    res.json({
      status: 'success',
      data: {
        limits,
        stats,
        trends,
      },
    });
  } catch (error) {
    logger.error('Failed to get token usage', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve token usage',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/tokens/top-users
 * @desc    Get top users by token consumption
 * @access  Workspace Owner
 */
router.get('/tokens/top-users', requireWorkspaceOwner, async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const topUsers = await TokenUsage.getTopUsers(period, limit);

    res.json({
      status: 'success',
      data: {
        period,
        topUsers,
      },
    });
  } catch (error) {
    logger.error('Failed to get top users', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve top users',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/audit
 * @desc    Get audit logs
 * @access  Workspace Owner
 */
router.get('/audit', requireWorkspaceOwner, getAuditLogs);

/**
 * @route   GET /api/v1/guardrails/audit/summary
 * @desc    Get audit summary
 * @access  Workspace Owner
 */
router.get('/audit/summary', requireWorkspaceOwner, getAuditSummary);

/**
 * @route   GET /api/v1/guardrails/audit/export
 * @desc    Export audit logs for compliance
 * @access  Workspace Owner
 */
router.get('/audit/export', requireWorkspaceOwner, async (req, res) => {
  try {
    const { startDate, endDate, workspaceId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'startDate and endDate are required',
      });
    }

    const logs = await AuditLog.exportForCompliance(startDate, endDate, workspaceId);

    res.json({
      status: 'success',
      data: {
        logs,
        count: logs.length,
        exportedAt: new Date(),
        period: { startDate, endDate },
      },
    });
  } catch (error) {
    logger.error('Failed to export audit logs', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to export audit logs',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/config
 * @desc    Get current guardrails configuration
 * @access  Workspace Owner
 */
router.get('/config', requireWorkspaceOwner, async (req, res) => {
  try {
    // Return non-sensitive configuration
    res.json({
      status: 'success',
      data: {
        input: guardrailsConfig.input,
        retrieval: {
          maxQueryVariations: guardrailsConfig.retrieval.maxQueryVariations,
          maxDocuments: guardrailsConfig.retrieval.maxDocuments,
        },
        generation: {
          temperature: guardrailsConfig.generation.temperature,
          maxTokens: guardrailsConfig.generation.maxTokens,
          timeout: guardrailsConfig.generation.timeout,
        },
        output: {
          minConfidence: guardrailsConfig.output.minConfidence,
          requireCitation: guardrailsConfig.output.requireCitation,
          piiMasking: getPIIMaskingConfig(),
        },
        rateLimits: guardrailsConfig.rateLimits,
        cost: {
          tokenLimits: guardrailsConfig.cost.tokenLimits,
          alerts: guardrailsConfig.cost.alerts,
        },
        monitoring: {
          alertThresholds: guardrailsConfig.monitoring.alertThresholds,
          auditTrailEnabled: guardrailsConfig.monitoring.auditTrail.enabled,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get config', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve configuration',
    });
  }
});

/**
 * @route   GET /api/v1/guardrails/quality
 * @desc    Get quality metrics dashboard
 * @access  Workspace Owner
 */
router.get('/quality', requireWorkspaceOwner, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get guardrail trigger statistics from audit logs
    const guardrailStats = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: since },
          'guardrails.triggered.0': { $exists: true },
        },
      },
      { $unwind: '$guardrails.triggered' },
      {
        $group: {
          _id: '$guardrails.triggered',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Get confidence score distribution
    const confidenceStats = await AuditLog.aggregate([
      {
        $match: {
          timestamp: { $gte: since },
          'response.confidence': { $exists: true },
        },
      },
      {
        $bucket: {
          groupBy: '$response.confidence',
          boundaries: [0, 0.3, 0.5, 0.7, 0.9, 1.0],
          default: 'unknown',
          output: {
            count: { $sum: 1 },
            avgLatency: { $avg: '$response.latencyMs' },
          },
        },
      },
    ]);

    // Get error rate
    const errorStats = await AuditLog.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          errors: { $sum: { $cond: [{ $eq: ['$response.success', false] }, 1, 0] } },
          avgLatency: { $avg: '$response.latencyMs' },
          avgConfidence: { $avg: '$response.confidence' },
        },
      },
    ]);

    const stats = errorStats[0] || { total: 0, errors: 0, avgLatency: 0, avgConfidence: 0 };
    const errorRate = stats.total > 0 ? stats.errors / stats.total : 0;

    res.json({
      status: 'success',
      data: {
        periodHours: hours,
        summary: {
          totalRequests: stats.total,
          errorCount: stats.errors,
          errorRate: (errorRate * 100).toFixed(2) + '%',
          avgLatency: Math.round(stats.avgLatency || 0) + 'ms',
          avgConfidence: (stats.avgConfidence || 0).toFixed(2),
        },
        guardrailsTriggered: guardrailStats,
        confidenceDistribution: confidenceStats,
        thresholds: guardrailsConfig.monitoring.alertThresholds,
        alerts: {
          errorRateExceeded: errorRate > guardrailsConfig.monitoring.alertThresholds.errorRate,
          avgConfidenceLow:
            (stats.avgConfidence || 0) < guardrailsConfig.monitoring.alertThresholds.avgConfidence,
        },
      },
    });
  } catch (error) {
    logger.error('Failed to get quality metrics', { error: error.message });
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve quality metrics',
    });
  }
});

export { router as guardrailsRoutes };
