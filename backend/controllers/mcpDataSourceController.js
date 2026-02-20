/**
 * MCP Data Source Controller
 *
 * REST handler layer — delegates everything to mcpDataSourceService.
 * All routes are workspace-scoped via req.user.workspaceId (set by auth middleware).
 */

import { catchAsync } from '../utils/index.js';
import { sendSuccess } from '../utils/index.js';
import * as mcpService from '../services/mcpDataSourceService.js';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/mcp-sources
 * Register a new MCP data source and verify connectivity.
 */
export const registerSource = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const { name, sourceType, serverUrl, authToken, syncSettings } = req.body;

  const source = await mcpService.registerMCPDataSource(workspaceId, {
    name,
    sourceType,
    serverUrl,
    authToken,
    syncSettings,
  });

  sendSuccess(res, 201, 'MCP data source registered', { source });
});

/**
 * GET /api/v1/mcp-sources
 * List all MCP data sources for the current workspace.
 */
export const listSources = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const sources = await mcpService.listMCPDataSources(workspaceId);
  sendSuccess(res, 200, 'MCP data sources retrieved', { sources });
});

/**
 * GET /api/v1/mcp-sources/:id
 * Get a single MCP data source.
 */
export const getSource = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const source = await mcpService.getMCPDataSource(workspaceId, req.params.id);
  sendSuccess(res, 200, 'MCP data source retrieved', { source });
});

/**
 * PATCH /api/v1/mcp-sources/:id
 * Update connection settings or sync config.
 */
export const updateSource = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const source = await mcpService.updateMCPDataSource(workspaceId, req.params.id, req.body);
  sendSuccess(res, 200, 'MCP data source updated', { source });
});

/**
 * DELETE /api/v1/mcp-sources/:id
 * Remove the MCP data source and soft-delete its indexed documents.
 */
export const deleteSource = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  await mcpService.deleteMCPDataSource(workspaceId, req.params.id);
  sendSuccess(res, 200, 'MCP data source deleted');
});

// ---------------------------------------------------------------------------
// Sync & testing
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/mcp-sources/:id/sync
 * Trigger a manual sync (full or incremental).
 * Body: { syncType?: 'full' | 'incremental' }
 */
export const triggerSync = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const syncType = req.body.syncType ?? 'full';
  const result = await mcpService.triggerMCPSync(workspaceId, req.params.id, syncType, 'manual');
  sendSuccess(res, 202, 'MCP sync job queued', result);
});

/**
 * POST /api/v1/mcp-sources/test-connection
 * Test a connection to a candidate MCP server without persisting anything.
 * Body: { serverUrl, authToken?, sourceType? }
 */
export const testConnection = catchAsync(async (req, res) => {
  const { serverUrl, authToken, sourceType } = req.body;
  const result = await mcpService.testMCPConnection(serverUrl, authToken, sourceType);
  const status = result.ok ? 200 : 422;
  sendSuccess(res, status, result.ok ? 'Connection successful' : 'Connection failed', result);
});

/**
 * GET /api/v1/mcp-sources/:id/stats
 * Return document counts and sync statistics.
 */
export const getStats = catchAsync(async (req, res) => {
  const workspaceId = req.user.workspaceId;
  const stats = await mcpService.getMCPSourceStats(workspaceId, req.params.id);
  sendSuccess(res, 200, 'MCP data source stats', stats);
});
