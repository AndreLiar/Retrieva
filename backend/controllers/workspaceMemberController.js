/**
 * Workspace Member Controller
 *
 * Handles workspace membership operations:
 * - Create workspaces
 * - Invite users to workspace
 * - List workspace members
 * - Revoke access
 * - View user's workspaces
 */

import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Workspace } from '../models/Workspace.js';
import { User } from '../models/User.js';
import { emailService } from '../services/emailService.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Create a new workspace
 * POST /api/v1/workspaces
 */
export const createWorkspace = catchAsync(async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.userId;

  if (!name?.trim()) {
    return sendError(res, 400, 'Workspace name is required');
  }

  const workspace = await Workspace.create({
    name: name.trim(),
    description: description?.trim() || '',
    userId,
  });

  await WorkspaceMember.addOwner(workspace._id, userId);

  logger.info('Workspace created', { service: 'workspace', workspaceId: workspace._id, userId });

  sendSuccess(res, 201, 'Workspace created', {
    workspace: {
      id: workspace._id.toString(),
      name: workspace.name,
      description: workspace.description,
      syncStatus: workspace.syncStatus,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    },
  });
});

/**
 * Get a single workspace
 * GET /api/v1/workspaces/:workspaceId
 */
export const getWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;

  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId: req.user.userId,
    status: 'active',
  });

  if (!membership) {
    return sendError(res, 403, 'You are not a member of this workspace');
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  sendSuccess(res, 200, 'Workspace retrieved', {
    workspace: {
      id: workspace._id.toString(),
      name: workspace.name,
      description: workspace.description,
      syncStatus: workspace.syncStatus,
      myRole: membership.role,
      permissions: membership.permissions,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      vendorTier: workspace.vendorTier,
      country: workspace.country,
      serviceType: workspace.serviceType,
      contractStart: workspace.contractStart,
      contractEnd: workspace.contractEnd,
      nextReviewDate: workspace.nextReviewDate,
      vendorStatus: workspace.vendorStatus,
      certifications: workspace.certifications,
      exitStrategyDoc: workspace.exitStrategyDoc,
    },
  });
});

/**
 * Update a workspace
 * PATCH /api/v1/workspaces/:workspaceId
 */
export const updateWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const {
    name,
    description,
    vendorTier,
    country,
    serviceType,
    contractStart,
    contractEnd,
    nextReviewDate,
    vendorStatus,
    certifications,
    exitStrategyDoc,
  } = req.body;

  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId: req.user.userId,
    status: 'active',
    role: 'owner',
  });

  if (!membership) {
    return sendError(res, 403, 'Only workspace owners can update workspace details');
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  if (name?.trim()) workspace.name = name.trim();
  if (description !== undefined) workspace.description = description?.trim() || '';

  if (vendorTier !== undefined) workspace.vendorTier = vendorTier || null;
  if (country !== undefined) workspace.country = country?.trim() || '';
  if (serviceType !== undefined) workspace.serviceType = serviceType || null;
  if (contractStart !== undefined)
    workspace.contractStart = contractStart ? new Date(contractStart) : null;
  if (contractEnd !== undefined) workspace.contractEnd = contractEnd ? new Date(contractEnd) : null;
  if (nextReviewDate !== undefined)
    workspace.nextReviewDate = nextReviewDate ? new Date(nextReviewDate) : null;
  if (vendorStatus !== undefined) workspace.vendorStatus = vendorStatus;
  if (Array.isArray(certifications)) workspace.certifications = certifications;
  if (exitStrategyDoc !== undefined) workspace.exitStrategyDoc = exitStrategyDoc || null;

  await workspace.save();

  sendSuccess(res, 200, 'Workspace updated', {
    workspace: {
      id: workspace._id.toString(),
      name: workspace.name,
      description: workspace.description,
      syncStatus: workspace.syncStatus,
      updatedAt: workspace.updatedAt,
      vendorTier: workspace.vendorTier,
      country: workspace.country,
      serviceType: workspace.serviceType,
      contractStart: workspace.contractStart,
      contractEnd: workspace.contractEnd,
      nextReviewDate: workspace.nextReviewDate,
      vendorStatus: workspace.vendorStatus,
      certifications: workspace.certifications,
      exitStrategyDoc: workspace.exitStrategyDoc,
    },
  });
});

