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
import { getDetailedSyncMetrics, getGlobalMetrics } from '../services/metrics/syncMetrics.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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
 *
 * After processing OAuth, redirects to frontend with workspace info
 */
export const handleOAuthCallback = catchAsync(async (req, res) => {
  const { code, state, error, error_description } = req.query;

  // Handle OAuth errors from Notion
  if (error) {
    logger.warn('Notion OAuth error', { error, error_description });
    const errorUrl = new URL('/workspaces', FRONTEND_URL);
    errorUrl.searchParams.set('error', error);
    if (error_description) {
      errorUrl.searchParams.set('error_description', error_description);
    }
    return res.redirect(errorUrl.toString());
  }

  if (!code || !state) {
    const errorUrl = new URL('/workspaces', FRONTEND_URL);
    errorUrl.searchParams.set('error', 'missing_params');
    errorUrl.searchParams.set('error_description', 'Missing code or state parameter');
    return res.redirect(errorUrl.toString());
  }

  try {
    const stateData = notionOAuthService.validateState(state);
    const tokenData = await notionOAuthService.exchangeCodeForToken(code);

    let workspace = await NotionWorkspace.findOne({ workspaceId: tokenData.workspaceId });
    let isNew = false;

    if (workspace) {
      // Update existing workspace with new token
      workspace.accessToken = tokenData.accessToken;
      workspace.workspaceName = tokenData.workspaceName;
      workspace.workspaceIcon = tokenData.workspaceIcon;
      workspace.botId = tokenData.botId;
      workspace.owner = tokenData.owner;
      workspace.syncStatus = 'active';
      await workspace.save();

      // Ensure user has membership (in case it was missing)
      const existingMembership = await WorkspaceMember.findOne({
        workspaceId: workspace._id,
        userId: stateData.userId,
      });

      if (!existingMembership) {
        await WorkspaceMember.addOwner(workspace._id, stateData.userId);
        logger.info('Created missing workspace membership on reconnect', {
          workspaceId: workspace._id,
          userId: stateData.userId,
        });
      }

      logger.info('Notion workspace reconnected', {
        userId: stateData.userId,
        workspaceId: workspace.workspaceId,
      });
    } else {
      isNew = true;
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
    }

    // Redirect to frontend workspaces page with success info
    const successUrl = new URL('/workspaces', FRONTEND_URL);
    successUrl.searchParams.set('connected', 'true');
    successUrl.searchParams.set('workspace_id', workspace._id.toString());
    successUrl.searchParams.set('workspace_name', workspace.workspaceName || 'Notion Workspace');
    if (isNew) {
      successUrl.searchParams.set('new', 'true');
    }

    return res.redirect(successUrl.toString());
  } catch (err) {
    logger.error('OAuth callback processing failed', { error: err.message });
    const errorUrl = new URL('/workspaces', FRONTEND_URL);
    errorUrl.searchParams.set('error', 'processing_failed');
    errorUrl.searchParams.set('error_description', err.message);
    return res.redirect(errorUrl.toString());
  }
});

/**
 * Get all workspaces for a user
 * GET /api/v1/notion/workspaces
 */
export const getWorkspaces = catchAsync(async (req, res) => {
  const userId = req.user?.userId || 'default-user';

  // ISSUE #22 FIX: Use .lean() for read-only query
  const rawWorkspaces = await NotionWorkspace.find({ userId })
    .sort({ createdAt: -1 })
    .select('-accessToken')
    .lean();

  // Get user's membership for each workspace to include role and permissions
  const workspaceIds = rawWorkspaces.map((ws) => ws._id);
  const memberships = await WorkspaceMember.find({
    workspaceId: { $in: workspaceIds },
    userId,
  }).lean();

  // Create a map for quick lookup
  const membershipMap = new Map();
  memberships.forEach((m) => {
    membershipMap.set(m.workspaceId.toString(), m);
  });

  // Transform to frontend expected format with membership info
  const workspaces = rawWorkspaces.map((ws) => {
    const membership = membershipMap.get(ws._id.toString());
    // If user created this workspace, they're the owner
    const isCreator = ws.userId === userId;
    const role = membership?.role || (isCreator ? 'owner' : 'member');
    const permissions = membership?.permissions || {
      canQuery: true,
      canViewSources: true,
      canInvite: role === 'owner',
    };

    return {
      id: ws._id.toString(),
      notionWorkspaceId: ws.workspaceId,
      workspaceId: ws.workspaceId,
      name: ws.workspaceName,
      icon: ws.workspaceIcon,
      syncStatus: ws.syncStatus || 'idle',
      lastSyncAt: ws.lastSyncAt,
      lastSyncError: ws.lastSyncError,
      pagesCount: ws.stats?.totalPages || 0,
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
      // Add membership info for frontend permission checks
      myRole: role,
      role: role,
      permissions,
    };
  });

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

  // Transform to frontend expected format
  const transformedWorkspace = {
    id: workspace._id.toString(),
    notionWorkspaceId: workspace.workspaceId,
    workspaceId: workspace.workspaceId,
    name: workspace.workspaceName,
    icon: workspace.workspaceIcon,
    syncStatus: workspace.syncStatus || 'idle',
    lastSyncAt: workspace.lastSyncAt,
    lastSyncError: workspace.lastSyncError,
    pagesCount: workspace.stats?.totalPages || 0,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };

  sendSuccess(res, 200, 'Workspace retrieved successfully', {
    workspace: transformedWorkspace,
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
  // Support both 'fullSync: true' (frontend) and 'syncType: full' (API) formats
  const { fullSync, syncType: explicitSyncType, documentIds } = req.body;
  const syncType = fullSync === true ? 'full' : (explicitSyncType || 'incremental');

  // Check if there's already an active sync job for this workspace
  const activeJobs = await SyncJob.getActiveJobs(workspace.workspaceId);
  if (activeJobs && activeJobs.length > 0) {
    const activeJob = activeJobs[0];
    logger.warn('Sync request blocked - job already in progress', {
      workspaceId: workspace.workspaceId,
      activeJobId: activeJob.jobId,
      activeJobStatus: activeJob.status,
      startedAt: activeJob.startedAt,
    });

    return sendError(
      res,
      409,
      'A sync job is already in progress for this workspace.',
      {
        activeJobId: activeJob.jobId,
        status: activeJob.status,
        progress: activeJob.progress,
        startedAt: activeJob.startedAt,
      }
    );
  }

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

  // Get detailed metrics if available
  const detailedMetrics = getDetailedSyncMetrics(workspace.workspaceId);

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
    // Phase 4: Detailed sync metrics
    metrics: detailedMetrics,
  });
});

