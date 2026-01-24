import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { guardrailsConfig } from '../config/guardrails.js';

/**
 * Audit Log Model
 *
 * GUARDRAIL: Comprehensive audit trail for compliance:
 * - Request/response logging
 * - User actions
 * - System events
 * - Data access patterns
 *
 * Follows best practices:
 * - No sensitive data in plain text
 * - Question content hashed for privacy
 * - TTL-based retention
 */
const auditLogSchema = new mongoose.Schema(
  {
    // Request identification
    requestId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
      // No index here - using TTL index below
    },

    // Actor information (who)
    actor: {
      type: {
        type: String,
        enum: ['user', 'system', 'api_key', 'anonymous'],
        required: true,
      },
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
      ipAddress: String,
      // Hashed user agent for fingerprinting
      userAgentHash: String,
      sessionId: String,
    },

    // Action information (what)
    action: {
      type: {
        type: String,
        required: true,
        enum: [
          // RAG actions
          'rag_query',
          'rag_stream',
          // Conversation actions
          'conversation_create',
          'conversation_read',
          'conversation_update',
          'conversation_delete',
          // Workspace actions
          'workspace_connect',
          'workspace_disconnect',
          'workspace_sync',
          'workspace_settings_update',
          // Member actions
          'member_invite',
          'member_remove',
          'member_update',
          // Auth actions
          'auth_login',
          'auth_logout',
          'auth_refresh',
          'auth_password_change',
          // Admin actions
          'admin_user_create',
          'admin_user_update',
          'admin_config_change',
          // Data actions
          'data_export',
          'data_delete',
          'cache_clear',
        ],
        index: true,
      },
      endpoint: String,
      method: String,
    },

    // Target information (on what)
    target: {
      type: {
        type: String,
        enum: ['conversation', 'workspace', 'user', 'document', 'member', 'system'],
      },
      id: String,
      name: String,
    },

    // Request details (sanitized)
    request: {
      // Question content is hashed, not stored in plain text
      questionHash: String,
      questionLength: Number,
      // Filters are logged for debugging
      filters: mongoose.Schema.Types.Mixed,
      // Body fields (excluding sensitive data)
      bodyFields: [String],
    },

    // Response details
    response: {
      statusCode: Number,
      success: Boolean,
      // Answer not stored - only metadata
      answerLength: Number,
      confidence: Number,
      sourcesCount: Number,
      // Processing metrics
      latencyMs: Number,
      tokensUsed: Number,
    },

    // Guardrails triggered
    guardrails: {
      triggered: [String],
      blocked: Boolean,
      warnings: [String],
    },

    // Context
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotionWorkspace',
      index: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true,
    },

    // Compliance metadata
    compliance: {
      // Data classification
      dataClassification: {
        type: String,
        enum: ['public', 'internal', 'confidential', 'restricted'],
        default: 'internal',
      },
      // PII detected?
      piiDetected: Boolean,
      // Geographic region of request
      region: String,
      // Retention category
      retentionCategory: {
        type: String,
        enum: ['standard', 'extended', 'permanent'],
        default: 'standard',
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ 'action.type': 1, timestamp: -1 });
auditLogSchema.index({ workspaceId: 1, timestamp: -1 });
auditLogSchema.index({ 'guardrails.triggered': 1 });

// TTL index based on retention policy
const retentionDays = guardrailsConfig.monitoring.auditTrail.retentionDays;
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Create an audit log entry
 */
auditLogSchema.statics.log = async function (data) {
  // Hash question content for privacy
  if (data.request?.question) {
    data.request.questionHash = createHash('sha256').update(data.request.question).digest('hex');
    data.request.questionLength = data.request.question.length;
    delete data.request.question;
  }

  // Hash user agent
  if (data.actor?.userAgent) {
    data.actor.userAgentHash = createHash('md5').update(data.actor.userAgent).digest('hex');
    delete data.actor.userAgent;
  }

  // Remove sensitive fields from body
  if (data.request?.body) {
    const sensitiveFields = guardrailsConfig.monitoring.auditTrail.sensitiveFields;
    data.request.bodyFields = Object.keys(data.request.body).filter(
      (k) => !sensitiveFields.includes(k)
    );
    delete data.request.body;
  }

  return this.create(data);
};

/**
 * Get audit logs for a user
 */
auditLogSchema.statics.getForUser = async function (userId, options = {}) {
  const { limit = 100, startDate, endDate, actionTypes } = options;

  const query = { 'actor.userId': userId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  if (actionTypes?.length) {
    query['action.type'] = { $in: actionTypes };
  }

  return this.find(query).sort({ timestamp: -1 }).limit(limit).select('-request.questionHash'); // Don't return hash in queries
};

/**
 * Get audit logs for a workspace
 */
auditLogSchema.statics.getForWorkspace = async function (workspaceId, options = {}) {
  const { limit = 100, startDate, endDate } = options;

  const query = { workspaceId };

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  return this.find(query).sort({ timestamp: -1 }).limit(limit);
};

/**
 * Get audit summary statistics
 */
auditLogSchema.statics.getSummary = async function (hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const summary = await this.aggregate([
    { $match: { timestamp: { $gte: since } } },
    {
      $group: {
        _id: '$action.type',
        count: { $sum: 1 },
        avgLatency: { $avg: '$response.latencyMs' },
        errorCount: {
          $sum: { $cond: [{ $eq: ['$response.success', false] }, 1, 0] },
        },
        guardrailsTriggered: {
          $sum: {
            $cond: [{ $gt: [{ $size: { $ifNull: ['$guardrails.triggered', []] } }, 0] }, 1, 0],
          },
        },
      },
    },
    { $sort: { count: -1 } },
  ]);

  return summary;
};

/**
 * Get requests where guardrails were triggered
 */
auditLogSchema.statics.getGuardrailTriggers = async function (hours = 24, guardrailName = null) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const query = {
    timestamp: { $gte: since },
    'guardrails.triggered.0': { $exists: true },
  };

  if (guardrailName) {
    query['guardrails.triggered'] = guardrailName;
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(100)
    .select('requestId timestamp actor.userId action guardrails');
};

/**
 * Export audit logs for compliance
 */
auditLogSchema.statics.exportForCompliance = async function (
  startDate,
  endDate,
  workspaceId = null
) {
  const query = {
    timestamp: {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    },
  };

  if (workspaceId) {
    query.workspaceId = workspaceId;
  }

  return this.find(query).sort({ timestamp: 1 }).lean();
};

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
