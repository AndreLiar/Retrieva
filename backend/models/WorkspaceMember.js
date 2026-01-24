import mongoose from 'mongoose';

/**
 * WorkspaceMember Model
 *
 * Tracks which users have access to which Notion workspaces.
 * Only workspace owners (admins) can invite members.
 */
const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'NotionWorkspace',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'member', 'viewer'],
      default: 'member',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    invitedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'revoked'],
      default: 'active',
    },
    permissions: {
      canQuery: {
        type: Boolean,
        default: true,
      },
      canViewSources: {
        type: Boolean,
        default: true,
      },
      canInvite: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient membership lookups
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1, status: 1 });

/**
 * Check if user has access to workspace
 */
workspaceMemberSchema.statics.hasAccess = async function (userId, workspaceId) {
  const member = await this.findOne({
    userId,
    workspaceId,
    status: 'active',
  });
  return !!member;
};

/**
 * Get all workspaces a user has access to
 */
workspaceMemberSchema.statics.getUserWorkspaces = async function (userId) {
  return this.find({
    userId,
    status: 'active',
  }).populate('workspaceId', 'workspaceName workspaceIcon syncStatus stats');
};

/**
 * Get all members of a workspace
 */
workspaceMemberSchema.statics.getWorkspaceMembers = async function (workspaceId) {
  return this.find({
    workspaceId,
    status: { $ne: 'revoked' },
  }).populate('userId', 'name email role');
};

/**
 * Add owner as member when workspace is created
 */
workspaceMemberSchema.statics.addOwner = async function (workspaceId, userId) {
  return this.create({
    workspaceId,
    userId,
    role: 'owner',
    status: 'active',
    permissions: {
      canQuery: true,
      canViewSources: true,
      canInvite: true,
    },
  });
};

/**
 * Invite a user to workspace
 */
workspaceMemberSchema.statics.inviteMember = async function (
  workspaceId,
  userId,
  invitedBy,
  role = 'member'
) {
  // Check if already a member
  const existing = await this.findOne({ workspaceId, userId });
  if (existing) {
    if (existing.status === 'revoked') {
      existing.status = 'active';
      existing.role = role;
      existing.invitedBy = invitedBy;
      existing.invitedAt = new Date();
      return existing.save();
    }
    throw new Error('User is already a member of this workspace');
  }

  return this.create({
    workspaceId,
    userId,
    role,
    invitedBy,
    status: 'active',
    permissions: {
      canQuery: true,
      canViewSources: true,
      canInvite: role === 'owner',
    },
  });
};

/**
 * Revoke access
 */
workspaceMemberSchema.statics.revokeAccess = async function (workspaceId, userId) {
  const member = await this.findOne({ workspaceId, userId });
  if (!member) {
    throw new Error('Member not found');
  }
  if (member.role === 'owner') {
    throw new Error('Cannot revoke owner access');
  }
  member.status = 'revoked';
  return member.save();
};

export const WorkspaceMember = mongoose.model('WorkspaceMember', workspaceMemberSchema);