/**
 * Delete a workspace
 * DELETE /api/v1/workspaces/:workspaceId
 */
export const deleteWorkspace = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;

  const membership = await WorkspaceMember.findOne({
    workspaceId,
    userId: req.user.userId,
    status: 'active',
    role: 'owner',
  });

  if (!membership) {
    return sendError(res, 403, 'Only workspace owners can delete a workspace');
  }

  await WorkspaceMember.deleteMany({ workspaceId });
  await Workspace.findByIdAndDelete(workspaceId);

  logger.info('Workspace deleted', { service: 'workspace', workspaceId });

  sendSuccess(res, 200, 'Workspace deleted');
});

/**
 * Get current user's workspace memberships
 * GET /api/v1/workspaces/my-workspaces
 */
export const getMyWorkspaces = catchAsync(async (req, res) => {
  const userId = req.user.userId;

  const memberships = await WorkspaceMember.getUserWorkspaces(userId);

  const workspaces = memberships
    .filter((m) => m.workspaceId)
    .map((m) => ({
      id: m.workspaceId._id.toString(),
      name: m.workspaceId.name,
      description: m.workspaceId.description,
      syncStatus: m.workspaceId.syncStatus,
      myRole: m.role,
      permissions: m.permissions,
      joinedAt: m.invitedAt,
      createdAt: m.workspaceId.createdAt,
      updatedAt: m.workspaceId.updatedAt,
      vendorTier: m.workspaceId.vendorTier,
      country: m.workspaceId.country,
      serviceType: m.workspaceId.serviceType,
      contractStart: m.workspaceId.contractStart,
      contractEnd: m.workspaceId.contractEnd,
      nextReviewDate: m.workspaceId.nextReviewDate,
      vendorStatus: m.workspaceId.vendorStatus,
      certifications: m.workspaceId.certifications,
      exitStrategyDoc: m.workspaceId.exitStrategyDoc,
    }));

  sendSuccess(res, 200, 'Workspaces retrieved', { workspaces });
});

/**
 * Get members of a workspace
 * GET /api/v1/workspaces/:workspaceId/members
 */
export const getWorkspaceMembers = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;

  const requesterMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId: req.user.userId,
    status: 'active',
  });

  if (!requesterMembership) {
    return sendError(res, 403, 'You are not a member of this workspace');
  }

  const members = await WorkspaceMember.getWorkspaceMembers(workspaceId);

  const memberList = members.map((m) => ({
    id: m._id.toString(),
    userId: m.userId?._id?.toString(),
    user: m.userId
      ? { id: m.userId._id.toString(), name: m.userId.name, email: m.userId.email }
      : null,
    role: m.role,
    status: m.status,
    permissions: m.permissions,
    joinedAt: m.invitedAt,
  }));

  sendSuccess(res, 200, 'Members retrieved', { members: memberList });
});

/**
 * Invite a user to workspace
 * POST /api/v1/workspaces/:workspaceId/invite
 */
