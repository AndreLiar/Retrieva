/**
 * Middleware to load Notion workspace by ID
 * Adds workspace to req.workspace for use in subsequent handlers
 *
 * SECURITY: Implements BOLA protection - verifies user has access to workspace
 */

import { Workspace } from '../models/Workspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Load workspace middleware with authorization check
 * Expects :id parameter in route
 * SECURITY FIX: Verifies user owns or is member of workspace
 */
export const loadWorkspace = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!id) {
    return sendError(res, 400, 'Workspace ID is required');
  }

  // SECURITY: Require authentication
  if (!userId) {
    logger.warn('Unauthenticated workspace access attempt', {
      service: 'workspace-middleware',
      workspaceId: id,
      ip: req.ip,
    });
    return sendError(res, 401, 'Authentication required');
  }

  const workspace = await Workspace.findById(id);

  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // SECURITY FIX (BOLA): Verify user has access to this workspace
  // Check if user is workspace owner OR active member
  const membership = await WorkspaceMember.findOne({
    workspaceId: id,
    userId,
    status: 'active',
  });

  const isOwner = workspace.userId && workspace.userId.toString() === userId.toString();

  if (!membership && !isOwner) {
    logger.warn('Unauthorized workspace access attempt', {
      service: 'workspace-middleware',
      workspaceId: id,
      requestUserId: userId,
      ownerUserId: workspace.userId,
    });
    return sendError(res, 403, 'Access denied to this workspace');
  }

  req.workspace = workspace;
  req.workspaceMembership = membership;
  req.isWorkspaceOwner = isOwner;
  next();
};

/**
 * Load workspace without access token (for safe responses)
 * Use this when you don't need the decrypted token
 * SECURITY FIX: Includes same authorization check as loadWorkspace
 */
export const loadWorkspaceSafe = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user?.userId;

  if (!id) {
    return sendError(res, 400, 'Workspace ID is required');
  }

  // SECURITY: Require authentication
  if (!userId) {
    logger.warn('Unauthenticated workspace access attempt', {
      service: 'workspace-middleware',
      workspaceId: id,
      ip: req.ip,
    });
    return sendError(res, 401, 'Authentication required');
  }

  const workspace = await Workspace.findById(id).select('-accessToken');

  if (!workspace) {
    return sendError(res, 404, 'Workspace not found');
  }

  // SECURITY FIX (BOLA): Verify user has access to this workspace
  const membership = await WorkspaceMember.findOne({
    workspaceId: id,
    userId,
    status: 'active',
  });

  const isOwner = workspace.userId && workspace.userId.toString() === userId.toString();

  if (!membership && !isOwner) {
    logger.warn('Unauthorized workspace access attempt', {
      service: 'workspace-middleware',
      workspaceId: id,
      requestUserId: userId,
      ownerUserId: workspace.userId,
    });
    return sendError(res, 403, 'Access denied to this workspace');
  }

  req.workspace = workspace;
  req.workspaceMembership = membership;
  req.isWorkspaceOwner = isOwner;
  next();
};
