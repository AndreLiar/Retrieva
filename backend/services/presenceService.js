/**
 * Presence Service
 *
 * Tracks user online status and presence in workspaces:
 * - Real-time online/offline status
 * - Workspace presence (who's viewing which workspace)
 * - Last seen timestamps
 * - Typing indicators
 *
 * @module services/presenceService
 */

import { emitToWorkspace, emitToUser } from './socketService.js';
import { WorkspaceMember } from '../models/WorkspaceMember.js';
import logger from '../config/logger.js';

// ============================================================================
// In-Memory Presence Store
// ============================================================================

// Map of userId -> Set of workspaceIds they're viewing
const userWorkspaces = new Map();

// Map of workspaceId -> Map of userId -> presence info
const workspacePresence = new Map();

// Map of userId -> user presence info (status, lastSeen, socketIds)
const userPresence = new Map();

// User status types
export const UserStatus = {
  ONLINE: 'online',
  AWAY: 'away',
  BUSY: 'busy',
  OFFLINE: 'offline',
};

// Presence event types
export const PresenceEventTypes = {
  USER_ONLINE: 'presence:user-online',
  USER_OFFLINE: 'presence:user-offline',
  USER_STATUS_CHANGED: 'presence:status-changed',
  USER_JOINED_WORKSPACE: 'presence:joined-workspace',
  USER_LEFT_WORKSPACE: 'presence:left-workspace',
  TYPING_START: 'presence:typing-start',
  TYPING_STOP: 'presence:typing-stop',
  PRESENCE_UPDATE: 'presence:update',
};

// ============================================================================
// User Presence Management
// ============================================================================

/**
 * Mark user as online when they connect
 *
 * @param {string} userId - User ID
 * @param {string} socketId - Socket ID
 * @param {Object} userInfo - User information (name, email)
 */
export function userConnected(userId, socketId, userInfo = {}) {
  const existing = userPresence.get(userId);

  if (existing) {
    existing.socketIds.add(socketId);
    existing.lastSeen = new Date();
  } else {
    userPresence.set(userId, {
      status: UserStatus.ONLINE,
      socketIds: new Set([socketId]),
      lastSeen: new Date(),
      connectedAt: new Date(),
      name: userInfo.name || 'Unknown',
      email: userInfo.email,
    });
  }

  logger.debug('User connected', {
    service: 'presence',
    userId,
    socketId,
    totalConnections: userPresence.get(userId)?.socketIds.size,
  });
}

/**
 * Mark user as offline when they disconnect
 *
 * @param {string} userId - User ID
 * @param {string} socketId - Socket ID
 * @returns {boolean} True if user is fully offline (no more connections)
 */
export function userDisconnected(userId, socketId) {
  const presence = userPresence.get(userId);
  if (!presence) return true;

  presence.socketIds.delete(socketId);
  presence.lastSeen = new Date();

  // If no more connections, mark as offline
  if (presence.socketIds.size === 0) {
    presence.status = UserStatus.OFFLINE;

    // Remove from all workspaces
    const workspaces = userWorkspaces.get(userId);
    if (workspaces) {
      for (const workspaceId of workspaces) {
        leaveWorkspace(userId, workspaceId);
      }
      userWorkspaces.delete(userId);
    }

    logger.debug('User went offline', {
      service: 'presence',
      userId,
    });

    return true;
  }

  return false;
}

/**
 * Update user status
 *
 * @param {string} userId - User ID
 * @param {string} status - New status
 */
export function updateUserStatus(userId, status) {
  const presence = userPresence.get(userId);
  if (!presence) return;

  const oldStatus = presence.status;
  presence.status = status;
  presence.lastSeen = new Date();

  // Notify all workspaces user is in
  const workspaces = userWorkspaces.get(userId);
  if (workspaces) {
    for (const workspaceId of workspaces) {
      emitToWorkspace(workspaceId, PresenceEventTypes.USER_STATUS_CHANGED, {
        userId,
        oldStatus,
        newStatus: status,
        timestamp: new Date().toISOString(),
      });
    }
  }

  logger.debug('User status updated', {
    service: 'presence',
    userId,
    oldStatus,
    newStatus: status,
  });
}

/**
 * Check if user is online
 *
 * @param {string} userId - User ID
 * @returns {boolean}
 */
