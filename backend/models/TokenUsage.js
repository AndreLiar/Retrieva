/**
 * Token Usage Model
 * Tracks LLM token consumption per user for cost control
 * @module models/TokenUsage
 */

import mongoose from 'mongoose';
import { guardrailsConfig } from '../config/guardrails.js';

/**
 * @typedef {Object} WorkspaceUsageEntry
 * @property {mongoose.Types.ObjectId} workspaceId - Workspace ID
 * @property {number} tokens - Tokens used in this workspace
 * @property {number} requests - Requests made to this workspace
 */

/**
 * @typedef {Object} LimitInfo
 * @property {number} [tokenLimit] - Token limit for the period
 * @property {number} [percentUsed] - Percentage of limit used
 * @property {boolean} alertSent - Whether alert has been sent
 * @property {Date} [blockedAt] - When user was blocked
 */

/**
 * @typedef {Object} TokenUsageDocument
 * @property {mongoose.Types.ObjectId} _id - Unique identifier
 * @property {mongoose.Types.ObjectId} userId - User ID reference
 * @property {Date} date - Start of tracking period
 * @property {'daily'|'monthly'} period - Time period type
 * @property {number} inputTokens - Input tokens consumed
 * @property {number} outputTokens - Output tokens consumed
 * @property {number} totalTokens - Total tokens consumed
 * @property {number} requestCount - Number of requests
 * @property {number} estimatedCost - Estimated cost in USD
 * @property {LimitInfo} limits - Limit tracking info
 * @property {WorkspaceUsageEntry[]} workspaceUsage - Per-workspace breakdown
 */

/**
 * @typedef {Object} UsageRecordResult
 * @property {boolean} recorded - Whether usage was recorded
 * @property {number} dailyUsage - Total daily tokens used
 * @property {number} dailyLimit - Daily token limit
 * @property {number} percentUsed - Percentage of daily limit used
 * @property {boolean} alertTriggered - Whether alert threshold was crossed
 * @property {number} estimatedCost - Estimated cost so far
 */

/**
 * @typedef {Object} PeriodLimits
 * @property {number} used - Tokens used in period
 * @property {number} limit - Token limit for period
 * @property {number} remaining - Tokens remaining
 * @property {string} percentUsed - Percentage used (1 decimal)
 * @property {boolean} exceeded - Whether limit exceeded
 */

/**
 * @typedef {Object} LimitsCheckResult
 * @property {boolean} allowed - Whether user can make requests
 * @property {PeriodLimits} daily - Daily limit status
 * @property {PeriodLimits} monthly - Monthly limit status
 * @property {string} estimatedDailyCost - Daily cost estimate
 * @property {string} estimatedMonthlyCost - Monthly cost estimate
 */

/**
 * @typedef {Object} UserStats
 * @property {number} totalInputTokens - Total input tokens
 * @property {number} totalOutputTokens - Total output tokens
 * @property {number} totalTokens - Total all tokens
 * @property {number} totalRequests - Total requests made
 * @property {number} totalCost - Total estimated cost
 * @property {number} avgDailyTokens - Average daily token usage
 * @property {number} maxDailyTokens - Maximum daily token usage
 * @property {number} daysActive - Number of active days
 */

/**
 * @typedef {Object} TopUserEntry
 * @property {mongoose.Types.ObjectId} userId - User ID
 * @property {string} email - User email
 * @property {number} totalTokens - Total tokens used
 * @property {number} requestCount - Request count
 * @property {number} estimatedCost - Estimated cost
 * @property {number} percentOfLimit - Percentage of limit used
 */

/**
 * Token Usage Model
 *
 * GUARDRAIL: Track token consumption per user for cost control
 * - Daily and monthly limits
 * - Usage alerts at thresholds
 * - Cost estimation
 */
const tokenUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Time period tracking
    date: {
      type: Date,
      required: true,
      index: true,
    },
    period: {
      type: String,
      enum: ['daily', 'monthly'],
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

    // Request counts
    requestCount: {
      type: Number,
      default: 0,
    },

    // Cost estimation (in USD)
    estimatedCost: {
      type: Number,
      default: 0,
    },

    // Limit tracking
    limits: {
      tokenLimit: Number,
      percentUsed: Number,
      alertSent: {
        type: Boolean,
        default: false,
      },
      blockedAt: Date,
    },

    // Workspace breakdown
    workspaceUsage: [
      {
        workspaceId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'NotionWorkspace',
        },
        tokens: Number,
        requests: Number,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
tokenUsageSchema.index({ userId: 1, date: 1, period: 1 }, { unique: true });
tokenUsageSchema.index({ date: 1, period: 1 });

/**
 * Record token usage for a request
 * Updates both daily and monthly counters
 *
 * @param {mongoose.Types.ObjectId|string} userId - User ID
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @param {mongoose.Types.ObjectId|string|null} [workspaceId=null] - Workspace ID
 * @returns {Promise<UsageRecordResult>} Recording result with alert status
 */
tokenUsageSchema.statics.recordUsage = async function (
  userId,
  inputTokens,
  outputTokens,
  workspaceId = null
) {
  const costConfig = guardrailsConfig.cost;

  const totalTokens = inputTokens + outputTokens;
  const estimatedCost =
    inputTokens * costConfig.pricing.inputTokens + outputTokens * costConfig.pricing.outputTokens;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  // Update daily usage
  const dailyUpdate = {
    $inc: {
      inputTokens,
      outputTokens,
      totalTokens,
      requestCount: 1,
      estimatedCost,
    },
    $setOnInsert: {
      userId,
      date: today,
      period: 'daily',
      'limits.tokenLimit': costConfig.tokenLimits.daily,
    },
  };

  if (workspaceId) {
    dailyUpdate.$push = {
      workspaceUsage: {
        workspaceId,
        tokens: totalTokens,
        requests: 1,
      },
    };
  }

  const dailyUsage = await this.findOneAndUpdate(
    { userId, date: today, period: 'daily' },
    dailyUpdate,
    { upsert: true, new: true }
  );

  // Update monthly usage
  await this.findOneAndUpdate(
    { userId, date: monthStart, period: 'monthly' },
    {
      $inc: {
        inputTokens,
        outputTokens,
        totalTokens,
        requestCount: 1,
        estimatedCost,
      },
      $setOnInsert: {
        userId,
        date: monthStart,
        period: 'monthly',
        'limits.tokenLimit': costConfig.tokenLimits.monthly,
      },
    },
    { upsert: true, new: true }
  );

  // Calculate percentage used and check alerts
  const percentUsed = (dailyUsage.totalTokens / costConfig.tokenLimits.daily) * 100;

  if (percentUsed >= costConfig.tokenLimits.alertThreshold * 100 && !dailyUsage.limits?.alertSent) {
    await this.updateOne(
      { _id: dailyUsage._id },
      {
        $set: {
          'limits.percentUsed': percentUsed,
          'limits.alertSent': true,
        },
      }
    );

    // Return alert flag to caller
    return {
      recorded: true,
      dailyUsage: dailyUsage.totalTokens,
      dailyLimit: costConfig.tokenLimits.daily,
      percentUsed,
      alertTriggered: true,
      estimatedCost: dailyUsage.estimatedCost,
    };
  }

  return {
    recorded: true,
    dailyUsage: dailyUsage.totalTokens,
    dailyLimit: costConfig.tokenLimits.daily,
    percentUsed,
    alertTriggered: false,
    estimatedCost: dailyUsage.estimatedCost,
  };
};

/**
 * Check if user has exceeded their daily or monthly limits
 *
 * @param {mongoose.Types.ObjectId|string} userId - User ID
 * @returns {Promise<LimitsCheckResult>} Limits check result with allowed status
 */
tokenUsageSchema.statics.checkLimits = async function (userId) {
  const costConfig = guardrailsConfig.cost;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [dailyUsage, monthlyUsage] = await Promise.all([
    this.findOne({ userId, date: today, period: 'daily' }),
    this.findOne({ userId, date: monthStart, period: 'monthly' }),
  ]);

  const dailyTokens = dailyUsage?.totalTokens || 0;
  const monthlyTokens = monthlyUsage?.totalTokens || 0;

  const dailyExceeded = dailyTokens >= costConfig.tokenLimits.daily;
  const monthlyExceeded = monthlyTokens >= costConfig.tokenLimits.monthly;

  return {
    allowed: !dailyExceeded && !monthlyExceeded,
    daily: {
      used: dailyTokens,
      limit: costConfig.tokenLimits.daily,
      remaining: Math.max(0, costConfig.tokenLimits.daily - dailyTokens),
      percentUsed: ((dailyTokens / costConfig.tokenLimits.daily) * 100).toFixed(1),
      exceeded: dailyExceeded,
    },
    monthly: {
      used: monthlyTokens,
      limit: costConfig.tokenLimits.monthly,
      remaining: Math.max(0, costConfig.tokenLimits.monthly - monthlyTokens),
      percentUsed: ((monthlyTokens / costConfig.tokenLimits.monthly) * 100).toFixed(1),
      exceeded: monthlyExceeded,
    },
    estimatedDailyCost: dailyUsage?.estimatedCost?.toFixed(4) || '0.0000',
    estimatedMonthlyCost: monthlyUsage?.estimatedCost?.toFixed(4) || '0.0000',
  };
};

/**
 * Get usage statistics for a user over a period
 *
 * @param {mongoose.Types.ObjectId|string} userId - User ID
 * @param {number} [days=30] - Number of days to analyze
 * @returns {Promise<UserStats>} Aggregated usage statistics
 */
tokenUsageSchema.statics.getUserStats = async function (userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        period: 'daily',
        date: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalInputTokens: { $sum: '$inputTokens' },
        totalOutputTokens: { $sum: '$outputTokens' },
        totalTokens: { $sum: '$totalTokens' },
        totalRequests: { $sum: '$requestCount' },
        totalCost: { $sum: '$estimatedCost' },
        avgDailyTokens: { $avg: '$totalTokens' },
        maxDailyTokens: { $max: '$totalTokens' },
        daysActive: { $sum: 1 },
      },
    },
  ]);

  return (
    stats[0] || {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalRequests: 0,
      totalCost: 0,
      avgDailyTokens: 0,
      maxDailyTokens: 0,
      daysActive: 0,
    }
  );
};

