/**
 * Real-time Events Service
 *
 * Centralized event emitter for real-time features
 * Provides typed events for:
 * - RAG query streaming
 * - Notion sync progress
 * - Notifications
 * - Presence updates
 *
 * @module services/realtimeEvents
 */

import { redisConnection } from '../config/redis.js';
import logger from '../config/logger.js';

// ---------------------------------------------------------------------------
// Internal pub/sub helpers
//
// Events are published to Redis instead of calling socketService functions
// directly. socketService.js subscribes to realtime:* and forwards to
// Socket.io rooms. This decouples event producers from the WebSocket server,
// so the Real-time Service can later be extracted to a separate process
// without changing any callsite in this file.
//
// Channel format:
//   realtime:user:{userId}           → io.to('user:{id}').emit(event, data)
//   realtime:workspace:{workspaceId} → io.to('workspace:{id}').emit(...)
//   realtime:query:{queryId}         → io.to('query:{id}').emit(...)
// ---------------------------------------------------------------------------

function publishEvent(channel, event, data) {
  redisConnection.publish(channel, JSON.stringify({ event, data })).catch((err) => {
    logger.error('Failed to publish realtime event', {
      service: 'realtime',
      channel,
      event,
      error: err.message,
    });
  });
}

function emitToUser(userId, event, data) {
  publishEvent(`realtime:user:${userId}`, event, data);
}

function emitToWorkspace(workspaceId, event, data) {
  publishEvent(`realtime:workspace:${workspaceId}`, event, data);
}

function emitToQuery(queryId, event, data) {
  publishEvent(`realtime:query:${queryId}`, event, data);
}

/**
 * Event Types Constants
 */
export const EventTypes = {
  // RAG Query Events
  QUERY_START: 'query:start',
  QUERY_THINKING: 'query:thinking',
  QUERY_RETRIEVING: 'query:retrieving',
  QUERY_STREAM: 'query:stream',
  QUERY_SOURCES: 'query:sources',
  QUERY_COMPLETE: 'query:complete',
  QUERY_ERROR: 'query:error',

  // Sync Events
  SYNC_START: 'sync:start',
  SYNC_PROGRESS: 'sync:progress',
  SYNC_PAGE_FETCHED: 'sync:page-fetched',
  SYNC_INDEXING: 'sync:indexing',
  SYNC_COMPLETE: 'sync:complete',
  SYNC_ERROR: 'sync:error',

  // Notification Events
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_INVITATION: 'notification:invitation',
  NOTIFICATION_PERMISSION_CHANGE: 'notification:permission-change',
  NOTIFICATION_REMOVED: 'notification:removed',

  // Presence Events
  PRESENCE_ONLINE: 'presence:online',
  PRESENCE_OFFLINE: 'presence:offline',
  PRESENCE_TYPING: 'presence:typing',

  // Workspace Events
  WORKSPACE_UPDATED: 'workspace:updated',
  WORKSPACE_MEMBER_JOINED: 'workspace:member-joined',
  WORKSPACE_MEMBER_LEFT: 'workspace:member-left',

  // Activity Feed Events
  ACTIVITY_NEW: 'activity:new',
  ACTIVITY_QUERY: 'activity:query',
  ACTIVITY_SYNC: 'activity:sync',
  ACTIVITY_MEMBER: 'activity:member',
};

// ============================================================================
// RAG Query Events
// ============================================================================

/**
 * Emit query start event
 *
 * @param {string} queryId - Unique query ID
 * @param {string} userId - User who initiated query
 * @param {Object} data - Query data
 */
export function emitQueryStart(queryId, userId, data) {
  const payload = {
    queryId,
    question: data.question,
    timestamp: new Date().toISOString(),
    stage: 'starting',
  };

  emitToUser(userId, EventTypes.QUERY_START, payload);
  emitToQuery(queryId, EventTypes.QUERY_START, payload);

  logger.debug('Query start event emitted', {
    service: 'realtime',
    queryId,
    userId,
  });
}

/**
 * Emit thinking/processing indicator
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {string} message - Thinking message
 */
export function emitQueryThinking(queryId, userId, message = 'Processing your question...') {
  const payload = {
    queryId,
    message,
    timestamp: new Date().toISOString(),
    stage: 'thinking',
  };

  emitToUser(userId, EventTypes.QUERY_THINKING, payload);
  emitToQuery(queryId, EventTypes.QUERY_THINKING, payload);
}

/**
 * Emit retrieving documents indicator
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {Object} data - Retrieval info
 */
export function emitQueryRetrieving(queryId, userId, data = {}) {
  const payload = {
    queryId,
    message: data.message || 'Searching documents...',
    documentsFound: data.documentsFound || 0,
    timestamp: new Date().toISOString(),
    stage: 'retrieving',
  };

  emitToUser(userId, EventTypes.QUERY_RETRIEVING, payload);
  emitToQuery(queryId, EventTypes.QUERY_RETRIEVING, payload);
}

