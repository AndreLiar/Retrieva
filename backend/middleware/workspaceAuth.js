/**
 * Workspace Authorization Middleware
 *
 * Ensures users can only access resources from workspaces they're members of.
 * No anonymous access - all users must be authenticated and authorized.
 */

import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { Workspace } from '../models/Workspace.js';
import { sendError } from '../utils/core/responseFormatter.js';
import logger from '../config/logger.js';

/**
 * Require workspace membership for RAG queries
 * User must be a member of at least one workspace to query
 */
export const requireWorkspaceAccess = async (req, res, next) => {
  try {
    // Must be authenticated (no anonymous)
    if (!req.user?.userId) {
      logger.warn('Unauthorized access attempt - no authentication', {
        service: 'workspace-auth',
        path: req.path,
        ip: req.ip,
      });
      return sendError(res, 401, 'Authentication required. Please log in.');
    }

    const userId = req.user.userId;

    // Get user's workspace memberships
    const memberships = await WorkspaceMember.find({
      userId,
      status: 'active',
      'permissions.canQuery': true,
    }).populate('workspaceId', 'name syncStatus');

    if (memberships.length === 0) {
      logger.warn('User has no workspace access', {
        service: 'workspace-auth',
        userId,
        path: req.path,
      });
      return sendError(
        res,
        403,
        'You do not have access to any workspace. Please contact an admin to get invited.'
      );
    }

    // Filter to active workspaces only
    const activeWorkspaces = memberships
      .filter((m) => m.workspaceId && m.workspaceId.syncStatus !== 'error')
      .map((m) => ({
        _id: m.workspaceId._id,
        workspaceId: m.workspaceId._id.toString(),
        workspaceName: m.workspaceId.name,
        role: m.role,
        permissions: m.permissions,
      }));

    if (activeWorkspaces.length === 0) {
      return sendError(
        res,
        403,
        'No active workspaces available. Please wait for workspace sync or contact admin.'
      );
    }

    // Attach authorized workspaces to request
    req.authorizedWorkspaces = activeWorkspaces;

    logger.debug('Workspace access granted', {
      service: 'workspace-auth',
      userId,
      workspaceCount: activeWorkspaces.length,
    });

    next();
  } catch (error) {
    logger.error('Workspace authorization error', {
      service: 'workspace-auth',
      error: error.message,
      stack: error.stack,
    });
    return sendError(res, 500, 'Authorization check failed');
  }
};

/**
 * Require ownership of a specific workspace
 * Used for admin operations like inviting users
 */
export const requireWorkspaceOwner = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return sendError(res, 400, 'Workspace ID required');
    }

    const userId = req.user.userId;

    // Check if user is owner of this workspace
    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId,
      status: 'active',
      role: 'owner',
    });

    if (!membership) {
      logger.warn('Non-owner attempted workspace admin action', {
        service: 'workspace-auth',
        userId,
        workspaceId,
        path: req.path,
      });
      return sendError(res, 403, 'Only workspace owners can perform this action');
    }

    req.workspace = await Workspace.findById(workspaceId);
    next();
  } catch (error) {
    logger.error('Workspace owner check error', {
      service: 'workspace-auth',
      error: error.message,
    });
    return sendError(res, 500, 'Authorization check failed');
  }
};

/**
 * Middleware to check if user can invite others
 * Owner or members with canInvite permission
 */
export const canInviteMembers = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (!workspaceId) {
      return sendError(res, 400, 'Workspace ID required');
    }

    const membership = await WorkspaceMember.findOne({
      workspaceId,
      userId: req.user.userId,
      status: 'active',
    });

    if (!membership) {
      return sendError(res, 403, 'You are not a member of this workspace');
    }

    if (membership.role !== 'owner' && !membership.permissions.canInvite) {
      return sendError(res, 403, 'You do not have permission to invite members');
    }

    req.membership = membership;
    next();
  } catch (error) {
    logger.error('Invite permission check error', {
      service: 'workspace-auth',
      error: error.message,
    });
    return sendError(res, 500, 'Permission check failed');
  }
};

/**
 * Get workspace IDs that user has access to (for filtering queries)
 */
export async function getUserWorkspaceIds(userId) {
  const memberships = await WorkspaceMember.find({
    userId,
    status: 'active',
    'permissions.canQuery': true,
  }).populate('workspaceId', '_id');

  return memberships.filter((m) => m.workspaceId).map((m) => m.workspaceId._id.toString());
}
