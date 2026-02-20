/**
 * MCP Data Source Service
 *
 * Orchestrates CRUD and sync operations for MCP-connected data sources.
 * Controllers call this; it talks to the database and the job queue.
 */

import { MCPDataSource } from '../models/MCPDataSource.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { mcpSyncQueue } from '../config/queue.js';
import { MCPDataSourceAdapter } from '../adapters/MCPDataSourceAdapter.js';
import { AppError } from '../utils/index.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Register a new MCP data source for a workspace.
 * Validates connectivity before persisting.
 *
 * @param {string} workspaceId
 * @param {Object} data - { name, sourceType, serverUrl, authToken?, syncSettings? }
 * @returns {Promise<MCPDataSource>}
 */
export async function registerMCPDataSource(workspaceId, data) {
  const { name, sourceType, serverUrl, authToken, syncSettings } = data;

  // Check for duplicate
  const existing = await MCPDataSource.findOne({ workspaceId, serverUrl });
  if (existing) {
    throw new AppError('An MCP data source with this server URL already exists.', 409);
  }

  // Probe the server before saving
  const adapter = new MCPDataSourceAdapter(serverUrl, authToken, sourceType);
  try {
    await adapter.authenticate();
    const info = await adapter.getWorkspaceInfo();
    logger.info('MCP server probe successful', {
      service: 'mcp-service',
      serverUrl,
      sourceType,
      info,
    });
  } catch (err) {
    throw new AppError(`Cannot connect to MCP server at ${serverUrl}: ${err.message}`, 422);
  } finally {
    await adapter.disconnect().catch(() => {});
  }

  const mcpSource = await MCPDataSource.create({
    workspaceId,
    name,
    sourceType,
    serverUrl,
    authToken: authToken || undefined,
    syncSettings: syncSettings || {},
  });

  return mcpSource;
}

/**
 * List all MCP data sources for a workspace.
 * Strips the encrypted authToken from the response.
 */
export async function listMCPDataSources(workspaceId) {
  const sources = await MCPDataSource.find({ workspaceId })
    .select('-authToken')
    .sort({ createdAt: -1 });
  return sources;
}

/**
 * Get a single MCP data source by ID (workspace-scoped).
 */
export async function getMCPDataSource(workspaceId, mcpDataSourceId) {
  const source = await MCPDataSource.findOne({ _id: mcpDataSourceId, workspaceId }).select(
    '-authToken'
  );
  if (!source) throw new AppError('MCP data source not found.', 404);
  return source;
}

/**
 * Update connection settings or sync configuration.
 * Triggers a connection probe if serverUrl or authToken changes.
 */
export async function updateMCPDataSource(workspaceId, mcpDataSourceId, updates) {
  const source = await MCPDataSource.findOne({ _id: mcpDataSourceId, workspaceId });
  if (!source) throw new AppError('MCP data source not found.', 404);

  const urlChanged = updates.serverUrl && updates.serverUrl !== source.serverUrl;
  const tokenChanged = updates.authToken !== undefined;

  if (urlChanged || tokenChanged) {
    const newUrl = updates.serverUrl ?? source.serverUrl;
    const newToken = tokenChanged ? updates.authToken : source.get('authToken');
    const adapter = new MCPDataSourceAdapter(newUrl, newToken, source.sourceType);
    try {
      await adapter.authenticate();
    } catch (err) {
      throw new AppError(`Cannot connect to MCP server at ${newUrl}: ${err.message}`, 422);
    } finally {
      await adapter.disconnect().catch(() => {});
    }
  }

  const allowed = ['name', 'serverUrl', 'authToken', 'syncSettings', 'syncStatus'];
  for (const key of allowed) {
    if (updates[key] !== undefined) source[key] = updates[key];
  }

  return source.save();
}

/**
 * Remove an MCP data source and its associated DocumentSource records.
 */
export async function deleteMCPDataSource(workspaceId, mcpDataSourceId) {
  const source = await MCPDataSource.findOne({ _id: mcpDataSourceId, workspaceId });
  if (!source) throw new AppError('MCP data source not found.', 404);

  // Soft-delete all indexed documents from this source
  await DocumentSource.updateMany(
    { workspaceId, sourceType: source.sourceType },
    { syncStatus: 'deleted' }
  );

  await MCPDataSource.deleteOne({ _id: mcpDataSourceId });

  logger.info('MCPDataSource deleted', {
    service: 'mcp-service',
    mcpDataSourceId,
    workspaceId,
    sourceType: source.sourceType,
  });
}

// ---------------------------------------------------------------------------
// Sync control
// ---------------------------------------------------------------------------

/**
 * Enqueue a sync job for the given MCP data source.
 *
 * @param {string} workspaceId
 * @param {string} mcpDataSourceId
 * @param {'full'|'incremental'} syncType
 * @param {'auto'|'manual'} triggeredBy
 * @returns {Promise<{ jobId: string }>}
 */
export async function triggerMCPSync(
  workspaceId,
  mcpDataSourceId,
  syncType = 'full',
  triggeredBy = 'manual'
) {
  const source = await MCPDataSource.findOne({ _id: mcpDataSourceId, workspaceId });
  if (!source) throw new AppError('MCP data source not found.', 404);

  if (source.syncStatus === 'syncing') {
    throw new AppError('A sync is already in progress for this source.', 409);
  }
  if (source.syncStatus === 'paused') {
    throw new AppError('This MCP data source is paused. Resume it before syncing.', 409);
  }

  const job = await mcpSyncQueue.add(
    'mcpSync',
    { mcpDataSourceId, workspaceId, syncType, triggeredBy },
    { jobId: `mcp-sync-${mcpDataSourceId}-${Date.now()}` }
  );

  logger.info('MCP sync job enqueued', {
    service: 'mcp-service',
    jobId: job.id,
    mcpDataSourceId,
    workspaceId,
    syncType,
  });

  return { jobId: job.id };
}

/**
 * Test connectivity to the remote MCP server without persisting anything.
 */
export async function testMCPConnection(serverUrl, authToken, sourceType = 'custom') {
  const adapter = new MCPDataSourceAdapter(serverUrl, authToken, sourceType);
  try {
    await adapter.authenticate();
    const info = await adapter.getWorkspaceInfo();
    return { ok: true, sourceInfo: info };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await adapter.disconnect().catch(() => {});
  }
}

/**
 * Return document counts indexed from an MCP source.
 */
export async function getMCPSourceStats(workspaceId, mcpDataSourceId) {
  const source = await getMCPDataSource(workspaceId, mcpDataSourceId);

  const counts = await DocumentSource.aggregate([
    { $match: { workspaceId, sourceType: source.sourceType } },
    { $group: { _id: '$syncStatus', count: { $sum: 1 } } },
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));

  return {
    source: source.name,
    sourceType: source.sourceType,
    syncStatus: source.syncStatus,
    lastSyncedAt: source.lastSyncedAt,
    stats: source.stats,
    documents: byStatus,
  };
}
