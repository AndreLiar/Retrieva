import { NotionWorkspace } from '../models/NotionWorkspace.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import { DocumentSource } from '../models/DocumentSource.js';
import { SyncJob } from '../models/SyncJob.js';
import { notionOAuthService } from '../services/notionOAuth.js';
import { syncScheduler } from '../services/syncScheduler.js';
import { syncCooldownService } from '../services/syncCooldownService.js';
import { createAuthenticatedNotionAdapter } from '../services/adapterFactory.js';
import { catchAsync, sendSuccess, sendError } from '../utils/index.js';
import logger from '../config/logger.js';

/**
 * Get Notion OAuth authorization URL
 * GET /api/v1/notion/auth
 */
export const getAuthorizationUrl = catchAsync(async (req, res) => {
  const { redirectUrl } = req.query;
  const userId = req.user?.userId || 'default-user';

  const { authUrl, state } = notionOAuthService.getAuthorizationUrl(userId, redirectUrl);

  logger.info('Generated Notion OAuth URL', { userId });

  sendSuccess(res, 200, 'Authorization URL generated', { authUrl, state });
});

/**
 * Handle Notion OAuth callback
 * GET /api/v1/notion/callback
 */
export const handleOAuthCallback = catchAsync(async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return sendError(res, 400, 'Missing code or state parameter');
  }

  const stateData = notionOAuthService.validateState(state);
  const tokenData = await notionOAuthService.exchangeCodeForToken(code);

  let workspace = await NotionWorkspace.findOne({ workspaceId: tokenData.workspaceId });

  if (workspace) {
    // Update existing workspace with new token
    workspace.accessToken = tokenData.accessToken;
    workspace.workspaceName = tokenData.workspaceName;
    workspace.workspaceIcon = tokenData.workspaceIcon;
    workspace.botId = tokenData.botId;
    workspace.owner = tokenData.owner;
    workspace.syncStatus = 'active';
    await workspace.save();

    logger.info('Notion workspace reconnected', {
      userId: stateData.userId,
      workspaceId: workspace.workspaceId,
    });

    sendSuccess(res, 200, 'Notion workspace already connected - credentials updated', {
      workspace: {
        id: workspace._id,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        syncStatus: workspace.syncStatus,
        createdAt: workspace.createdAt,
      },
    });
  } else {
    workspace = await NotionWorkspace.create({
      userId: stateData.userId,
      workspaceId: tokenData.workspaceId,
      workspaceName: tokenData.workspaceName,
      workspaceIcon: tokenData.workspaceIcon,
      accessToken: tokenData.accessToken,
      botId: tokenData.botId,
      owner: tokenData.owner,
    });

    // AUTO-ADD OWNER AS WORKSPACE MEMBER
    // The user who connects the workspace becomes the owner with full permissions
    await WorkspaceMember.addOwner(workspace._id, stateData.userId);

    logger.info('Workspace owner membership created', {
      workspaceId: workspace._id,
      ownerId: stateData.userId,
    });

    await syncScheduler.scheduleWorkspaceSync(workspace.workspaceId);

    logger.info('Notion workspace connected', {
      userId: stateData.userId,
      workspaceId: workspace.workspaceId,
    });

    sendSuccess(res, 201, 'Notion workspace connected successfully', {
      workspace: {
        id: workspace._id,
        workspaceId: workspace.workspaceId,
        workspaceName: workspace.workspaceName,
        syncStatus: workspace.syncStatus,
        createdAt: workspace.createdAt,
      },
    });
  }
});

/**
 * Get all workspaces for a user
 * GET /api/v1/notion/workspaces
 */
export const getWorkspaces = catchAsync(async (req, res) => {
  const userId = req.user?.userId || 'default-user';

  const workspaces = await NotionWorkspace.find({ userId })
    .sort({ createdAt: -1 })
    .select('-accessToken');

  logger.info('Retrieved workspaces', { userId, count: workspaces.length });

  sendSuccess(res, 200, 'Workspaces retrieved successfully', { workspaces });
});

