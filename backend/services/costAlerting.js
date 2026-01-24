/**
 * Cost Alerting Service
 *
 * GUARDRAIL: Monitor and alert on LLM usage costs:
 * - Daily cost tracking
 * - Hourly burst detection
 * - User-level cost monitoring
 * - Threshold-based alerting
 */

import mongoose from 'mongoose';
import logger from '../config/logger.js';
import { guardrailsConfig } from '../config/guardrails.js';
import { logSecurityEvent } from './securityLogger.js';

// Cost tracking state (consider Redis for production)
const costTracking = {
  hourly: new Map(), // hour -> totalCost
  daily: new Map(), // date -> totalCost
  alerts: {
    hourlyAlertSent: false,
    dailyAlertSent: false,
    lastHourlyReset: Date.now(),
    lastDailyReset: Date.now(),
  },
};

/**
 * Cost Record Schema
 */
const costRecordSchema = new mongoose.Schema(
  {
    // Time period
    date: {
      type: Date,
      required: true,
      index: true,
    },
    period: {
      type: String,
      enum: ['hourly', 'daily', 'monthly'],
      required: true,
    },

    // Token counts
    inputTokens: {
      type: Number,
      default: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },

    // Cost in USD
    estimatedCost: {
      type: Number,
      default: 0,
    },

    // Request breakdown
    requestCount: {
      type: Number,
      default: 0,
    },
    streamingRequests: {
      type: Number,
      default: 0,
    },

    // User breakdown (top users)
    topUsers: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        tokens: Number,
        cost: Number,
        requests: Number,
      },
    ],

    // Alert tracking
    alertsSent: [
      {
        threshold: String,
        sentAt: Date,
        cost: Number,
      },
    ],

    // High-cost queries
    highCostQueries: [
      {
        requestId: String,
        tokens: Number,
        cost: Number,
        timestamp: Date,
      },
    ],
  },
  {
    timestamps: true,
  }
);

costRecordSchema.index({ date: 1, period: 1 }, { unique: true });

const CostRecord = mongoose.model('CostRecord', costRecordSchema);

/**
 * Record cost for a query
 */
export async function recordCost(
  inputTokens,
  outputTokens,
  userId,
  requestId,
  isStreaming = false
) {
  const costConfig = guardrailsConfig.cost;
  const pricing = costConfig.pricing;

  const cost = inputTokens * pricing.inputTokens + outputTokens * pricing.outputTokens;

  const now = new Date();
  const hourKey = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const dayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Update in-memory tracking
  updateInMemoryTracking(cost, hourKey, dayKey);

  // Check thresholds
  const alerts = await checkCostThresholds(cost, requestId);

  // Record to database
  try {
    // Hourly record
    await CostRecord.findOneAndUpdate(
      { date: hourKey, period: 'hourly' },
      {
        $inc: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: cost,
          requestCount: 1,
          streamingRequests: isStreaming ? 1 : 0,
        },
        $setOnInsert: {
          date: hourKey,
          period: 'hourly',
        },
      },
      { upsert: true }
    );

    // Daily record
    await CostRecord.findOneAndUpdate(
      { date: dayKey, period: 'daily' },
      {
        $inc: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          estimatedCost: cost,
          requestCount: 1,
          streamingRequests: isStreaming ? 1 : 0,
        },
        $setOnInsert: {
          date: dayKey,
          period: 'daily',
        },
      },
      { upsert: true }
    );

    // Track high-cost queries
    if (cost > costConfig.alerts.singleQueryLimit) {
      await CostRecord.updateOne(
        { date: dayKey, period: 'daily' },
        {
          $push: {
            highCostQueries: {
              $each: [
                {
                  requestId,
                  tokens: inputTokens + outputTokens,
                  cost,
                  timestamp: now,
                },
              ],
              $slice: -100, // Keep last 100
            },
          },
        }
      );

      logger.warn('High-cost query detected', {
        service: 'cost-alerting',
        requestId,
        cost: cost.toFixed(4),
        threshold: costConfig.alerts.singleQueryLimit,
        tokens: inputTokens + outputTokens,
      });

      await logSecurityEvent('guardrail_triggered', {
        guardrail: 'high_cost_query',
        cost,
        tokens: inputTokens + outputTokens,
        requestId,
      });
    }
  } catch (error) {
    logger.error('Failed to record cost', {
      service: 'cost-alerting',
      error: error.message,
    });
  }

  return {
    cost,
    alerts,
    tokens: inputTokens + outputTokens,
  };
}

