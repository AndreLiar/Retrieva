/**
 * Workspace Membership Routes
 *
 * All routes require authentication - no anonymous access allowed.
 */

import express from 'express';
import {
  getMyWorkspaces,
  getWorkspaceMembers,
  inviteMember,
  revokeMember,
  updateMember,
} from '../controllers/workspaceMemberController.js';
import { authenticate } from '../middleware/auth.js';
import { canInviteMembers } from '../middleware/workspaceAuth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/workspaces/my-workspaces
 * @desc    Get workspaces the current user has access to
 * @access  Private (authenticated users)
 */
router.get('/my-workspaces', getMyWorkspaces);

/**
 * @route   GET /api/v1/workspaces/:workspaceId/members
 * @desc    Get all members of a workspace
 * @access  Private (workspace members only)
 */
router.get('/:workspaceId/members', getWorkspaceMembers);

/**
 * @route   POST /api/v1/workspaces/:workspaceId/invite
 * @desc    Invite a user to workspace
 * @access  Private (owner or members with invite permission)
 * @body    { email: string, role?: 'member' | 'viewer' }
 */
router.post('/:workspaceId/invite', canInviteMembers, inviteMember);

/**
 * @route   DELETE /api/v1/workspaces/:workspaceId/members/:memberId
 * @desc    Revoke a user's access
 * @access  Private (owner only)
 */
router.delete('/:workspaceId/members/:memberId', revokeMember);

/**
 * @route   PATCH /api/v1/workspaces/:workspaceId/members/:memberId
 * @desc    Update member role/permissions
 * @access  Private (owner only)
 */
router.patch('/:workspaceId/members/:memberId', updateMember);

export default router;
