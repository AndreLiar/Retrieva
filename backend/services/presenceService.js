/**
 * Presence Service — Monolith Proxy
 *
 * When REALTIME_SERVICE_URL is set, presence state is owned by the standalone
 * realtime-service which writes it to Redis.  This file becomes read-only:
 *   - All write functions are no-ops (state is managed by realtime-service)
 *   - Read functions query the Redis presence keys written by realtime-service
 *
 * When REALTIME_SERVICE_URL is NOT set (local dev), the original in-process
 * implementation using in-memory Maps is used as a fallback.
 *
 * Redis presence keys (written by realtime-service, read here):
 *   HASH  presence:user:{userId}                  — {status, lastSeen, name}
 *   HASH  presence:workspace:{workspaceId}:members — {userId: json}
 *   HASH  presence:typing:{workspaceId}:{convId}   — {userId: json}
 *
 * @module services/presenceService
 */

import { emitToWorkspace, emitToUser } from './socketService.js';
import { redisConnection } from '../config/redis.js';
import logger from '../config/logger.js';

const REALTIME_SERVICE_URL = process.env.REALTIME_SERVICE_URL;

// ---------------------------------------------------------------------------
// Enums (exported — same values in both paths)
// ---------------------------------------------------------------------------

export const UserStatus = {
  ONLINE: 'online',
  AWAY: 'away',
  BUSY: 'busy',
  OFFLINE: 'offline',
};

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

// ---------------------------------------------------------------------------
// Remote path — Redis read-only
// (Write functions are no-ops: realtime-service owns the state)
// ---------------------------------------------------------------------------

