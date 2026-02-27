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
router.use(authenticate);

router.post('/', createOrganization);
router.get('/me', getMyOrganization);
router.post('/invite', inviteMember);
router.post('/accept-invite', acceptInvite);
router.get('/members', getMembers);
router.delete('/members/:memberId', removeMember);

export default router;