/**
 * Stream answer token/chunk
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {string} token - Text token/chunk
 * @param {boolean} [isDone=false] - Is this the final chunk
 */
export function emitQueryStream(queryId, userId, token, isDone = false) {
  const payload = {
    queryId,
    token,
    isDone,
    timestamp: new Date().toISOString(),
    stage: 'streaming',
  };

  emitToUser(userId, EventTypes.QUERY_STREAM, payload);
  emitToQuery(queryId, EventTypes.QUERY_STREAM, payload);
}

/**
 * Emit sources/citations for the answer
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {Array} sources - Source documents
 */
export function emitQuerySources(queryId, userId, sources) {
  const payload = {
    queryId,
    sources: sources.map((s) => ({
      title: s.title || s.metadata?.title,
      pageId: s.pageId || s.metadata?.pageId,
      url: s.url || s.metadata?.url,
      relevanceScore: s.score || s.relevanceScore,
    })),
    timestamp: new Date().toISOString(),
    stage: 'sources',
  };

  emitToUser(userId, EventTypes.QUERY_SOURCES, payload);
  emitToQuery(queryId, EventTypes.QUERY_SOURCES, payload);
}

/**
 * Emit query completion
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {Object} result - Final result
 */
export function emitQueryComplete(queryId, userId, result) {
  const payload = {
    queryId,
    answer: result.answer,
    sources: result.sources,
    confidence: result.confidence,
    processingTime: result.processingTime,
    timestamp: new Date().toISOString(),
    stage: 'complete',
  };

  emitToUser(userId, EventTypes.QUERY_COMPLETE, payload);
  emitToQuery(queryId, EventTypes.QUERY_COMPLETE, payload);

  logger.debug('Query complete event emitted', {
    service: 'realtime',
    queryId,
    userId,
    processingTime: result.processingTime,
  });
}

/**
 * Emit query error
 *
 * @param {string} queryId - Query ID
 * @param {string} userId - User ID
 * @param {Error|string} error - Error object or message
 */
export function emitQueryError(queryId, userId, error) {
  const payload = {
    queryId,
    error: error.message || error,
    timestamp: new Date().toISOString(),
    stage: 'error',
  };

  emitToUser(userId, EventTypes.QUERY_ERROR, payload);
  emitToQuery(queryId, EventTypes.QUERY_ERROR, payload);

  logger.error('Query error event emitted', {
    service: 'realtime',
    queryId,
    userId,
    error: error.message || error,
  });
}

// ============================================================================
// Sync Progress Events
// ============================================================================

/**
 * Emit sync start event
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} userId - User who initiated sync
 * @param {Object} data - Sync data
 */
export function emitSyncStart(workspaceId, userId, data = {}) {
  const payload = {
    workspaceId,
    jobId: data.jobId,
    syncType: data.syncType || 'full',
    timestamp: new Date().toISOString(),
    stage: 'starting',
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_START, payload);
  emitToUser(userId, EventTypes.SYNC_START, payload);

  logger.info('Sync start event emitted', {
    service: 'realtime',
    workspaceId,
    jobId: data.jobId,
  });
}

/**
 * Emit sync progress update
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} progress - Progress data
 */
export function emitSyncProgress(workspaceId, progress) {
  const payload = {
    workspaceId,
    phase: progress.phase, // 'fetching' | 'indexing' | 'finalizing'
    current: progress.current,
    total: progress.total,
    percentage: progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0,
    message: progress.message,
    timestamp: new Date().toISOString(),
    stage: 'progress',
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_PROGRESS, payload);

  logger.debug('Sync progress event emitted', {
    service: 'realtime',
    workspaceId,
    phase: progress.phase,
    percentage: payload.percentage,
  });
}

/**
 * Emit individual page fetched event
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} page - Page data
 */
export function emitSyncPageFetched(workspaceId, page) {
  const payload = {
    workspaceId,
    pageId: page.pageId,
    title: page.title,
    status: page.status, // 'success' | 'error' | 'skipped'
    error: page.error,
    timestamp: new Date().toISOString(),
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_PAGE_FETCHED, payload);
}

/**
 * Emit indexing progress
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} data - Indexing data
 */
export function emitSyncIndexing(workspaceId, data) {
  const payload = {
    workspaceId,
    documentsIndexed: data.documentsIndexed,
    totalDocuments: data.totalDocuments,
    percentage:
      data.totalDocuments > 0 ? Math.round((data.documentsIndexed / data.totalDocuments) * 100) : 0,
    currentDocument: data.currentDocument,
    timestamp: new Date().toISOString(),
    stage: 'indexing',
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_INDEXING, payload);
}

/**
 * Emit sync completion
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} result - Sync result summary
 */