const remote = {
  // Write no-ops
  userConnected: () => {},
  userDisconnected: () => true,
  updateUserStatus: () => {},
  joinWorkspace: async () => {},
  leaveWorkspace: () => {},
  startTyping: () => {},
  stopTyping: () => {},
  syncPresenceToUser: () => {},
  cleanupStalePresence: () => {},

  // Read from Redis
  async isUserOnline(userId) {
    try {
      const status = await redisConnection.hget(`presence:user:${userId}`, 'status');
      return status === 'online' || status === 'away';
    } catch {
      return false;
    }
  },

  async getUserPresence(userId) {
    try {
      const data = await redisConnection.hgetall(`presence:user:${userId}`);
      if (!data) return null;
      return { userId, status: data.status, lastSeen: data.lastSeen, name: data.name };
    } catch {
      return null;
    }
  },

  async getWorkspacePresence(workspaceId) {
    try {
      const members = await redisConnection.hgetall(`presence:workspace:${workspaceId}:members`);
      if (!members) return { workspaceId, onlineCount: 0, users: [] };
      const users = Object.values(members)
        .map((v) => {
          try {
            return JSON.parse(v);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return { workspaceId, onlineCount: users.length, users };
    } catch {
      return { workspaceId, onlineCount: 0, users: [] };
    }
  },

  async getWorkspaceOnlineCount(workspaceId) {
    try {
      return await redisConnection.hlen(`presence:workspace:${workspaceId}:members`);
    } catch {
      return 0;
    }
  },

  getUserWorkspaces: async () => [],

  async getTypingUsers(workspaceId, conversationId) {
    try {
      const data = await redisConnection.hgetall(
        `presence:typing:${workspaceId}:${conversationId}`
      );
      if (!data) return [];
      return Object.values(data)
        .map((v) => {
          try {
            return JSON.parse(v);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  },

  async getPresenceStats() {
    try {
      const userKeys = await redisConnection.keys('presence:user:*');
      let online = 0;
      let away = 0;
      for (const key of userKeys) {
        const status = await redisConnection.hget(key, 'status');
        if (status === 'online') online++;
        else if (status === 'away') away++;
      }
      const wsKeys = await redisConnection.keys('presence:workspace:*:members');
      return {
        totalOnline: online,
        totalAway: away,
        totalConnected: online + away,
        activeWorkspaces: wsKeys.length,
      };
    } catch {
      return { totalOnline: 0, totalAway: 0, totalConnected: 0, activeWorkspaces: 0 };
    }
  },
};

// ---------------------------------------------------------------------------
// Local path — in-process in-memory Maps (no docker-compose required)
// ---------------------------------------------------------------------------

const userWorkspaces = new Map();
const workspacePresence = new Map();
const userPresence = new Map();
const typingUsers = new Map();

export function userConnected(userId, socketId, userInfo = {}) {
  if (REALTIME_SERVICE_URL) return remote.userConnected();
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
}

export function userDisconnected(userId, socketId) {
  if (REALTIME_SERVICE_URL) return remote.userDisconnected();
  const presence = userPresence.get(userId);
  if (!presence) return true;

  presence.socketIds.delete(socketId);
  presence.lastSeen = new Date();

  if (presence.socketIds.size === 0) {
    presence.status = UserStatus.OFFLINE;
    const workspaces = userWorkspaces.get(userId);
    if (workspaces) {
      for (const wsId of workspaces) leaveWorkspace(userId, wsId);
      userWorkspaces.delete(userId);
    }
    return true;
  }
  return false;
}

export function updateUserStatus(userId, status) {
  if (REALTIME_SERVICE_URL) return remote.updateUserStatus();
  const presence = userPresence.get(userId);
  if (!presence) return;
  const oldStatus = presence.status;
  presence.status = status;
  presence.lastSeen = new Date();
  const workspaces = userWorkspaces.get(userId);
  if (workspaces) {
    for (const wsId of workspaces) {
      emitToWorkspace(wsId, PresenceEventTypes.USER_STATUS_CHANGED, {
        userId,
        oldStatus,
        newStatus: status,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export function isUserOnline(userId) {
  if (REALTIME_SERVICE_URL) return remote.isUserOnline(userId);
  const presence = userPresence.get(userId);
  return presence?.status === UserStatus.ONLINE || presence?.status === UserStatus.AWAY;
}

export function getUserPresence(userId) {
  if (REALTIME_SERVICE_URL) return remote.getUserPresence(userId);
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

export async function joinWorkspace(userId, workspaceId, userInfo = {}) {
  if (REALTIME_SERVICE_URL) return remote.joinWorkspace();
  if (!userWorkspaces.has(userId)) userWorkspaces.set(userId, new Set());
  userWorkspaces.get(userId).add(workspaceId);

  if (!workspacePresence.has(workspaceId)) workspacePresence.set(workspaceId, new Map());

  const presence = userPresence.get(userId);
  workspacePresence.get(workspaceId).set(userId, {
    userId,
    name: userInfo.name || presence?.name || 'Unknown',
    email: userInfo.email || presence?.email,
    status: presence?.status || UserStatus.ONLINE,
    joinedAt: new Date(),
  });

  emitToWorkspace(workspaceId, PresenceEventTypes.USER_JOINED_WORKSPACE, {
    userId,
    name: userInfo.name || presence?.name,
    status: presence?.status || UserStatus.ONLINE,
    timestamp: new Date().toISOString(),
    onlineCount: workspacePresence.get(workspaceId).size,
  });
}

export function leaveWorkspace(userId, workspaceId) {
  if (REALTIME_SERVICE_URL) return remote.leaveWorkspace();
  const workspaces = userWorkspaces.get(userId);
  if (workspaces) workspaces.delete(workspaceId);

  const users = workspacePresence.get(workspaceId);
  const userInfo = users?.get(userId);
  if (users) {
    users.delete(userId);
    emitToWorkspace(workspaceId, PresenceEventTypes.USER_LEFT_WORKSPACE, {
      userId,
      name: userInfo?.name,
      timestamp: new Date().toISOString(),
      onlineCount: users.size,
    });
    if (users.size === 0) workspacePresence.delete(workspaceId);
  }
}

export function getWorkspacePresence(workspaceId) {
  if (REALTIME_SERVICE_URL) return remote.getWorkspacePresence(workspaceId);
  const users = workspacePresence.get(workspaceId);
  if (!users) return { workspaceId, onlineCount: 0, users: [] };
  const onlineUsers = Array.from(users.values()).map((u) => ({
    userId: u.userId,
    name: u.name,
    status: u.status,
    joinedAt: u.joinedAt,
  }));
  return { workspaceId, onlineCount: onlineUsers.length, users: onlineUsers };
}

export function getWorkspaceOnlineCount(workspaceId) {
  if (REALTIME_SERVICE_URL) return remote.getWorkspaceOnlineCount(workspaceId);
  return workspacePresence.get(workspaceId)?.size || 0;
}

export function getUserWorkspaces(userId) {
  if (REALTIME_SERVICE_URL) return remote.getUserWorkspaces(userId);
  const workspaces = userWorkspaces.get(userId);
  return workspaces ? Array.from(workspaces) : [];
}

export function startTyping(userId, workspaceId, conversationId, userName) {
  if (REALTIME_SERVICE_URL) return remote.startTyping();
  if (!typingUsers.has(workspaceId)) typingUsers.set(workspaceId, new Map());
  if (!typingUsers.get(workspaceId).has(conversationId)) {
    typingUsers.get(workspaceId).set(conversationId, new Map());
  }
  typingUsers.get(workspaceId).get(conversationId).set(userId, {
    userId,
    name: userName,
    startedAt: new Date(),
  });
  emitToWorkspace(workspaceId, PresenceEventTypes.TYPING_START, {
    userId,
    name: userName,
    conversationId,
    timestamp: new Date().toISOString(),
  });
}

export function stopTyping(userId, workspaceId, conversationId) {
  if (REALTIME_SERVICE_URL) return remote.stopTyping();
  const workspace = typingUsers.get(workspaceId);
  if (!workspace) return;
  const conversation = workspace.get(conversationId);
  if (!conversation) return;
  const userInfo = conversation.get(userId);
  conversation.delete(userId);
  emitToWorkspace(workspaceId, PresenceEventTypes.TYPING_STOP, {
    userId,
    name: userInfo?.name,
    conversationId,
    timestamp: new Date().toISOString(),
  });
  if (conversation.size === 0) workspace.delete(conversationId);
  if (workspace.size === 0) typingUsers.delete(workspaceId);
}

export function getTypingUsers(workspaceId, conversationId) {
  if (REALTIME_SERVICE_URL) return remote.getTypingUsers(workspaceId, conversationId);
  const workspace = typingUsers.get(workspaceId);
  if (!workspace) return [];
  const conversation = workspace.get(conversationId);
  if (!conversation) return [];
  return Array.from(conversation.values());
}

export function cleanupStalePresence() {
  if (REALTIME_SERVICE_URL) return remote.cleanupStalePresence();
  const staleThreshold = 5 * 60 * 1000;
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
    logger.info('Cleaned up stale presence data', { service: 'presence', cleanedUsers: cleaned });
  }
}

export function getPresenceStats() {
  if (REALTIME_SERVICE_URL) return remote.getPresenceStats();
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

export function syncPresenceToUser(userId, workspaceId) {
  if (REALTIME_SERVICE_URL) return remote.syncPresenceToUser();
  const presence = getWorkspacePresence(workspaceId);
  emitToUser(userId, PresenceEventTypes.PRESENCE_UPDATE, {
    workspaceId,
    ...presence,
    timestamp: new Date().toISOString(),
  });
}

// Periodic cleanup (local path only)
setInterval(cleanupStalePresence, 60 * 1000);

export const presenceService = {
  UserStatus,
  PresenceEventTypes,
  userConnected,
  userDisconnected,
  updateUserStatus,
  isUserOnline,
  getUserPresence,
  joinWorkspace,
  leaveWorkspace,
  getWorkspacePresence,
  getWorkspaceOnlineCount,
  getUserWorkspaces,
  startTyping,
  stopTyping,
  getTypingUsers,
  cleanupStalePresence,
  getPresenceStats,
  syncPresenceToUser,
};

export default presenceService;
