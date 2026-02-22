import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  requireOrgAccess,
  requireOrgAdmin,
  requireOrgOwner,
} from '../middleware/organizationAuth.js';
import {
  createOrg,
  listOrgs,
  getOrg,
  updateOrg,
  deleteOrg,
  getOrgMembers,
  inviteOrgMember,
  updateOrgMember,
  removeOrgMember,
  getOrgWorkspaces,
  linkWorkspace,
  unlinkWorkspace,
} from '../controllers/organizationController.js';

const router = Router();

// All organization routes require authentication
router.use(authenticate);

// Organization CRUD
router.post('/', createOrg);
router.get('/', listOrgs);
router.get('/:id', requireOrgAccess, getOrg);
router.patch('/:id', requireOrgAdmin, updateOrg);
router.delete('/:id', requireOrgOwner, deleteOrg);

// Member management
router.get('/:id/members', requireOrgAccess, getOrgMembers);
router.post('/:id/invite', requireOrgAdmin, inviteOrgMember);
router.patch('/:id/members/:memberId', requireOrgAdmin, updateOrgMember);
router.delete('/:id/members/:memberId', requireOrgAdmin, removeOrgMember);

// Workspace linking
router.get('/:id/workspaces', requireOrgAccess, getOrgWorkspaces);
router.post('/:id/workspaces', requireOrgAdmin, linkWorkspace);
router.delete('/:id/workspaces/:wsId', requireOrgAdmin, unlinkWorkspace);

export default router;
