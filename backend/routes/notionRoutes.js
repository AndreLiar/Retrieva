import express from 'express';
import {
  getAuthorizationUrl,
  handleOAuthCallback,
  getWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  triggerSync,
  getSyncStatus,
  getSyncMetricsEndpoint,
  getSyncHistory,
  listPages,
  listDatabases,
  disconnectWorkspace,
  getTokenHealth,
  checkWorkspaceToken,
  updateTokenPreference,
} from '../controllers/notionController.js';
import { authenticate } from '../middleware/auth.js';
import { loadWorkspace, loadWorkspaceSafe } from '../middleware/loadWorkspace.js';

const router = express.Router();

// OAuth flow routes
// Auth URL requires authentication (user must be logged in to connect workspace)
router.get('/auth', authenticate, getAuthorizationUrl);
// Callback is called by Notion, uses state token to identify user
router.get('/callback', handleOAuthCallback);

// Workspace management routes (require authentication)
router.get('/workspaces', authenticate, getWorkspaces);
router.get('/workspaces/:id', authenticate, loadWorkspaceSafe, getWorkspace);
router.patch('/workspaces/:id', authenticate, loadWorkspace, updateWorkspace);
router.delete('/workspaces/:id', authenticate, loadWorkspace, deleteWorkspace);
router.post('/workspaces/:id/disconnect', authenticate, loadWorkspace, disconnectWorkspace);

// Sync management routes (require authentication)
router.post('/workspaces/:id/sync', authenticate, loadWorkspace, triggerSync);
router.get('/workspaces/:id/sync-status', authenticate, loadWorkspaceSafe, getSyncStatus);
router.get('/workspaces/:id/sync-metrics', authenticate, loadWorkspaceSafe, getSyncMetricsEndpoint);
router.get('/workspaces/:id/sync-history', authenticate, loadWorkspace, getSyncHistory);

// Document selection routes (require authentication)
router.get('/workspaces/:id/pages', authenticate, loadWorkspace, listPages);
router.get('/workspaces/:id/databases', authenticate, loadWorkspace, listDatabases);

// Token health routes (require authentication)
router.get('/token-health', authenticate, getTokenHealth);
router.post('/workspaces/:id/check-token', authenticate, loadWorkspace, checkWorkspaceToken);
router.patch('/token-preference', authenticate, updateTokenPreference);

export default router;
