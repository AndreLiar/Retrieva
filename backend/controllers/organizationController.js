/**
 * Organization Controller
 *
 * Handles org creation, membership, and invite flows for the
 * organization-first onboarding model.
 */

import { Organization } from '../models/Organization.js';
import { OrganizationMember } from '../models/OrganizationMember.js';
import { User } from '../models/User.js';
import { emailService } from '../services/emailService.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import { safeDecrypt } from '../utils/security/fieldEncryption.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// POST /api/v1/organizations
// ---------------------------------------------------------------------------
export const createOrganization = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { name, industry, country } = req.body;

  if (!name?.trim()) {
    return sendError(res, 400, 'Organization name is required');
  }

  // Prevent duplicate org membership
  const existing = await OrganizationMember.findOne({ userId, status: 'active' });
  if (existing) {
    return sendError(res, 409, 'You already belong to an organization');
  }

  const org = await Organization.create({
    name: name.trim(),
    industry: industry || 'other',
    country: country?.trim() || '',
    ownerId: userId,
  });

  const user = await User.findById(userId);

  await OrganizationMember.create({
    organizationId: org._id,
    userId,
    email: user.email,
    role: 'org_admin',
    status: 'active',
    joinedAt: new Date(),
  });

  await User.findByIdAndUpdate(userId, { organizationId: org._id });

  logger.info('Organization created', {
    service: 'organization',
    orgId: org._id,
    userId,
  });

  sendSuccess(res, 201, 'Organization created', {
    organization: {
      id: org._id,
      name: org.name,
      industry: org.industry,
      country: org.country,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/me
// ---------------------------------------------------------------------------
export const getMyOrganization = catchAsync(async (req, res) => {
  const userId = req.user.userId;

  const membership = await OrganizationMember.findOne({
    userId,
    status: 'active',
  }).populate('organizationId');

  if (!membership || !membership.organizationId) {
    return sendSuccess(res, 200, 'No organization', { organization: null, role: null });
  }

  const org = membership.organizationId;

  sendSuccess(res, 200, 'Organization retrieved', {
    organization: {
      id: org._id,
      name: org.name,
      industry: org.industry,
      country: org.country,
    },
    role: membership.role,
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/invite-info?token=XXX  (PUBLIC — no auth)
// ---------------------------------------------------------------------------
export const getInviteInfo = catchAsync(async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return sendError(res, 400, 'Token is required');
  }

  const member = await OrganizationMember.findByToken(token);

  if (!member) {
    return sendError(res, 404, 'Invalid or expired invite link');
  }

  const org = await Organization.findById(member.organizationId);
  if (!org) {
    return sendError(res, 404, 'Organization not found');
  }

  let inviterName = null;
  if (member.invitedBy) {
    const inviter = await User.findById(member.invitedBy).select('name email');
    if (inviter) {
      inviterName = safeDecrypt(inviter.name) || inviter.email;
    }
  }

  sendSuccess(res, 200, 'Invite info retrieved', {
    organizationName: org.name,
    inviterName,
    role: member.role,
    email: member.email,
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/invite
// ---------------------------------------------------------------------------
export const inviteMember = catchAsync(async (req, res) => {
  const inviterId = req.user.userId;
  const { email, role = 'analyst' } = req.body;

  if (!email) {
    return sendError(res, 400, 'Email is required');
  }

  if (!['org_admin', 'analyst', 'viewer'].includes(role)) {
    return sendError(res, 400, 'Invalid role');
  }

  // Verify caller is org_admin
  const callerMembership = await OrganizationMember.findOne({
    userId: inviterId,
    status: 'active',
  });

  if (!callerMembership) {
    return sendError(res, 403, 'You do not belong to an organization');
  }

  if (callerMembership.role !== 'org_admin') {
    return sendError(res, 403, 'Only org admins can invite members');
  }

  const orgId = callerMembership.organizationId;

  // Check if already active
  const existingActive = await OrganizationMember.findOne({
    organizationId: orgId,
    email: email.toLowerCase(),
    status: 'active',
  });

  if (existingActive) {
    return sendError(res, 409, 'This user is already an active member');
  }

  // Create or refresh invite
  const { member, rawToken } = await OrganizationMember.createInvite(orgId, email, role, inviterId);

  const org = await Organization.findById(orgId);
  const inviter = await User.findById(inviterId).select('name email');
  const inviterName = safeDecrypt(inviter?.name) || inviter?.email || 'A team member';

  emailService
    .sendOrganizationInvitation({
      toEmail: email,
      inviterName,
      organizationName: org.name,
      role,
      inviteToken: rawToken,
    })
    .catch((err) => {
      logger.warn('Failed to send org invitation email', {
        service: 'organization',
        error: err.message,
      });
    });

  logger.info('Org invite sent', {
    service: 'organization',
    orgId,
    email,
    role,
    inviterId,
  });

  sendSuccess(res, 201, 'Invitation sent', {
    member: {
      id: member._id,
      email: member.email,
      role: member.role,
      status: member.status,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/organizations/accept-invite  (authenticated)
// ---------------------------------------------------------------------------
export const acceptInvite = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { token } = req.body;

  if (!token) {
    return sendError(res, 400, 'Token is required');
  }

  const member = await OrganizationMember.findByToken(token);

  if (!member) {
    return sendError(res, 404, 'Invalid or expired invite token');
  }

  const user = await User.findById(userId);
  if (!user) {
    return sendError(res, 404, 'User not found');
  }

  if (member.email !== user.email.toLowerCase()) {
    return sendError(res, 403, 'This invite was sent to a different email address');
  }

  // Already in an org?
  const existingMembership = await OrganizationMember.findOne({
    userId,
    status: 'active',
  });

  if (existingMembership) {
    return sendError(res, 409, 'You already belong to an organization');
  }

  await OrganizationMember.activate(member._id, userId);
  await User.findByIdAndUpdate(userId, { organizationId: member.organizationId });

  logger.info('Org invite accepted', {
    service: 'organization',
    orgId: member.organizationId,
    userId,
  });

  sendSuccess(res, 200, 'Invitation accepted');
});

// ---------------------------------------------------------------------------
// GET /api/v1/organizations/members
// ---------------------------------------------------------------------------
export const getMembers = catchAsync(async (req, res) => {
  const userId = req.user.userId;

  const callerMembership = await OrganizationMember.findOne({
    userId,
    status: 'active',
  });

  if (!callerMembership) {
    return sendError(res, 403, 'You do not belong to an organization');
  }

  const members = await OrganizationMember.find({
    organizationId: callerMembership.organizationId,
    status: { $ne: 'revoked' },
  }).populate('userId', 'name email');

  const memberList = members.map((m) => ({
    id: m._id.toString(),
    email: m.email,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedAt,
    user: m.userId
      ? {
          id: m.userId._id.toString(),
          name: safeDecrypt(m.userId.name),
          email: m.userId.email,
        }
      : null,
  }));

  sendSuccess(res, 200, 'Members retrieved', { members: memberList });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/organizations/members/:memberId
// ---------------------------------------------------------------------------
export const removeMember = catchAsync(async (req, res) => {
  const userId = req.user.userId;
  const { memberId } = req.params;

  const callerMembership = await OrganizationMember.findOne({
    userId,
    status: 'active',
  });

  if (!callerMembership || callerMembership.role !== 'org_admin') {
    return sendError(res, 403, 'Only org admins can remove members');
  }

  const target = await OrganizationMember.findById(memberId);

  if (!target || target.organizationId.toString() !== callerMembership.organizationId.toString()) {
    return sendError(res, 404, 'Member not found');
  }

  if (target.userId?.toString() === userId) {
    // Check that there is at least one other admin before allowing self-removal
    const adminCount = await OrganizationMember.countDocuments({
      organizationId: callerMembership.organizationId,
      role: 'org_admin',
      status: 'active',
    });
    if (adminCount <= 1) {
      return sendError(res, 400, 'Cannot remove the only org admin');
    }
  }

  await OrganizationMember.findByIdAndUpdate(memberId, { status: 'revoked' });

  logger.info('Org member removed', {
    service: 'organization',
    memberId,
    removedBy: userId,
  });

  sendSuccess(res, 200, 'Member removed');
});
