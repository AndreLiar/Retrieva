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

const router = express.Router();

router.use(authenticate);

// Workspace CRUD
router.post('/', createWorkspace);
router.get('/my-workspaces', getMyWorkspaces);
router.get('/roi-export', exportRoi);
router.get('/:workspaceId', getWorkspace);
router.patch('/:workspaceId', updateWorkspace);
router.delete('/:workspaceId', deleteWorkspace);

// Member management
router.get('/:workspaceId/members', getWorkspaceMembers);
router.post('/:workspaceId/invite', canInviteMembers, inviteMember);
router.delete('/:workspaceId/members/:memberId', revokeMember);
router.patch('/:workspaceId/members/:memberId', updateMember);

export default router;
