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
  getComplianceScore,
} from '../controllers/workspaceMemberController.js';
import { authenticate } from '../middleware/auth.js';
import { canInviteMembers } from '../middleware/workspaceAuth.js';
import { exportRoi } from '../controllers/exportController.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { z } from 'zod';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  mongoIdSchema,
  workspaceIdParamsSchema,
} from '../validators/schemas.js';

const workspaceMemberParamsSchema = z.object({
  workspaceId: mongoIdSchema,
  memberId: mongoIdSchema,
});

const router = express.Router();

// Workspace CRUD
router.post('/', authenticate, validateBody(createWorkspaceSchema), createWorkspace);
router.get('/my-workspaces', authenticate, getMyWorkspaces);
router.get('/roi-export', authenticate, exportRoi);
router.get(
  '/:workspaceId/compliance-score',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  getComplianceScore
);
router.get(
  '/:workspaceId',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  getWorkspace
);
router.patch(
  '/:workspaceId',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  validateBody(updateWorkspaceSchema),
  updateWorkspace
);
router.delete(
  '/:workspaceId',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  deleteWorkspace
);

// Member management
router.get(
  '/:workspaceId/members',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  getWorkspaceMembers
);
router.post(
  '/:workspaceId/invite',
  authenticate,
  validateParams(workspaceIdParamsSchema),
  canInviteMembers,
  validateBody(inviteMemberSchema),
  inviteMember
);
router.delete(
  '/:workspaceId/members/:memberId',
  authenticate,
  validateParams(workspaceMemberParamsSchema),
  revokeMember
);
router.patch(
  '/:workspaceId/members/:memberId',
  authenticate,
  validateParams(workspaceMemberParamsSchema),
  updateMember
);

export default router;