/**
 * Get workspace details
 * GET /api/v1/notion/workspaces/:id
 * Requires: loadWorkspaceSafe middleware
 */
export const getWorkspace = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  const [totalDocuments, syncedDocuments] = await Promise.all([
    DocumentSource.countDocuments({
      workspaceId: workspace.workspaceId,
      syncStatus: { $ne: 'deleted' },
    }),
    DocumentSource.countDocuments({
      workspaceId: workspace.workspaceId,
      syncStatus: 'synced',
    }),
  ]);

  logger.info('Retrieved workspace details', { workspaceId: workspace.workspaceId });

  sendSuccess(res, 200, 'Workspace retrieved successfully', {
    workspace,
    stats: { ...workspace.stats, totalDocuments, syncedDocuments },
  });
});

/**
 * Update workspace settings
 * PATCH /api/v1/notion/workspaces/:id
 * Requires: loadWorkspace middleware
 */
export const updateWorkspace = catchAsync(async (req, res) => {
  const workspace = req.workspace;
  const { syncScope, includedPages, excludedPages, syncSettings } = req.body;

  if (syncScope) workspace.syncScope = syncScope;
  if (includedPages) workspace.includedPages = includedPages;
  if (excludedPages) workspace.excludedPages = excludedPages;
  if (syncSettings) {
    workspace.syncSettings = { ...workspace.syncSettings, ...syncSettings };

    if (syncSettings.syncIntervalHours) {
      await syncScheduler.updateSyncSchedule(workspace.workspaceId, syncSettings.syncIntervalHours);
    }
  }

  await workspace.save();

  logger.info('Updated workspace settings', { workspaceId: workspace.workspaceId });

  sendSuccess(res, 200, 'Workspace updated successfully', {
    workspace: await NotionWorkspace.findById(workspace._id).select('-accessToken'),
  });
});

/**
 * Delete workspace
 * DELETE /api/v1/notion/workspaces/:id
 * Requires: loadWorkspace middleware
 */
export const deleteWorkspace = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  await syncScheduler.cancelScheduledSync(workspace.workspaceId);

  await DocumentSource.updateMany(
    { workspaceId: workspace.workspaceId },
    { syncStatus: 'deleted' }
  );

  await workspace.deleteOne();

  logger.info('Deleted workspace', { workspaceId: workspace.workspaceId });

  sendSuccess(res, 200, 'Workspace deleted successfully', { deletedId: workspace._id });
});

/**
 * Trigger workspace sync
 * POST /api/v1/notion/workspaces/:id/sync
 * Requires: loadWorkspace middleware
 *
 * SECURITY FIX (API6:2023): Per-workspace rate limiting to prevent:
 * - Notion API quota exhaustion
 * - Excessive sync operations impacting system performance
 */
export const triggerSync = catchAsync(async (req, res) => {
  const workspace = req.workspace;
  const { syncType = 'incremental', documentIds } = req.body;

  // Check if workspace is in cooldown period
  const cooldownStatus = await syncCooldownService.checkCooldown(workspace.workspaceId);

  if (!cooldownStatus.allowed) {
    logger.warn('Sync request blocked by cooldown', {
      workspaceId: workspace.workspaceId,
      remainingSeconds: cooldownStatus.remainingSeconds,
      lastSyncAt: cooldownStatus.lastSyncAt,
    });

    return sendError(
      res,
      429,
      'Sync cooldown active. Please wait before triggering another sync.',
      {
        remainingSeconds: cooldownStatus.remainingSeconds,
        lastSyncAt: cooldownStatus.lastSyncAt,
        cooldownConfig: syncCooldownService.getConfig(),
      }
    );
  }

  // Record sync to start cooldown period
  await syncCooldownService.recordSync(workspace.workspaceId);

  const jobInfo = await syncScheduler.triggerImmediateSync(
    workspace.workspaceId,
    syncType,
    'manual',
    { documentIds }
  );

  logger.info('Triggered manual sync', {
    workspaceId: workspace.workspaceId,
    jobId: jobInfo.jobId,
  });

  sendSuccess(res, 202, 'Sync job queued successfully', {
    ...jobInfo,
    cooldownConfig: syncCooldownService.getConfig(),
  });
});

