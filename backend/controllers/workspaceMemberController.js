/**
 * Workspace Member Controller
 *
 * Handles workspace membership operations:
 * - Invite users to workspace
 * - List workspace members
 * - Revoke access
 * - View user's workspaces
 */

import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { User } from '../models/User.js';
import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { emailService } from '../services/emailService.js';
import { notificationService } from '../services/notificationService.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

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
      workspaceName: m.workspaceId.workspaceName,
      workspaceIcon: m.workspaceId.workspaceIcon,
      syncStatus: m.workspaceId.syncStatus,
      stats: m.workspaceId.stats,
      myRole: m.role,
      permissions: m.permissions,
      joinedAt: m.invitedAt,
      createdAt: m.workspaceId.createdAt,
      updatedAt: m.workspaceId.updatedAt,
    }));

  sendSuccess(res, 200, 'Workspaces retrieved', { workspaces });
});

/**
 * Get members of a workspace (owner/admin only)
 * GET /api/v1/workspaces/:workspaceId/members
 */
export const getWorkspaceMembers = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;

  // Verify requester has access
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
      ? {
          id: m.userId._id.toString(),
          name: m.userId.name,
          email: m.userId.email,
        }
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
 *
 * Body: { email: string, role?: 'member' | 'viewer' }
 */
export const inviteMember = catchAsync(async (req, res) => {
  const { workspaceId } = req.params;
  const { email, role = 'member' } = req.body;
  const inviterId = req.user.userId;

  if (!email) {
    return sendError(res, 400, 'Email is required');
  }

  // Validate role
  if (!['member', 'viewer'].includes(role)) {
    return sendError(res, 400, 'Invalid role. Must be "member" or "viewer"');
  }

  // Find user by email
  const userToInvite = await User.findOne({ email: email.toLowerCase() });
  if (!userToInvite) {
    return sendError(res, 404, 'User not found. They must register first.');
  }

  // Check if inviter has permission
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

  // Get workspace info
  const workspace = await NotionWorkspace.findById(workspaceId);
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

    // Get inviter info for email
    const inviter = await User.findById(inviterId).select('name email');

    logger.info('User invited to workspace', {
      service: 'workspace-member',
      workspaceId,
      invitedUserId: userToInvite._id,
      invitedBy: inviterId,
      role,
    });

    // Send real-time in-app notification (async, don't block response)
    notificationService
      .notifyWorkspaceInvitation({
        userId: userToInvite._id,
        workspaceId: workspace._id,
        workspaceName: workspace.workspaceName,
        inviterId,
        inviterName: inviter?.name || inviter?.email || 'A team member',
        role,
      })
      .then(() => {
        logger.info('In-app invitation notification sent', {
          service: 'workspace-member',
          to: userToInvite._id.toString(),
        });
      })
      .catch((err) => {
        logger.error('In-app notification error', {
          service: 'workspace-member',
          error: err.message,
        });
      });

    // Send invitation email (async, don't block response)
    emailService
      .sendWorkspaceInvitation({
        toEmail: userToInvite.email,
        toName: userToInvite.name,
        inviterName: inviter?.name || inviter?.email || 'A team member',
        workspaceName: workspace.workspaceName,
        workspaceId: workspace._id.toString(),
        role,
      })
      .then((result) => {
        if (result.success) {
          logger.info('Invitation email sent', {
            service: 'workspace-member',
            to: userToInvite.email,
            messageId: result.messageId,
          });
        } else {
          logger.warn('Failed to send invitation email', {
            service: 'workspace-member',
            to: userToInvite.email,
            error: result.error || result.reason,
          });
        }
      })
      .catch((err) => {
        logger.error('Invitation email error', {
          service: 'workspace-member',
          error: err.message,
        });
      });

    sendSuccess(
      res,
      201,
      `${userToInvite.name || email} has been invited to ${workspace.workspaceName}`,
      {
        membership: {
          id: membership._id,
          userId: userToInvite._id,
          email: userToInvite.email,
          name: userToInvite.name,
          role: membership.role,
          status: membership.status,
        },
        emailSent: true,
      }
    );
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

  // Check if requester is owner
  const requesterMembership = await WorkspaceMember.findOne({
    workspaceId,
    userId: requesterId,
    status: 'active',
    role: 'owner',
  });

  if (!requesterMembership) {
    return sendError(res, 403, 'Only workspace owners can revoke access');
  }

  // Find member to revoke
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

  // Get workspace info for notification
  const workspace = await NotionWorkspace.findById(workspaceId);
  const requester = await User.findById(requesterId).select('name email');

  // Send removal notification (async)
  if (workspace && memberToRevoke.userId) {
    notificationService
      .notifyWorkspaceRemoval({
        userId: memberToRevoke.userId,
        workspaceId: workspace._id,
        workspaceName: workspace.workspaceName,
        actorId: requesterId,
        actorName: requester?.name || requester?.email || 'Workspace owner',
      })
      .catch((err) => {
        logger.error('Failed to send removal notification', {
          service: 'workspace-member',
          error: err.message,
        });
      });
  }

  sendSuccess(res, 200, 'Access revoked successfully');
});

/**
 * Update member permissions
 * PATCH /api/v1/workspaces/:workspaceId/members/:memberId
 *
 * Body: { role?: string, permissions?: object }
 */
export const updateMember = catchAsync(async (req, res) => {
  const { workspaceId, memberId } = req.params;
  const { role, permissions } = req.body;
  const requesterId = req.user.userId;

  // Check if requester is owner
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

  const oldRole = member.role;

  if (role && ['member', 'viewer'].includes(role)) {
    member.role = role;
  }

  if (permissions) {
    member.permissions = {
      ...member.permissions,
      ...permissions,
      // Prevent non-owners from having invite permission unless explicitly set
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

  // Send permission change notification if role changed
  if (role && oldRole !== role && member.userId) {
    const workspace = await NotionWorkspace.findById(workspaceId);
    const requester = await User.findById(requesterId).select('name email');

    notificationService
      .notifyPermissionChange({
        userId: member.userId,
        workspaceId: workspace?._id,
        workspaceName: workspace?.workspaceName || 'Unknown Workspace',
        actorId: requesterId,
        actorName: requester?.name || requester?.email || 'Workspace owner',
        oldRole,
        newRole: role,
      })
      .catch((err) => {
        logger.error('Failed to send permission change notification', {
          service: 'workspace-member',
          error: err.message,
        });
      });
  }

  sendSuccess(res, 200, 'Member updated successfully', { member });
});
