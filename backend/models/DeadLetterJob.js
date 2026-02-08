import mongoose from 'mongoose';

/**
 * Dead Letter Job Schema
 *
 * Stores jobs that have failed all retry attempts for investigation and manual retry.
 * This provides visibility into system failures and allows operators to:
 * - Monitor failure patterns
 * - Investigate error details
 * - Manually retry or dismiss failed jobs
 *
 * @module models/DeadLetterJob
 */
const deadLetterJobSchema = new mongoose.Schema(
  {
    // Job identification
    originalJobId: {
      type: String,
      required: true,
      index: true,
    },
    queueName: {
      type: String,
      required: true,
      index: true,
    },
    jobName: {
      type: String,
      index: true,
    },

    // Job data (what was being processed)
    jobData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Error information
    error: {
      message: {
        type: String,
        required: true,
      },
      stack: String,
      code: String,
    },

    // Attempt tracking
    attemptsMade: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    failedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Context for debugging
    workspaceId: {
      type: String,
      index: true,
    },
    sourceId: {
      type: String,
      index: true,
    },

    // DLQ status
    status: {
      type: String,
      enum: ['pending', 'retrying', 'resolved', 'dismissed'],
      default: 'pending',
      index: true,
    },

    // Manual intervention tracking
    resolvedAt: Date,
    resolvedBy: String,
    resolution: {
      type: String,
      enum: ['retried_success', 'retried_failed', 'manually_fixed', 'dismissed', 'expired'],
    },
    resolutionNotes: String,

    // Retry tracking
    retryCount: {
      type: Number,
      default: 0,
    },
    lastRetryAt: Date,
    lastRetryError: String,

    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'dead_letter_jobs',
  }
);

// Compound indexes for efficient queries
deadLetterJobSchema.index({ queueName: 1, status: 1 });
deadLetterJobSchema.index({ workspaceId: 1, status: 1 });
deadLetterJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // Auto-expire after 30 days

/**
 * Find pending DLQ entries for a queue
 */
deadLetterJobSchema.statics.findPending = function (queueName = null) {
  const query = { status: 'pending' };
  if (queueName) {
    query.queueName = queueName;
  }
  return this.find(query).sort({ failedAt: -1 });
};

/**
 * Get DLQ statistics
 */
deadLetterJobSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: { queueName: '$queueName', status: '$status' },
        count: { $sum: 1 },
      },
    },
  ]);

  // Transform to readable format
  const result = {
    total: 0,
    byQueue: {},
    byStatus: {},
  };

  for (const stat of stats) {
    const queueName = stat._id.queueName;
    const status = stat._id.status;
    const count = stat.count;

    result.total += count;

    if (!result.byQueue[queueName]) {
      result.byQueue[queueName] = { total: 0 };
    }
    result.byQueue[queueName][status] = count;
    result.byQueue[queueName].total += count;

    if (!result.byStatus[status]) {
      result.byStatus[status] = 0;
    }
    result.byStatus[status] += count;
  }

  return result;
};

/**
 * Mark a job as resolved
 */
deadLetterJobSchema.methods.resolve = async function (resolution, resolvedBy, notes = null) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  this.resolution = resolution;
  if (notes) {
    this.resolutionNotes = notes;
  }
  return this.save();
};

/**
 * Mark a job as dismissed (won't retry, acknowledged failure)
 */
deadLetterJobSchema.methods.dismiss = async function (resolvedBy, notes = null) {
  this.status = 'dismissed';
  this.resolvedAt = new Date();
  this.resolvedBy = resolvedBy;
  this.resolution = 'dismissed';
  if (notes) {
    this.resolutionNotes = notes;
  }
  return this.save();
};

export const DeadLetterJob = mongoose.model('DeadLetterJob', deadLetterJobSchema);
