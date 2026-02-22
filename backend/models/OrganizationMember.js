import mongoose from 'mongoose';

const organizationMemberSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
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
      enum: ['org-admin', 'billing-admin', 'auditor', 'member'],
      default: 'member',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'revoked'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index: one membership record per user per org
organizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
organizationMemberSchema.index({ userId: 1, status: 1 });

/**
 * Get all active members of an organization (with user info)
 */
organizationMemberSchema.statics.getOrgMembers = function (orgId) {
  return this.find({
    organizationId: orgId,
    status: { $ne: 'revoked' },
  }).populate('userId', 'name email');
};

/**
 * Check if user is an active member of the organization
 */
organizationMemberSchema.statics.hasAccess = async function (userId, orgId) {
  const member = await this.findOne({
    userId,
    organizationId: orgId,
    status: 'active',
  });
  return !!member;
};

/**
 * Check if user holds a specific role in the organization
 */
organizationMemberSchema.statics.hasRole = async function (userId, orgId, role) {
  const member = await this.findOne({
    userId,
    organizationId: orgId,
    status: 'active',
    role,
  });
  return !!member;
};

/**
 * Add the org creator as an org-admin member
 */
organizationMemberSchema.statics.addOwner = function (orgId, userId) {
  return this.create({
    organizationId: orgId,
    userId,
    role: 'org-admin',
    status: 'active',
  });
};

/**
 * Invite a user to the organization (create or reactivate)
 */
organizationMemberSchema.statics.inviteMember = async function (
  orgId,
  userId,
  invitedBy,
  role = 'member'
) {
  const existing = await this.findOne({ organizationId: orgId, userId });
  if (existing) {
    if (existing.status === 'revoked') {
      existing.status = 'active';
      existing.role = role;
      existing.invitedBy = invitedBy;
      return existing.save();
    }
    throw new Error('User is already a member of this organization');
  }

  return this.create({
    organizationId: orgId,
    userId,
    role,
    invitedBy,
    status: 'active',
  });
};

/**
 * Revoke a user's membership
 */
organizationMemberSchema.statics.removeMember = async function (orgId, userId) {
  const member = await this.findOne({ organizationId: orgId, userId });
  if (!member) {
    throw new Error('Member not found');
  }
  member.status = 'revoked';
  return member.save();
};

export const OrganizationMember = mongoose.model('OrganizationMember', organizationMemberSchema);