/**
 * Get sync status for workspace
 * GET /api/v1/notion/workspaces/:id/sync-status
 * Requires: loadWorkspaceSafe middleware
 */
export const getSyncStatus = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  const [activeJobs, lastJob] = await Promise.all([
    SyncJob.getActiveJobs(workspace.workspaceId),
    SyncJob.findOne({ workspaceId: workspace.workspaceId }).sort({ createdAt: -1 }).limit(1),
  ]);

  sendSuccess(res, 200, 'Sync status retrieved', {
    workspace: {
      workspaceId: workspace.workspaceId,
      syncStatus: workspace.syncStatus,
      lastSyncAt: workspace.lastSyncAt,
      lastSuccessfulSyncAt: workspace.lastSuccessfulSyncAt,
    },
    activeJobs: activeJobs.map((job) => ({
      jobId: job.jobId,
      jobType: job.jobType,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
    })),
    lastJob: lastJob
      ? {
          jobId: lastJob.jobId,
          jobType: lastJob.jobType,
          status: lastJob.status,
          completedAt: lastJob.completedAt,
          duration: lastJob.duration,
          result: lastJob.result,
        }
      : null,
  });
});

/**
 * Get sync history for workspace
 * GET /api/v1/notion/workspaces/:id/sync-history
 * Requires: loadWorkspace middleware
 */
export const getSyncHistory = catchAsync(async (req, res) => {
  const workspace = req.workspace;
  const limit = parseInt(req.query.limit) || 20;

  const syncJobs = await SyncJob.getJobHistory(workspace.workspaceId, limit);

  sendSuccess(res, 200, 'Sync history retrieved', {
    workspaceId: workspace.workspaceId,
    syncJobs: syncJobs.map((job) => ({
      jobId: job.jobId,
      jobType: job.jobType,
      status: job.status,
      triggeredBy: job.triggeredBy,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      duration: job.duration,
      progress: job.progress,
      result: job.result,
      error: job.error,
    })),
  });
});

/**
 * List pages in workspace
 * GET /api/v1/notion/workspaces/:id/pages
 * Requires: loadWorkspace middleware
 */
export const listPages = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  const adapter = await createAuthenticatedNotionAdapter(workspace);
  const pages = await adapter.listPages();

  sendSuccess(res, 200, 'Pages retrieved successfully', {
    workspaceId: workspace.workspaceId,
    pages: pages.map((page) => ({
      id: page.id,
      title: adapter.extractTitle(page),
      url: page.url,
      lastEdited: page.last_edited_time,
      archived: page.archived,
    })),
  });
});

/**
 * List databases in workspace
 * GET /api/v1/notion/workspaces/:id/databases
 * Requires: loadWorkspace middleware
 */
export const listDatabases = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  const adapter = await createAuthenticatedNotionAdapter(workspace);
  const databases = await adapter.listDatabases();

  sendSuccess(res, 200, 'Databases retrieved successfully', {
    workspaceId: workspace.workspaceId,
    databases: databases.map((db) => ({
      id: db.id,
      title: adapter.extractTitle(db),
      url: db.url,
      lastEdited: db.last_edited_time,
      archived: db.archived,
    })),
  });
});

/**
 * Disconnect workspace (alias for delete)
 * POST /api/v1/notion/workspaces/:id/disconnect
 */
export const disconnectWorkspace = catchAsync(async (req, res) => {
  return deleteWorkspace(req, res);
});