/**
 * Update in-memory tracking
 */
function updateInMemoryTracking(cost, hourKey, dayKey) {
  const hourKeyStr = hourKey.toISOString();
  const dayKeyStr = dayKey.toISOString();

  // Reset if new hour
  if (Date.now() - costTracking.alerts.lastHourlyReset > 3600000) {
    costTracking.hourly.clear();
    costTracking.alerts.hourlyAlertSent = false;
    costTracking.alerts.lastHourlyReset = Date.now();
  }

  // Reset if new day
  if (Date.now() - costTracking.alerts.lastDailyReset > 86400000) {
    costTracking.daily.clear();
    costTracking.alerts.dailyAlertSent = false;
    costTracking.alerts.lastDailyReset = Date.now();
  }

  // Update tracking
  costTracking.hourly.set(hourKeyStr, (costTracking.hourly.get(hourKeyStr) || 0) + cost);
  costTracking.daily.set(dayKeyStr, (costTracking.daily.get(dayKeyStr) || 0) + cost);
}

/**
 * Check cost thresholds and send alerts
 */
async function checkCostThresholds(latestCost, requestId) {
  const costConfig = guardrailsConfig.cost;
  const alerts = [];

  const now = new Date();
  const hourKey = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  ).toISOString();
  const dayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const hourlyCost = costTracking.hourly.get(hourKey) || 0;
  const dailyCost = costTracking.daily.get(dayKey) || 0;

  // Check hourly limit
  if (hourlyCost >= costConfig.alerts.hourlyCostLimit && !costTracking.alerts.hourlyAlertSent) {
    costTracking.alerts.hourlyAlertSent = true;
    alerts.push({
      type: 'hourly_limit',
      cost: hourlyCost,
      limit: costConfig.alerts.hourlyCostLimit,
    });

    logger.error('COST ALERT: Hourly limit exceeded', {
      service: 'cost-alerting',
      hourlyCost: hourlyCost.toFixed(2),
      limit: costConfig.alerts.hourlyCostLimit,
    });

    await logSecurityEvent(
      'guardrail_triggered',
      {
        guardrail: 'hourly_cost_limit',
        cost: hourlyCost,
        limit: costConfig.alerts.hourlyCostLimit,
      },
      { severity: 'high' }
    );

    await sendCostAlert('hourly', hourlyCost, costConfig.alerts.hourlyCostLimit);
  }

  // Check daily limit
  if (dailyCost >= costConfig.alerts.dailyCostLimit && !costTracking.alerts.dailyAlertSent) {
    costTracking.alerts.dailyAlertSent = true;
    alerts.push({
      type: 'daily_limit',
      cost: dailyCost,
      limit: costConfig.alerts.dailyCostLimit,
    });

    logger.error('COST ALERT: Daily limit exceeded', {
      service: 'cost-alerting',
      dailyCost: dailyCost.toFixed(2),
      limit: costConfig.alerts.dailyCostLimit,
    });

    await logSecurityEvent(
      'guardrail_triggered',
      {
        guardrail: 'daily_cost_limit',
        cost: dailyCost,
        limit: costConfig.alerts.dailyCostLimit,
      },
      { severity: 'critical' }
    );

    await sendCostAlert('daily', dailyCost, costConfig.alerts.dailyCostLimit);
  }

  // Check single query limit
  if (latestCost >= costConfig.alerts.singleQueryLimit) {
    alerts.push({
      type: 'single_query',
      cost: latestCost,
      limit: costConfig.alerts.singleQueryLimit,
      requestId,
    });
  }

  return alerts;
}