/**
 * Get detailed sync metrics for workspace
 * GET /api/v1/notion/workspaces/:id/sync-metrics
 * Requires: loadWorkspaceSafe middleware
 */
export const getSyncMetricsEndpoint = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  const detailedMetrics = getDetailedSyncMetrics(workspace.workspaceId);
  const globalMetrics = getGlobalMetrics();

  if (!detailedMetrics) {
    return sendSuccess(res, 200, 'No active sync', {
      hasActiveSync: false,
      globalMetrics,
    });
  }

  sendSuccess(res, 200, 'Sync metrics retrieved', {
    hasActiveSync: true,
    metrics: detailedMetrics,
    globalMetrics,
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

  // Sort: processing/queued jobs first, then by createdAt descending
  const sortedJobs = [...syncJobs].sort((a, b) => {
    const aActive = ['processing', 'queued'].includes(a.status);
    const bActive = ['processing', 'queued'].includes(b.status);
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  // Transform to match frontend SyncJob type expectations
  sendSuccess(res, 200, 'Sync history retrieved', {
    workspaceId: workspace.workspaceId,
    syncJobs: sortedJobs.map((job) => ({
      id: job.jobId,
      jobId: job.jobId,
      notionWorkspaceId: job.workspaceId,
      jobType: job.jobType,
      status: job.status === 'queued' ? 'pending' : job.status,
      triggeredBy: job.triggeredBy,
      pagesProcessed: job.progress?.processedDocuments || 0,
      totalPages: job.progress?.totalDocuments || 0,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      duration: job.duration,
      progress: job.progress,
      result: job.result,
      error: job.error?.message || null,
      createdAt: job.createdAt,
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

/**
 * Get token health for all user workspaces
 * GET /api/v1/notion/token-health
 */
export const getTokenHealth = catchAsync(async (req, res) => {
  const userId = req.user?.userId;

  // Dynamic import to avoid circular dependency
  const { notionTokenMonitor } = await import('../services/notionTokenMonitor.js');
  const tokenHealth = await notionTokenMonitor.getUserTokenHealth(userId);

  sendSuccess(res, 200, 'Token health retrieved', {
    workspaces: tokenHealth,
    hasIssues: tokenHealth.some((ws) => ws.needsReconnect),
  });
});

/**
 * Check token for a specific workspace
 * POST /api/v1/notion/workspaces/:id/check-token
 */
export const checkWorkspaceToken = catchAsync(async (req, res) => {
  const workspace = req.workspace;

  // Dynamic import to avoid circular dependency
  const { notionTokenMonitor } = await import('../services/notionTokenMonitor.js');
  const result = await notionTokenMonitor.checkWorkspace(workspace._id.toString());

  sendSuccess(res, 200, 'Token check completed', result);
});

/**
 * Update user's token handling preference
 * PATCH /api/v1/notion/token-preference
 */
export const updateTokenPreference = catchAsync(async (req, res) => {
  const userId = req.user?.userId;
  const { preference } = req.body;

  if (!preference || !['notify', 'auto_reconnect'].includes(preference)) {
    return sendError(res, 400, 'Invalid preference. Must be "notify" or "auto_reconnect"');
  }

  // Dynamic import to avoid circular dependency
  const { User } = await import('../models/User.js');
  await User.updateOne({ _id: userId }, { $set: { notionTokenPreference: preference } });

  logger.info('Updated token preference', { userId, preference });

  sendSuccess(res, 200, 'Token preference updated', { preference });
});
