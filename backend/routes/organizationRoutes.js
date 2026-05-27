import express from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createOrganization,
  getMyOrganization,
  getInviteInfo,
  inviteMember,
  acceptInvite,
  getMembers,
  removeMember,
} from '../controllers/organizationController.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createOrganizationSchema,
  inviteOrgMemberSchema,
  acceptOrgInviteSchema,
  orgInviteInfoQuerySchema,
  memberIdParamsSchema,
} from '../validators/schemas.js';

const router = express.Router();

// Public — no auth required (used by /join page to show org name before login)
router.get('/invite-info', validateQuery(orgInviteInfoQuerySchema), getInviteInfo);

// Authenticated routes
router.post('/', authenticate, validateBody(createOrganizationSchema), createOrganization);
router.get('/me', authenticate, getMyOrganization);
router.post('/invite', authenticate, validateBody(inviteOrgMemberSchema), inviteMember);
router.post(
  '/accept-invite',
  authenticate,
  validateBody(acceptOrgInviteSchema),
  acceptInvite
);
router.get('/members', authenticate, getMembers);
router.delete(
  '/members/:memberId',
  authenticate,
  validateParams(memberIdParamsSchema),
  removeMember
);

export default router;