export function emitSyncComplete(workspaceId, result) {
  const payload = {
    workspaceId,
    jobId: result.jobId,
    totalPages: result.totalPages,
    successCount: result.successCount,
    errorCount: result.errorCount,
    skippedCount: result.skippedCount,
    duration: result.duration,
    timestamp: new Date().toISOString(),
    stage: 'complete',
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_COMPLETE, payload);

  logger.info('Sync complete event emitted', {
    service: 'realtime',
    workspaceId,
    totalPages: result.totalPages,
    duration: result.duration,
  });
}

/**
 * Emit sync error
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Error|string} error - Error object or message
 * @param {Object} [data] - Additional error data
 */
export function emitSyncError(workspaceId, error, data = {}) {
  const payload = {
    workspaceId,
    jobId: data.jobId,
    error: error.message || error,
    phase: data.phase,
    recoverable: data.recoverable !== false,
    timestamp: new Date().toISOString(),
    stage: 'error',
  };

  emitToWorkspace(workspaceId, EventTypes.SYNC_ERROR, payload);

  logger.error('Sync error event emitted', {
    service: 'realtime',
    workspaceId,
    error: error.message || error,
  });
}

// ============================================================================
// Notification Events
// ============================================================================

/**
 * Emit workspace invitation notification
 *
 * @param {string} userId - Invited user ID
 * @param {Object} data - Invitation data
 */
export function emitInvitationNotification(userId, data) {
  const payload = {
    type: 'invitation',
    workspaceId: data.workspaceId,
    workspaceName: data.workspaceName,
    inviterName: data.inviterName,
    role: data.role,
    timestamp: new Date().toISOString(),
  };

  emitToUser(userId, EventTypes.NOTIFICATION_INVITATION, payload);

  logger.info('Invitation notification emitted', {
    service: 'realtime',
    userId,
    workspaceName: data.workspaceName,
  });
}

/**
 * Emit permission change notification
 *
 * @param {string} userId - Affected user ID
 * @param {Object} data - Permission change data
 */
export function emitPermissionChangeNotification(userId, data) {
  const payload = {
    type: 'permission_change',
    workspaceId: data.workspaceId,
    workspaceName: data.workspaceName,
    oldRole: data.oldRole,
    newRole: data.newRole,
    changedBy: data.changedBy,
    timestamp: new Date().toISOString(),
  };

  emitToUser(userId, EventTypes.NOTIFICATION_PERMISSION_CHANGE, payload);
}

/**
 * Emit removed from workspace notification
 *
 * @param {string} userId - Removed user ID
 * @param {Object} data - Removal data
 */
export function emitRemovedNotification(userId, data) {
  const payload = {
    type: 'removed',
    workspaceId: data.workspaceId,
    workspaceName: data.workspaceName,
    removedBy: data.removedBy,
    timestamp: new Date().toISOString(),
  };

  emitToUser(userId, EventTypes.NOTIFICATION_REMOVED, payload);
}

/**
 * Emit generic notification
 *
 * @param {string} userId - Target user ID
 * @param {Object} notification - Notification data
 */
export function emitNotification(userId, notification) {
  const payload = {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    timestamp: new Date().toISOString(),
  };

  emitToUser(userId, EventTypes.NOTIFICATION_NEW, payload);
}

// ============================================================================
// Workspace Events
// ============================================================================

/**
 * Emit new member joined workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} member - New member data
 */
export function emitMemberJoined(workspaceId, member) {
  const payload = {
    workspaceId,
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    timestamp: new Date().toISOString(),
  };

  emitToWorkspace(workspaceId, EventTypes.WORKSPACE_MEMBER_JOINED, payload);
}

/**
 * Emit member left workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} member - Member who left
 */
export function emitMemberLeft(workspaceId, member) {
  const payload = {
    workspaceId,
    userId: member.userId,
    name: member.name,
    reason: member.reason, // 'left' | 'removed'
    timestamp: new Date().toISOString(),
  };

  emitToWorkspace(workspaceId, EventTypes.WORKSPACE_MEMBER_LEFT, payload);
}

/**
 * Emit workspace update
 *
 * @param {string} workspaceId - Workspace ID
 * @param {Object} changes - What changed
 */
export function emitWorkspaceUpdated(workspaceId, changes) {
  const payload = {
    workspaceId,
    changes,
    timestamp: new Date().toISOString(),
  };

  emitToWorkspace(workspaceId, EventTypes.WORKSPACE_UPDATED, payload);
}

// Export all event functions
export const realtimeEvents = {
  EventTypes,
  // Query events
  emitQueryStart,
  emitQueryThinking,
  emitQueryRetrieving,
  emitQueryStream,
  emitQuerySources,
  emitQueryComplete,
  emitQueryError,
  // Sync events
  emitSyncStart,
  emitSyncProgress,
  emitSyncPageFetched,
  emitSyncIndexing,
  emitSyncComplete,
  emitSyncError,
  // Notifications
  emitInvitationNotification,
  emitPermissionChangeNotification,
  emitRemovedNotification,
  emitNotification,
  // Workspace events
  emitMemberJoined,
  emitMemberLeft,
  emitWorkspaceUpdated,
};

export default realtimeEvents;
