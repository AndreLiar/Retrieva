import mongoose from 'mongoose';
import { OrganizationMember } from './OrganizationMember.js';

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    logoUrl: {
      type: String,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'team', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active',
    },
    settings: {
      maxWorkspaces: {
        type: Number,
        default: 5,
      },
      maxMembers: {
        type: Number,
        default: 10,
      },
      allowMembersToCreateWorkspaces: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

organizationSchema.index({ slug: 1 }, { unique: true });

/**
 * Find all organizations a user belongs to as an active member
 */
organizationSchema.statics.findForUser = async function (userId) {
  const memberships = await OrganizationMember.find({
    userId,
    status: 'active',
  }).populate('organizationId');

  return memberships
    .filter((m) => m.organizationId)
    .map((m) => ({
      org: m.organizationId,
      role: m.role,
    }));
};

export const Organization = mongoose.model('Organization', organizationSchema);
