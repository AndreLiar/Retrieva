import mongoose from 'mongoose';

const syncJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
    },
    workspaceId: {
      type: String,
      required: true,
      index: true,
    },
    jobType: {
      type: String,
      enum: ['full_sync', 'incremental_sync', 'manual_sync', 'single_document'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    triggeredBy: {
      type: String,
      enum: ['auto', 'manual', 'webhook'],
      default: 'auto',
    },
    userId: {
      type: String,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    duration: {
      type: Number,
    },
    progress: {
      totalDocuments: {
        type: Number,
        default: 0,
      },
      processedDocuments: {
        type: Number,
        default: 0,
      },
      successCount: {
        type: Number,
        default: 0,
      },
      errorCount: {
        type: Number,
        default: 0,
      },
      skippedCount: {
        type: Number,
        default: 0,
      },
      currentDocument: String,
    },
    result: {
      documentsAdded: {
        type: Number,
        default: 0,
      },
      documentsUpdated: {
        type: Number,
        default: 0,
      },
      documentsDeleted: {
        type: Number,
        default: 0,
      },
      chunksCreated: {
        type: Number,
        default: 0,
      },
      errors: [
        {
          documentId: String,
          error: String,
          timestamp: Date,
        },
      ],
    },
    error: {
      message: String,
      stack: String,
      timestamp: Date,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    nextRetryAt: {
      type: Date,
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
syncJobSchema.index({ workspaceId: 1, status: 1 });
syncJobSchema.index({ jobType: 1, createdAt: -1 });
syncJobSchema.index({ createdAt: -1 });

// Method to start job
syncJobSchema.methods.start = function () {
  this.status = 'processing';
  this.startedAt = new Date();
  return this.save();
};

// Method to update progress
syncJobSchema.methods.updateProgress = function (update) {
  this.progress = {
    ...this.progress,
    ...update,
  };
  return this.save();
};

// Method to complete job
syncJobSchema.methods.complete = function (result = {}) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.duration = this.completedAt - this.startedAt;
  this.result = {
    ...this.result,
    ...result,
  };
  return this.save();
};

// Method to fail job
syncJobSchema.methods.fail = function (error) {
  this.status = 'failed';
  this.completedAt = new Date();
  this.duration = this.completedAt - (this.startedAt || this.createdAt);
  this.error = {
    message: error.message || error.toString(),
    stack: error.stack,
    timestamp: new Date(),
  };
  this.retryCount = (this.retryCount || 0) + 1;
  return this.save();
};

// Method to cancel job
syncJobSchema.methods.cancel = function () {
  this.status = 'cancelled';
  this.completedAt = new Date();
  if (this.startedAt) {
    this.duration = this.completedAt - this.startedAt;
  }
  return this.save();
};

// Method to add error to result
syncJobSchema.methods.addError = function (documentId, error) {
  if (!this.result.errors) {
    this.result.errors = [];
  }
  this.result.errors.push({
    documentId,
    error: error.toString(),
    timestamp: new Date(),
  });
  this.progress.errorCount = (this.progress.errorCount || 0) + 1;
  return this.save();
};

/**
 * Static method to get active jobs for workspace
 * @deprecated Use SyncJobRepository.getActiveJobs() instead
 */
syncJobSchema.statics.getActiveJobs = function (workspaceId) {
  return this.find({
    workspaceId,
    status: { $in: ['queued', 'processing'] },
  }).sort({ createdAt: -1 });
};

/**
 * Static method to get job history
 * @deprecated Use SyncJobRepository.getJobHistory() instead
 */
syncJobSchema.statics.getJobHistory = function (workspaceId, limit = 20) {
  return this.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit);
};

export const SyncJob = mongoose.model('SyncJob', syncJobSchema);