/**
 * Get daily usage trends over time
 *
 * @param {mongoose.Types.ObjectId|string} userId - User ID
 * @param {number} [days=7] - Number of days to retrieve
 * @returns {Promise<TokenUsageDocument[]>} Daily usage entries sorted by date
 */
tokenUsageSchema.statics.getUsageTrends = async function (userId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return this.find({
    userId,
    period: 'daily',
    date: { $gte: startDate },
  })
    .sort({ date: 1 })
    .select('date totalTokens requestCount estimatedCost');
};

/**
 * Get top users by token consumption for admin dashboards
 *
 * @param {'daily'|'monthly'} [period='daily'] - Time period to check
 * @param {number} [limit=10] - Maximum users to return
 * @returns {Promise<TopUserEntry[]>} Top users sorted by token usage
 */
tokenUsageSchema.statics.getTopUsers = async function (period = 'daily', limit = 10) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateFilter =
    period === 'monthly' ? new Date(today.getFullYear(), today.getMonth(), 1) : today;

  return this.aggregate([
    {
      $match: {
        period,
        date: dateFilter,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        userId: 1,
        email: '$user.email',
        totalTokens: 1,
        requestCount: 1,
        estimatedCost: 1,
        percentOfLimit: {
          $multiply: [{ $divide: ['$totalTokens', '$limits.tokenLimit'] }, 100],
        },
      },
    },
    { $sort: { totalTokens: -1 } },
    { $limit: limit },
  ]);
};

export const TokenUsage = mongoose.model('TokenUsage', tokenUsageSchema);
