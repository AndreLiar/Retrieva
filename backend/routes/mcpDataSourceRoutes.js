/**
 * MCP Data Source Routes
 *
 * All routes require authentication.
 * Workspace isolation is enforced by the controller via req.user.workspaceId.
 *
 * POST   /api/v1/mcp-sources                  Register a new MCP source
 * GET    /api/v1/mcp-sources                  List all MCP sources for the workspace
 * GET    /api/v1/mcp-sources/:id              Get a single MCP source
 * PATCH  /api/v1/mcp-sources/:id              Update connection settings / sync config
 * DELETE /api/v1/mcp-sources/:id              Remove MCP source + soft-delete its docs
 * POST   /api/v1/mcp-sources/test-connection  Test connectivity without persisting
 * POST   /api/v1/mcp-sources/:id/sync         Trigger a sync job
 * GET    /api/v1/mcp-sources/:id/stats        Document counts + sync stats
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  registerSource,
  listSources,
  getSource,
  updateSource,
  deleteSource,
  triggerSync,
  testConnection,
  getStats,
} from '../controllers/mcpDataSourceController.js';

const router = Router();

// All routes require a valid session
router.use(authenticate);

// Connection test — no :id param so must come before /:id routes
router.post('/test-connection', testConnection);

// Collection routes
router.route('/').get(listSources).post(registerSource);

// Member routes
router.route('/:id').get(getSource).patch(updateSource).delete(deleteSource);

router.post('/:id/sync', triggerSync);
router.get('/:id/stats', getStats);

export default router;
