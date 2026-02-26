import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Owner of the workspace
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Status for document processing
    syncStatus: {
      type: String,
      enum: ['idle', 'syncing', 'synced', 'error'],
      default: 'idle',
    },
  },
  {
    timestamps: true,
  }
);

workspaceSchema.index({ userId: 1, name: 1 });

export const Workspace = mongoose.model('Workspace', workspaceSchema);
