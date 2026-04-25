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

const router = express.Router();

// Public — no auth required (used by /join page to show org name before login)
router.get('/invite-info', getInviteInfo);

// Authenticated routes
router.post('/', authenticate, createOrganization);
router.get('/me', authenticate, getMyOrganization);
router.post('/invite', authenticate, inviteMember);
router.post('/accept-invite', authenticate, acceptInvite);
router.get('/members', authenticate, getMembers);
router.delete('/members/:memberId', authenticate, removeMember);

export default router;