/**
 * Send cost alert
 */
async function sendCostAlert(period, cost, limit) {
  // Record alert in database
  const now = new Date();
  const periodKey =
    period === 'hourly'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());

  await CostRecord.updateOne(
    { date: periodKey, period },
    {
      $push: {
        alertsSent: {
          threshold: `${period}_limit`,
          sentAt: now,
          cost,
        },
      },
    }
  );

  // TODO: Implement actual alerting (email, Slack, PagerDuty)
  logger.warn(`Cost alert (${period}): $${cost.toFixed(2)} exceeded limit of $${limit}`, {
    service: 'cost-alerting',
    period,
    cost,
    limit,
  });
}

/**
 * Get cost statistics
 */
export async function getCostStats(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const dailyStats = await CostRecord.find({
    period: 'daily',
    date: { $gte: startDate },
  })
    .sort({ date: 1 })
    .select('date totalTokens estimatedCost requestCount');

  const totalCost = dailyStats.reduce((sum, d) => sum + d.estimatedCost, 0);
  const totalTokens = dailyStats.reduce((sum, d) => sum + d.totalTokens, 0);
  const totalRequests = dailyStats.reduce((sum, d) => sum + d.requestCount, 0);

  return {
    period: `${days} days`,
    totalCost: totalCost.toFixed(4),
    totalTokens,
    totalRequests,
    avgDailyCost: (totalCost / days).toFixed(4),
    avgDailyTokens: Math.round(totalTokens / days),
    dailyBreakdown: dailyStats.map((d) => ({
      date: d.date,
      cost: d.estimatedCost.toFixed(4),
      tokens: d.totalTokens,
      requests: d.requestCount,
    })),
  };
}

/**
 * Get current cost status
 */
export function getCurrentCostStatus() {
  const costConfig = guardrailsConfig.cost;
  const now = new Date();
  const hourKey = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    now.getHours()
  ).toISOString();
  const dayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const hourlyCost = costTracking.hourly.get(hourKey) || 0;
  const dailyCost = costTracking.daily.get(dayKey) || 0;

  return {
    hourly: {
      current: hourlyCost.toFixed(4),
      limit: costConfig.alerts.hourlyCostLimit,
      percentUsed: ((hourlyCost / costConfig.alerts.hourlyCostLimit) * 100).toFixed(1),
      alertSent: costTracking.alerts.hourlyAlertSent,
    },
    daily: {
      current: dailyCost.toFixed(4),
      limit: costConfig.alerts.dailyCostLimit,
      percentUsed: ((dailyCost / costConfig.alerts.dailyCostLimit) * 100).toFixed(1),
      alertSent: costTracking.alerts.dailyAlertSent,
    },
    limits: {
      singleQueryLimit: costConfig.alerts.singleQueryLimit,
      tokenLimitDaily: costConfig.tokenLimits.daily,
      tokenLimitMonthly: costConfig.tokenLimits.monthly,
    },
  };
}

/**
 * Get high-cost queries for analysis
 */
export async function getHighCostQueries(days = 7, limit = 20) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const records = await CostRecord.find({
    period: 'daily',
    date: { $gte: startDate },
    'highCostQueries.0': { $exists: true },
  })
    .select('date highCostQueries')
    .sort({ date: -1 });

  // Flatten and sort all high-cost queries
  const allQueries = records.flatMap((r) =>
    r.highCostQueries.map((q) => ({
      ...q.toObject(),
      date: r.date,
    }))
  );

  return allQueries.sort((a, b) => b.cost - a.cost).slice(0, limit);
}

export { CostRecord };