export const inviteMember = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const { email, role = 'member' } = req.body;
  const inviterId = req.user.userId;

  if (!email) {
    return sendError(res, 400, 'Email is required');
  }

  if (!['member', 'viewer'].includes(role)) {
    return sendError(res, 400, 'Invalid role. Must be "member" or "viewer"');
  }

  const userToInvite = await User.findOne({ email: email.toLowerCase() });
  if (!userToInvite) {
    return sendError(res, 404, 'User not found. They must register first.');
  }

  const inviterMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId: inviterId,
    status: 'active',
  });

  if (!inviterMembership) {
    return sendError(res, 403, 'You are not a member of this workspace');
  }

  if (inviterMembership.role !== 'owner' && !inviterMembership.permissions.canInvite) {
    return sendError(res, 403, 'You do not have permission to invite members');
  }

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  try {
    const membership = await WorkspaceMember.inviteMember(
      workspaceId,
      userToInvite._id,
      inviterId,
      role
    );

    const inviter = await User.findById(inviterId).select('name email');

    logger.info('User invited to workspace', {
      service: 'workspace-member',
      workspaceId,
      invitedUserId: userToInvite._id,
      invitedBy: inviterId,
      role,
    });

    emailService
      .sendWorkspaceInvitation({
        toEmail: userToInvite.email,
        toName: userToInvite.name,
        inviterName: inviter?.name || inviter?.email || 'A team member',
        workspaceName: workspace.name,
        workspaceId: workspace._id.toString(),
        role,
      })
      .catch((err) => {
        logger.error('Invitation email error', { service: 'workspace-member', error: err.message });
      });

    sendSuccess(res, 201, `${userToInvite.name || email} has been invited to ${workspace.name}`, {
      membership: {
        id: membership._id,
        userId: userToInvite._id,
        email: userToInvite.email,
        name: userToInvite.name,
        role: membership.role,
        status: membership.status,
      },
    });
  } catch (error) {
    if (error.message.includes('already a member')) {
      return sendError(res, 409, 'User is already a member of this workspace');
    }
    throw error;
  }
});

/**
 * Revoke a user's access to workspace
 * DELETE /api/v1/workspaces/:workspaceId/members/:memberId
 */
export const revokeMember = catchAsync(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const requesterId = req.user.userId;

  const requesterMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId: requesterId,
    status: 'active',
    role: 'owner',
  });

  if (!requesterMembership) {
    return sendError(res, 403, 'Only workspace owners can revoke access');
  }

  const memberToRevoke = await WorkspaceMember.findById(memberId);
  if (!memberToRevoke || memberToRevoke.workspaceId.toString() !== workspaceId) {
    return sendError(res, 404, 'Member not found');
  }

  if (memberToRevoke.role === 'owner') {
    return sendError(res, 400, 'Cannot revoke owner access');
  }

  memberToRevoke.status = 'revoked';
  await memberToRevoke.save();

  logger.info('User access revoked from workspace', {
    service: 'workspace-member',
    workspaceId,
    revokedUserId: memberToRevoke.userId,
    revokedBy: requesterId,
  });

  sendSuccess(res, 200, 'Access revoked successfully');
});

/**
 * Update member permissions
 * PATCH /api/v1/workspaces/:workspaceId/members/:memberId
 */
export const updateMember = catchAsync(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const { role, permissions } = req.body;
  const requesterId = req.user.userId;

  const requesterMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId: requesterId,
    status: 'active',
    role: 'owner',
  });

  if (!requesterMembership) {
    return sendError(res, 403, 'Only workspace owners can update member permissions');
  }

  const member = await WorkspaceMember.findById(memberId);
  if (!member || member.workspaceId.toString() !== workspaceId) {
    return sendError(res, 404, 'Member not found');
  }

  if (member.role === 'owner') {
    return sendError(res, 400, 'Cannot modify owner permissions');
  }

  if (role && ['member', 'viewer'].includes(role)) {
    member.role = role;
  }

  if (permissions) {
    member.permissions = {
      ...member.permissions,
      ...permissions,
      canInvite: permissions.canInvite === true && role !== 'viewer',
    };
  }

  await member.save();

  logger.info('Member permissions updated', {
    service: 'workspace-member',
    workspaceId,
    memberId,
    updatedBy: requesterId,
  });

  sendSuccess(res, 200, 'Member updated successfully', { member });
});
