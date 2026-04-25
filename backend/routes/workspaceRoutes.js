/**
 * Workspace Routes
 */

import express from 'express';
import {
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getMyWorkspaces,
  getWorkspaceMembers,
  inviteMember,
  revokeMember,
  updateMember,
} from '../controllers/workspaceMemberController.js';
import { authenticate } from '../middleware/auth.js';
import { canInviteMembers } from '../middleware/workspaceAuth.js';
import { exportRoi } from '../controllers/exportController.js';
import { validateBody } from '../middleware/validate.js';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
} from '../validators/schemas.js';

const router = express.Router();

// Workspace CRUD
router.post('/', authenticate, validateBody(createWorkspaceSchema), createWorkspace);
router.get('/my-workspaces', authenticate, getMyWorkspaces);
router.get('/roi-export', authenticate, exportRoi);
router.get('/:workspaceId', authenticate, getWorkspace);
router.patch('/:workspaceId', authenticate, validateBody(updateWorkspaceSchema), updateWorkspace);
router.delete('/:workspaceId', authenticate, deleteWorkspace);

// Member management
router.get('/:workspaceId/members', authenticate, getWorkspaceMembers);
router.post(
  '/:workspaceId/invite',
  authenticate,
  canInviteMembers,
  validateBody(inviteMemberSchema),
  inviteMember
);
router.delete('/:workspaceId/members/:memberId', authenticate, revokeMember);
router.patch('/:workspaceId/members/:memberId', authenticate, updateMember);

export default router;