export function isUserOnline(userId) {
  const presence = userPresence.get(userId);
  return presence?.status === UserStatus.ONLINE || presence?.status === UserStatus.AWAY;
}

/**
 * Get user's presence info
 *
 * @param {string} userId - User ID
 * @returns {Object|null}
 */
export function getUserPresence(userId) {
  const presence = userPresence.get(userId);
  if (!presence) return null;

  return {
    userId,
    status: presence.status,
    lastSeen: presence.lastSeen,
    connectedAt: presence.connectedAt,
    name: presence.name,
  };
}

// ============================================================================
// Workspace Presence Management
// ============================================================================

/**
 * User joins a workspace (starts viewing it)
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 * @param {Object} userInfo - User information
 */
export async function joinWorkspace(userId, workspaceId, userInfo = {}) {
  // Track user -> workspaces
  if (!userWorkspaces.has(userId)) {
    userWorkspaces.set(userId, new Set());
  }
  userWorkspaces.get(userId).add(workspaceId);

  // Track workspace -> users
  if (!workspacePresence.has(workspaceId)) {
    workspacePresence.set(workspaceId, new Map());
  }

  const presence = userPresence.get(userId);
  workspacePresence.get(workspaceId).set(userId, {
    userId,
    name: userInfo.name || presence?.name || 'Unknown',
    email: userInfo.email || presence?.email,
    status: presence?.status || UserStatus.ONLINE,
    joinedAt: new Date(),
  });

  // Notify workspace members
  emitToWorkspace(workspaceId, PresenceEventTypes.USER_JOINED_WORKSPACE, {
    userId,
    name: userInfo.name || presence?.name,
    status: presence?.status || UserStatus.ONLINE,
    timestamp: new Date().toISOString(),
    onlineCount: workspacePresence.get(workspaceId).size,
  });

  logger.debug('User joined workspace', {
    service: 'presence',
    userId,
    workspaceId,
    onlineCount: workspacePresence.get(workspaceId).size,
  });
}

/**
 * User leaves a workspace (stops viewing it)
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 */
export function leaveWorkspace(userId, workspaceId) {
  // Remove from user -> workspaces
  const workspaces = userWorkspaces.get(userId);
  if (workspaces) {
    workspaces.delete(workspaceId);
  }

  // Remove from workspace -> users
  const users = workspacePresence.get(workspaceId);
  const userInfo = users?.get(userId);
  if (users) {
    users.delete(userId);

    // Notify remaining workspace members
    emitToWorkspace(workspaceId, PresenceEventTypes.USER_LEFT_WORKSPACE, {
      userId,
      name: userInfo?.name,
      timestamp: new Date().toISOString(),
      onlineCount: users.size,
    });

    // Clean up empty workspace presence
    if (users.size === 0) {
      workspacePresence.delete(workspaceId);
    }
  }

  logger.debug('User left workspace', {
    service: 'presence',
    userId,
    workspaceId,
  });
}

/**
 * Get online users in a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {Object} Online users info
 */
export function getWorkspacePresence(workspaceId) {
  const users = workspacePresence.get(workspaceId);
  if (!users) {
    return {
      workspaceId,
      onlineCount: 0,
      users: [],
    };
  }

  const onlineUsers = Array.from(users.values()).map((user) => ({
    userId: user.userId,
    name: user.name,
    status: user.status,
    joinedAt: user.joinedAt,
  }));

  return {
    workspaceId,
    onlineCount: onlineUsers.length,
    users: onlineUsers,
  };
}

/**
 * Get online count for a workspace
 *
 * @param {string} workspaceId - Workspace ID
 * @returns {number}
 */
export function getWorkspaceOnlineCount(workspaceId) {
  return workspacePresence.get(workspaceId)?.size || 0;
}

/**
 * Get all workspaces a user is currently viewing
 *
 * @param {string} userId - User ID
 * @returns {string[]} Workspace IDs
 */
export function getUserWorkspaces(userId) {
  const workspaces = userWorkspaces.get(userId);
  return workspaces ? Array.from(workspaces) : [];
}

// ============================================================================
// Typing Indicators
// ============================================================================

// Map of workspaceId -> Map of conversationId -> Set of userIds typing
const typingUsers = new Map();

