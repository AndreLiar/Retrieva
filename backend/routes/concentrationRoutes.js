import { Router } from 'express';
import {
  getConcentration,
  getCriticalFunctions,
  createOrUpdateCriticalFunction,
  removeCriticalFunction,
  getDependencies,
  confirmDependency,
  extractSubProviders,
} from '../controllers/concentrationController.js';
import { authenticate } from '../middleware/auth.js';

// DORA concentration & nth-party graph (RTV-15). ORG-scoped — every handler keys off
// req.user.organizationId, so no per-workspace access middleware is needed (and must
// not be used: concentration deliberately spans all the firm's vendors).
const router = Router();

// GET /api/v1/concentration — org concentration analysis (providers, SPOF, substrate, coverage)
router.get('/', authenticate, getConcentration);

// Critical Functions (firm-owned governance)
router.get('/functions', authenticate, getCriticalFunctions);
router.post('/functions', authenticate, createOrUpdateCriticalFunction);
router.delete('/functions/:id', authenticate, removeCriticalFunction);

// nth-party dependency edges + human confirmation of AI-extracted ones
router.get('/dependencies', authenticate, getDependencies);
router.patch('/dependencies/:id', authenticate, confirmDependency);

// Auto-extract sub-provider edges for a workspace from its vendor docs (unconfirmed)
router.post('/extract/:workspaceId', authenticate, extractSubProviders);

export default router;
