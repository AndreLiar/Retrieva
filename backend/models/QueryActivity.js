/**
 * Query Activity Model
 *
 * Tracks query activity within workspaces for activity feeds
 * Supports:
 * - Recent queries display
 * - Anonymization options
 * - Real-time activity streaming
 * - Usage analytics
 *
 * @module models/QueryActivity
 */

import mongoose from 'mongoose';
import { createEncryptionPlugin } from '../utils/security/fieldEncryption.js';

/**
 * Activity Types
 */
export const ActivityTypes = {
  QUERY: 'query',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  DOCUMENT_INDEXED: 'document_indexed',
};

const queryActivitySchema = new mongoose.Schema(
  {
    // Workspace this activity belongs to
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotionWorkspace',
      required: true,
      index: true,
    },

    // User who performed the activity
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Type of activity
    activityType: {
      type: String,
      enum: Object.values(ActivityTypes),
      required: true,
      index: true,
    },

    // For queries: the question asked (can be anonymized)
    question: {
      type: String,
      maxlength: 500,
    },

    // Truncated/preview version of the question
    questionPreview: {
      type: String,
      maxlength: 100,
    },

    // For queries: conversation ID
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
    },

    // Response metrics
    metrics: {
      responseTimeMs: Number,
      sourcesCount: Number,
      confidence: Number,
      tokensUsed: Number,
    },

    // Additional context data
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Privacy settings
    isAnonymous: {
      type: Boolean,
      default: false,
    },

    // Whether user opted to hide this activity
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
queryActivitySchema.index({ workspaceId: 1, createdAt: -1 });
queryActivitySchema.index({ workspaceId: 1, activityType: 1, createdAt: -1 });
queryActivitySchema.index({ userId: 1, createdAt: -1 });

// TTL index - auto-delete activities older than 30 days
queryActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// ============================================================================
// Pre-save Middleware
// ============================================================================

queryActivitySchema.pre('save', function (next) {
  // Generate question preview if question exists
  if (this.question && !this.questionPreview) {
    this.questionPreview =
      this.question.length > 80 ? this.question.substring(0, 77) + '...' : this.question;
  }
  next();
});

// ============================================================================
// Static Methods
// ============================================================================

/**
 * Log a query activity
 */
queryActivitySchema.statics.logQuery = async function ({
  workspaceId,
  userId,
  question,
  conversationId,
  metrics = {},
  isAnonymous = false,
}) {
  return this.create({
    workspaceId,
    userId,
    activityType: ActivityTypes.QUERY,
    question,
    conversationId,
    metrics,
    isAnonymous,
  });
};

/**
 * Log a generic activity
 */
queryActivitySchema.statics.logActivity = async function ({
  workspaceId,
  userId,
  activityType,
  data = {},
}) {
  return this.create({
    workspaceId,
    userId,
    activityType,
    data,
  });
};

/**
 * Get recent activity for a workspace
 */
queryActivitySchema.statics.getWorkspaceActivity = async function (workspaceId, options = {}) {
  const { limit = 20, page = 1, activityType = null, includeHidden = false } = options;

  const skip = (page - 1) * limit;

  const query = { workspaceId };
  if (activityType) query.activityType = activityType;
  if (!includeHidden) query.isHidden = false;

  const [activities, total] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    this.countDocuments(query),
  ]);

  // Apply anonymization
  const formattedActivities = activities.map((activity) => {
    if (activity.isAnonymous) {
      return {
        ...activity,
        userId: null,
        userName: 'Anonymous',
        userEmail: null,
      };
    }
    return {
      ...activity,
      userName: activity.userId?.name || 'Unknown',
      userEmail: activity.userId?.email,
      userId: activity.userId?._id,
    };
  });

  return {
    activities: formattedActivities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + activities.length < total,
    },
  };
};

/**
 * Get activity count by type for a workspace
 */
queryActivitySchema.statics.getActivityStats = async function (workspaceId, timeRange = '24h') {
  const timeMap = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };

  const since = new Date(Date.now() - (timeMap[timeRange] || timeMap['24h']));

  const stats = await this.aggregate([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$activityType',
        count: { $sum: 1 },
        avgResponseTime: { $avg: '$metrics.responseTimeMs' },
        avgConfidence: { $avg: '$metrics.confidence' },
      },
    },
  ]);

  const result = {
    timeRange,
    since,
    byType: {},
    totals: { activities: 0, queries: 0 },
  };

  stats.forEach((stat) => {
    result.byType[stat._id] = {
      count: stat.count,
      avgResponseTime: stat.avgResponseTime ? Math.round(stat.avgResponseTime) : null,
      avgConfidence: stat.avgConfidence ? Math.round(stat.avgConfidence * 100) / 100 : null,
    };
    result.totals.activities += stat.count;
    if (stat._id === ActivityTypes.QUERY) {
      result.totals.queries = stat.count;
    }
  });

  return result;
};

/**
 * Get unique active users in a workspace
 */
queryActivitySchema.statics.getActiveUsers = async function (workspaceId, timeRange = '24h') {
  const timeMap = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  };

  const since = new Date(Date.now() - (timeMap[timeRange] || timeMap['24h']));

  const users = await this.aggregate([
    {
      $match: {
        workspaceId: new mongoose.Types.ObjectId(workspaceId),
        createdAt: { $gte: since },
        activityType: ActivityTypes.QUERY,
      },
    },
    {
      $group: {
        _id: '$userId',
        queryCount: { $sum: 1 },
        lastActivity: { $max: '$createdAt' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
      },
    },
    {
      $unwind: '$user',
    },
    {
      $project: {
        userId: '$_id',
        name: '$user.name',
        email: '$user.email',
        queryCount: 1,
        lastActivity: 1,
      },
    },
    {
      $sort: { lastActivity: -1 },
    },
  ]);

  return users;
};

/**
 * Get trending questions in a workspace
 */
queryActivitySchema.statics.getTrendingQuestions = async function (workspaceId, limit = 10) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

  // Get recent questions grouped by similarity (simple word matching)
  const questions = await this.find({
    workspaceId,
    activityType: ActivityTypes.QUERY,
    createdAt: { $gte: since },
    isHidden: false,
  })
    .select('questionPreview metrics.confidence')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  // Return unique questions with highest confidence
  const seen = new Set();
  const trending = [];

  for (const q of questions) {
    const normalized = q.questionPreview?.toLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      trending.push({
        question: q.questionPreview,
        confidence: q.metrics?.confidence,
      });
      if (trending.length >= limit) break;
    }
  }

  return trending;
};

// Apply field-level encryption to sensitive query data
// Questions are encrypted at rest and automatically decrypted on read
queryActivitySchema.plugin(createEncryptionPlugin(['question', 'questionPreview']));

export const QueryActivity = mongoose.model('QueryActivity', queryActivitySchema);