/**
 * User started typing in a conversation
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 * @param {string} conversationId - Conversation ID
 * @param {string} userName - User's name
 */
export function startTyping(userId, workspaceId, conversationId, userName) {
  if (!typingUsers.has(workspaceId)) {
    typingUsers.set(workspaceId, new Map());
  }
  if (!typingUsers.get(workspaceId).has(conversationId)) {
    typingUsers.get(workspaceId).set(conversationId, new Map());
  }

  typingUsers.get(workspaceId).get(conversationId).set(userId, {
    userId,
    name: userName,
    startedAt: new Date(),
  });

  // Notify workspace
  emitToWorkspace(workspaceId, PresenceEventTypes.TYPING_START, {
    userId,
    name: userName,
    conversationId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * User stopped typing in a conversation
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 * @param {string} conversationId - Conversation ID
 */
export function stopTyping(userId, workspaceId, conversationId) {
  const workspace = typingUsers.get(workspaceId);
  if (!workspace) return;

  const conversation = workspace.get(conversationId);
  if (!conversation) return;

  const userInfo = conversation.get(userId);
  conversation.delete(userId);

  // Notify workspace
  emitToWorkspace(workspaceId, PresenceEventTypes.TYPING_STOP, {
    userId,
    name: userInfo?.name,
    conversationId,
    timestamp: new Date().toISOString(),
  });

  // Cleanup empty maps
  if (conversation.size === 0) {
    workspace.delete(conversationId);
  }
  if (workspace.size === 0) {
    typingUsers.delete(workspaceId);
  }
}

/**
 * Get users currently typing in a conversation
 *
 * @param {string} workspaceId - Workspace ID
 * @param {string} conversationId - Conversation ID
 * @returns {Array}
 */
export function getTypingUsers(workspaceId, conversationId) {
  const workspace = typingUsers.get(workspaceId);
  if (!workspace) return [];

  const conversation = workspace.get(conversationId);
  if (!conversation) return [];

  return Array.from(conversation.values());
}

// ============================================================================
// Cleanup & Utilities
// ============================================================================

/**
 * Clean up stale presence data
 * Call periodically to remove users who disconnected without proper cleanup
 */
export function cleanupStalePresence() {
  const staleThreshold = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, presence] of userPresence.entries()) {
    if (presence.socketIds.size === 0) {
      const lastSeenMs = now - new Date(presence.lastSeen).getTime();
      if (lastSeenMs > staleThreshold) {
        userPresence.delete(userId);
        userWorkspaces.delete(userId);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    logger.info('Cleaned up stale presence data', {
      service: 'presence',
      cleanedUsers: cleaned,
    });
  }
}

/**
 * Get global presence statistics
 *
 * @returns {Object}
 */
export function getPresenceStats() {
  let totalOnline = 0;
  let totalAway = 0;

  for (const presence of userPresence.values()) {
    if (presence.status === UserStatus.ONLINE) totalOnline++;
    if (presence.status === UserStatus.AWAY) totalAway++;
  }

  return {
    totalOnline,
    totalAway,
    totalConnected: userPresence.size,
    activeWorkspaces: workspacePresence.size,
  };
}

/**
 * Broadcast current presence to a specific user
 * Used when user first connects to sync state
 *
 * @param {string} userId - User ID
 * @param {string} workspaceId - Workspace ID
 */
export function syncPresenceToUser(userId, workspaceId) {
  const presence = getWorkspacePresence(workspaceId);

  emitToUser(userId, PresenceEventTypes.PRESENCE_UPDATE, {
    workspaceId,
    ...presence,
    timestamp: new Date().toISOString(),
  });
}

// Start periodic cleanup
setInterval(cleanupStalePresence, 60 * 1000); // Every minute

// Export service
export const presenceService = {
  UserStatus,
  PresenceEventTypes,
  // User presence
  userConnected,
  userDisconnected,
  updateUserStatus,
  isUserOnline,
  getUserPresence,
  // Workspace presence
  joinWorkspace,
  leaveWorkspace,
  getWorkspacePresence,
  getWorkspaceOnlineCount,
  getUserWorkspaces,
  // Typing
  startTyping,
  stopTyping,
  getTypingUsers,
  // Utilities
  cleanupStalePresence,
  getPresenceStats,
  syncPresenceToUser,
};

export default presenceService;
