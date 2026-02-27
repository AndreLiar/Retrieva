import mongoose from 'mongoose';
import { sha256, generateToken } from '../utils/security/crypto.js';

const { Schema } = mongoose;

const orgMemberSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ['org_admin', 'analyst', 'viewer'],
      default: 'analyst',
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'revoked'],
      default: 'pending',
    },
    inviteTokenHash: { type: String, select: false },
    inviteTokenExpires: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    joinedAt: { type: Date },
  },
  { timestamps: true }
);

// Unique: one active/pending membership per email per org
orgMemberSchema.index({ organizationId: 1, email: 1 }, { unique: true });
orgMemberSchema.index({ userId: 1 });

/**
 * Create an invite record with a raw token.
 * Returns { member, rawToken }
 */
orgMemberSchema.statics.createInvite = async function (organizationId, email, role, invitedBy) {
  const rawToken = generateToken(32);
  const tokenHash = sha256(rawToken);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Upsert: allow re-inviting an already-pending member
  const member = await this.findOneAndUpdate(
    { organizationId, email: email.toLowerCase() },
    {
      organizationId,
      email: email.toLowerCase(),
      role,
      invitedBy,
      status: 'pending',
      inviteTokenHash: tokenHash,
      inviteTokenExpires: expires,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { member, rawToken };
};

/**
 * Find a pending member by raw token.
 */
orgMemberSchema.statics.findByToken = async function (rawToken) {
  const tokenHash = sha256(rawToken);
  return this.findOne({
    inviteTokenHash: tokenHash,
    status: 'pending',
    inviteTokenExpires: { $gt: new Date() },
  }).select('+inviteTokenHash');
};

/**
 * Activate membership: set status=active, userId, joinedAt; clear token.
 */
orgMemberSchema.statics.activate = async function (memberId, userId) {
  return this.findByIdAndUpdate(
    memberId,
    {
      $set: { status: 'active', userId, joinedAt: new Date() },
      $unset: { inviteTokenHash: 1, inviteTokenExpires: 1 },
    },
    { new: true }
  );
};

export const OrganizationMember = mongoose.model('OrganizationMember', orgMemberSchema);
